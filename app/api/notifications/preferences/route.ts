import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

async function getDatabaseUser() {
  const user = await currentUser();
  if (!user) return null;
  return prisma.user.upsert({
    create: { clerkId: user.id, email: user.emailAddresses[0]?.emailAddress ?? null },
    update: { email: user.emailAddresses[0]?.emailAddress ?? null },
    where: { clerkId: user.id },
  });
}

export async function GET() {
  const user = await getDatabaseUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const preferences = await getOrCreatePreferences(user.id);
  return NextResponse.json({ preferences });
}

export async function PATCH(request: Request) {
  const user = await getDatabaseUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { emailEnabled?: boolean; notifyOnRegression?: boolean };
  await getOrCreatePreferences(user.id);
  const preferences = await prisma.notificationPreference.update({
    data: { emailEnabled: body.emailEnabled, notifyOnRegression: body.notifyOnRegression },
    where: { userId: user.id },
  });
  return NextResponse.json({ preferences });
}

async function getOrCreatePreferences(userId: string) {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;

  try {
    return await prisma.notificationPreference.create({ data: { userId } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const createdByConcurrentRequest = await prisma.notificationPreference.findUnique({
        where: { userId },
      });
      if (createdByConcurrentRequest) return createdByConcurrentRequest;
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}