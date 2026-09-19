import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { scanQueue } from "@/lib/queue";
import { consumeScanRateLimit, releaseScanSlot, reserveScanSlot } from "@/lib/rate-limit";
import { assertPublicUrl } from "@/lib/url-safety";

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

  try {
    const databaseUser = user
      ? await prisma.user.upsert({
          create: { clerkId: user.id, email: user.emailAddresses[0]?.emailAddress ?? null },
          update: { email: user.emailAddresses[0]?.emailAddress ?? null },
          where: { clerkId: user.id },
        })
      : null;
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
      },
    });

    try {
      await scanQueue.add("scan-website", {
        identity,
        scanId: scan.id,
        url: scan.url,
      }, { timeout: 300_000 });
    } catch {
      await releaseScanSlot(identity);
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
    await releaseScanSlot(identity);
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