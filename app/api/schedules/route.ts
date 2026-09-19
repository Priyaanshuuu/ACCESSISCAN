import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { scheduleJobId, scheduleQueue } from "@/lib/schedule-queue";

function nextRun(frequency: "DAILY" | "WEEKLY") {
  const date = new Date();
  date.setDate(date.getDate() + (frequency === "DAILY" ? 1 : 7));
  return date;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const schedules = await prisma.scheduledScan.findMany({
    include: { site: true },
    orderBy: { nextRunAt: "asc" },
    where: { user: { clerkId: user.id } },
  });
  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { frequency?: "DAILY" | "WEEKLY"; siteId?: string };
  if (!body.siteId || !body.frequency || !["DAILY", "WEEKLY"].includes(body.frequency)) {
    return NextResponse.json({ error: "A site and frequency are required." }, { status: 400 });
  }

  const site = await prisma.site.findFirst({ where: { id: body.siteId, user: { clerkId: user.id } } });
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const schedule = await prisma.scheduledScan.upsert({
    create: { frequency: body.frequency, nextRunAt: nextRun(body.frequency), siteId: site.id, userId: site.userId },
    update: { enabled: true, frequency: body.frequency, nextRunAt: nextRun(body.frequency) },
    where: { userId_siteId: { siteId: site.id, userId: site.userId } },
  });

  await scheduleQueue.add("scheduled-scan", { scheduleId: schedule.id }, {
    jobId: scheduleJobId(schedule.id),
    repeat: { pattern: body.frequency === "DAILY" ? "0 9 * * *" : "0 9 * * 1" },
  });
  return NextResponse.json({ schedule }, { status: 201 });
}