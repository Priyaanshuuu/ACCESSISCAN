import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { encryptBrowserState } from "@/lib/browser-state-crypto";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  await prisma.browserState.deleteMany({
    where: { expiresAt: { lt: new Date() }, user: { clerkId: user.id } },
  });
  const states = await prisma.browserState.findMany({
    select: { createdAt: true, expiresAt: true, id: true, label: true },
    where: { user: { clerkId: user.id } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ states });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { expiresAt?: string; label?: string; state?: unknown };
  if (!body.label || !body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "A label and Playwright storage state are required." }, { status: 400 });
  }

  if (!validatePlaywrightStorageState(body.state)) {
    return NextResponse.json({
      error: "Invalid session file. Upload a Playwright storage-state JSON with cookies and/or origins.",
    }, { status: 400 });
  }

  const databaseUser = await prisma.user.findUnique({ where: { clerkId: user.id } });
  if (!databaseUser) return NextResponse.json({ error: "User profile is not ready." }, { status: 409 });
  const state = await prisma.browserState.create({
    data: {
      ciphertext: encryptBrowserState(body.state),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      label: body.label.slice(0, 100),
      userId: databaseUser.id,
    },
    select: { createdAt: true, expiresAt: true, id: true, label: true },
  });
  return NextResponse.json({ state }, { status: 201 });
}

import { validatePlaywrightStorageState } from "@/lib/browser-state-crypto";