import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { scanQueue } from "@/lib/queue";

function isValidWebsiteUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to start a scan." }, { status: 401 });
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

  if (!isValidWebsiteUrl(url)) {
    return NextResponse.json(
      { error: "A valid public website URL is required." },
      { status: 400 },
    );
  }

  try {
    const email = user.emailAddresses[0]?.emailAddress ?? null;
    const databaseUser = await prisma.user.upsert({
      create: { clerkId: user.id, email },
      update: { email },
      where: { clerkId: user.id },
    });
    const scan = await prisma.scan.create({
      data: {
        id: `scan_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        url: url.trim(),
        userId: databaseUser.id,
      },
    });

    try {
      await scanQueue.add("scan-website", {
        scanId: scan.id,
        url: scan.url,
      });
    } catch {
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