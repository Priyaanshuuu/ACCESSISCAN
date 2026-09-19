import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ scheduleId: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { scheduleId } = await params;
  const body = (await request.json()) as { enabled?: boolean };
  const result = await prisma.scheduledScan.updateMany({ data: { enabled: body.enabled === true }, where: { id: scheduleId, user: { clerkId: user.id } } });
  return result.count ? NextResponse.json({ enabled: body.enabled === true }) : NextResponse.json({ error: "Schedule not found." }, { status: 404 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { scheduleId } = await params;
  await prisma.scheduledScan.deleteMany({ where: { id: scheduleId, user: { clerkId: user.id } } });
  return new NextResponse(null, { status: 204 });
}