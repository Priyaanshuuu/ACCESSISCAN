import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { encryptBrowserState, validatePlaywrightStorageState } from "@/lib/browser-state-crypto";
import { hasPaidPlan } from "@/lib/plan-limits";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const databaseUser = await getPaidDatabaseUser(user.id);
  if (!databaseUser) return upgradeRequired();
  await prisma.browserState.deleteMany({
    where: { expiresAt: { lt: new Date() }, userId: databaseUser.id },
  });
  const states = await prisma.browserState.findMany({
    select: { createdAt: true, expiresAt: true, id: true, label: true },
    where: { userId: databaseUser.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ states });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const databaseUser = await getPaidDatabaseUser(user.id);
  if (!databaseUser) return upgradeRequired();
  const body = (await request.json()) as {
    expiresAt?: string;
    kind?: "storage_state" | "manual_handoff";
    label?: string;
    manualNotes?: string;
    state?: unknown;
  };

  if (!body.label || body.label.trim().length === 0) {
    return NextResponse.json({ error: "A session label is required." }, { status: 400 });
  }

  const kind = body.kind === "manual_handoff" ? "manual_handoff" : "storage_state";

  if (kind === "manual_handoff") {
    const state = await prisma.browserState.create({
      data: {
        ciphertext: encryptBrowserState({
          manualHandoff: true,
          notes: body.manualNotes || "Manual secure handoff required for MFA/CAPTCHA-protected flow.",
        }),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        kind,
        label: body.label.slice(0, 100),
        manualNotes: body.manualNotes?.slice(0, 2000) || "Manual secure handoff required for MFA/CAPTCHA-protected flow.",
        requiresManualHandoff: true,
        userId: databaseUser.id,
      },
      select: { createdAt: true, expiresAt: true, id: true, kind: true, label: true, manualNotes: true, requiresManualHandoff: true },
    });
    return NextResponse.json({ state }, { status: 201 });
  }

  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "A label and Playwright storage state are required." }, { status: 400 });
  }

  if (!validatePlaywrightStorageState(body.state)) {
    return NextResponse.json({
      error: "Invalid session file. Upload a Playwright storage-state JSON with cookies and/or origins.",
    }, { status: 400 });
  }

  const state = await prisma.browserState.create({
    data: {
      ciphertext: encryptBrowserState(body.state),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      kind,
      label: body.label.slice(0, 100),
      userId: databaseUser.id,
    },
    select: { createdAt: true, expiresAt: true, id: true, kind: true, label: true, manualNotes: true, requiresManualHandoff: true },
  });
  return NextResponse.json({ state }, { status: 201 });
}

async function getPaidDatabaseUser(clerkId: string) {
  const databaseUser = await prisma.user.findUnique({ where: { clerkId } });
  return databaseUser && hasPaidPlan(databaseUser.plan) ? databaseUser : null;
}

function upgradeRequired() {
  return NextResponse.json(
    { error: "Upgrade to a paid plan to use authenticated browser sessions." },
    { status: 403 },
  );
}
