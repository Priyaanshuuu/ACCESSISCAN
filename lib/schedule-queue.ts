import { Queue } from "bullmq";

import { redisConnection } from "@/lib/queue";

export type ScheduledScanJob = { scheduleId: string };

export const scheduleQueue = new Queue<ScheduledScanJob>("scheduled-scan", {
  connection: redisConnection,
});

export function scheduleJobId(scheduleId: string) {
  return `scheduled-scan:${scheduleId}`;
}