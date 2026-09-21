import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hasActiveAccess } from "@/lib/billing";
import { removeScheduledScanJob, syncScheduledScanJob } from "@/lib/schedule-queue";

type Props = { params: Promise<{ scheduleId: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const databaseUser = await getPaidDatabaseUser(user.id);
  if (!databaseUser) return upgradeRequired();
  const { scheduleId } = await params;
  const body = (await request.json()) as { enabled?: boolean };
  const schedule = await prisma.scheduledScan.findFirst({
    where: { id: scheduleId, userId: databaseUser.id },
  });
  if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });

  const enabled = body.enabled === true;
  const nextRunAt = enabled ? nextRun(schedule.frequency) : schedule.nextRunAt;
  const updated = await prisma.scheduledScan.update({
    data: { enabled, nextRunAt },
    where: { id: schedule.id },
  });

  if (enabled) {
    await syncScheduledScanJob({
      frequency: updated.frequency,
      nextRunAt: updated.nextRunAt,
      scheduleId: updated.id,
    });
  } else {
    await removeScheduledScanJob(updated.id);
  }

  return NextResponse.json({ enabled, schedule: updated });
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const databaseUser = await getPaidDatabaseUser(user.id);
  if (!databaseUser) return upgradeRequired();
  const { scheduleId } = await params;
  const result = await prisma.scheduledScan.deleteMany({ where: { id: scheduleId, userId: databaseUser.id } });
  if (!result.count) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  await removeScheduledScanJob(scheduleId);
  return new NextResponse(null, { status: 204 });
}

function nextRun(frequency: "DAILY" | "WEEKLY") {
  const date = new Date();
  date.setDate(date.getDate() + (frequency === "DAILY" ? 1 : 7));
  return date;
}

async function getPaidDatabaseUser(clerkId: string) {
  const databaseUser = await prisma.user.findUnique({ where: { clerkId } });
  return databaseUser && hasActiveAccess(databaseUser.schedulingAccessUntil) ? databaseUser : null;
}

function upgradeRequired() {
  return NextResponse.json(
    { error: "Email scheduling requires an active ₹250/month purchase." },
    { status: 403 },
  );
}
