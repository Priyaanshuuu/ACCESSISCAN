import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { scanQueue } from "@/lib/queue";
import { consumeScanRateLimit, releaseScanSlot, reserveScanSlot } from "@/lib/rate-limit";
import { assertPublicUrl } from "@/lib/url-safety";
import { planLimits } from "@/lib/plan-limits";

export async function POST(request: Request) {
  const user = await currentUser();
  const actionKey = request.headers.get("x-accessiscan-api-key");
  const isActionRequest = Boolean(
    actionKey && process.env.ACCESSISCAN_ACTION_API_KEY && actionKey === process.env.ACCESSISCAN_ACTION_API_KEY,
  );

  if (!user && !isActionRequest) {
    return NextResponse.json({ error: "Sign in to start a scan." }, { status: 401 });
  }

  const identity = user ? `user:${user.id}` : `action:${actionKey}`;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const url =
    typeof body === "object" && body !== null && "url" in body
      ? body.url
      : undefined;
  const browserStateId =
    typeof body === "object" && body !== null && "browserStateId" in body && typeof body.browserStateId === "string"
      ? body.browserStateId
      : undefined;

  if (typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json(
      { error: "A valid public website URL is required." },
      { status: 400 },
    );
  }

  let safeUrl: string;
  try {
    safeUrl = await assertPublicUrl(url);
  } catch {
    return NextResponse.json(
      { error: "That URL points to a private or unsupported destination." },
      { status: 400 },
    );
  }

  let slotReserved = false;
  async function releaseReservedSlot() {
    if (!slotReserved) return;
    slotReserved = false;
    await releaseScanSlot(identity);
  }

  try {
    const databaseUser = user
      ? await prisma.user.upsert({
          create: { clerkId: user.id, email: user.emailAddresses[0]?.emailAddress ?? null },
          update: { email: user.emailAddresses[0]?.emailAddress ?? null },
          where: { clerkId: user.id },
        })
      : null;
    const browserState = browserStateId && databaseUser
      ? await prisma.browserState.findFirst({ where: { id: browserStateId, userId: databaseUser.id } })
      : null;
    if (browserStateId && !browserState) {
      return NextResponse.json({ error: "Browser session not found." }, { status: 404 });
    }

    const rateLimit = await consumeScanRateLimit(identity, isActionRequest ? 30 : 10);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Scan limit reached. Please try again later." },
        { headers: { "Retry-After": String(rateLimit.retryAfter) }, status: 429 },
      );
    }

    const slot = await reserveScanSlot(identity, 2);
    if (!slot.allowed) {
      return NextResponse.json(
        { error: "Too many scans are already running for this identity." },
        { headers: { "Retry-After": "60" }, status: 429 },
      );
    }
    slotReserved = true;

    const limits = planLimits[databaseUser?.plan ?? "FREE"];
    if (databaseUser) {
      const period = new Date().toISOString().slice(0, 7);
      await prisma.usagePeriod.upsert({
        create: { period, scanCount: 1, userId: databaseUser.id },
        update: { scanCount: { increment: 1 } },
        where: { userId_period: { period, userId: databaseUser.id } },
      });
    }
    const site = databaseUser
      ? await prisma.site.upsert({
          create: { url: safeUrl, userId: databaseUser.id },
          update: {},
          where: { userId_url: { url: safeUrl, userId: databaseUser.id } },
        })
      : null;
    const scan = await prisma.scan.create({
      data: {
        id: `scan_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        url: safeUrl,
        userId: databaseUser?.id,
        siteId: site?.id,
        maxDepth: limits.maxDepth,
        maxPages: limits.maxPages,
        browserStateId: browserState?.id,
      },
    });

    try {
      await scanQueue.add("scan-website", {
        identity,
        maxDepth: scan.maxDepth,
        maxPages: scan.maxPages,
        browserStateId: scan.browserStateId ?? undefined,
        scanId: scan.id,
        url: scan.url,
      });
    } catch {
      await releaseReservedSlot();
      await prisma.scan.update({
        data: { status: "FAILED" },
        where: { id: scan.id },
      });

      return NextResponse.json(
        { error: "The scan queue is unavailable right now." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        scanId: scan.id,
        status: scan.status.toLowerCase(),
        url: scan.url,
      },
      { status: 201 },
    );
  } catch (error) {
    await releaseReservedSlot();
    console.error("[api/scans] failed to create scan", {
      code: error instanceof Error && "code" in error ? error.code : undefined,
      message: error instanceof Error ? error.message : "Unknown database error",
    });

    return NextResponse.json(
      { error: "Unable to create the scan right now." },
      { status: 503 },
    );
  }
}
