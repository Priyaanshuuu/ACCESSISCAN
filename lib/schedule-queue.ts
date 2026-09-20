import { Queue } from "bullmq";

import { redisConnection } from "@/lib/queue";

export type ScheduledScanJob = { scheduleId: string };
export type ScheduleFrequency = "DAILY" | "WEEKLY";

export const scheduleQueue = new Queue<ScheduledScanJob>("scheduled-scan", {
  connection: redisConnection,
});

export function scheduleJobId(scheduleId: string) {
  return `scheduled-scan:${scheduleId}`;
}

function intervalFor(frequency: ScheduleFrequency) {
  return frequency === "DAILY" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

export async function syncScheduledScanJob({
  frequency,
  nextRunAt,
  scheduleId,
}: {
  frequency: ScheduleFrequency;
  nextRunAt: Date;
  scheduleId: string;
}) {
  await scheduleQueue.upsertJobScheduler(
    scheduleJobId(scheduleId),
    { every: intervalFor(frequency), startDate: nextRunAt },
    {
      data: { scheduleId },
      name: "scheduled-scan",
      opts: { removeOnComplete: true, removeOnFail: 1000 },
    },
  );

  const legacyJob = await scheduleQueue.getJob(`scheduled-scan-${scheduleId}`);
  if (legacyJob) await legacyJob.remove();
}

export async function removeScheduledScanJob(scheduleId: string) {
  await scheduleQueue.removeJobScheduler(scheduleJobId(scheduleId));

  const legacyJob = await scheduleQueue.getJob(`scheduled-scan-${scheduleId}`);
  if (legacyJob) await legacyJob.remove();
}
