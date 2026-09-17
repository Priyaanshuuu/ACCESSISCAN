import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

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

  return NextResponse.json(
    {
      scanId: `scan_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      status: "queued",
      url: url.trim(),
    },
    { status: 201 },
  );
}