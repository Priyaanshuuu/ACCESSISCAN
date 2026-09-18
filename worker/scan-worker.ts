import "dotenv/config";

import { Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import type { ScanJob } from "@/lib/queue";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const parsedRedisUrl = new URL(redisUrl);

const workerConnection = {
  host: parsedRedisUrl.hostname,
  maxRetriesPerRequest: null,
  password: parsedRedisUrl.password || undefined,
  port: Number(parsedRedisUrl.port || 6379),
};

const worker = new Worker<ScanJob>(
  "scan",
  async (job) => {
    const scan = await prisma.scan.findUnique({
      where: { id: job.data.scanId },
    });

    if (!scan) {
      throw new Error(`Scan ${job.data.scanId} was not found.`);
    }

    await prisma.scan.update({
      data: { status: "RUNNING" },
      where: { id: scan.id },
    });

    console.log(`[scan-worker] processing ${scan.id} for ${job.data.url}`);

    // Step 8 adds Playwright navigation and real website processing here.
    await prisma.scan.update({
      data: {
        completedAt: new Date(),
        status: "COMPLETED",
      },
      where: { id: scan.id },
    });

    return { scanId: scan.id, status: "completed" };
  },
  {
    connection: workerConnection,
    concurrency: 1,
  },
);

worker.on("completed", (job) => {
  console.log(`[scan-worker] completed job ${job.id}`);
});

worker.on("failed", async (job, error) => {
  if (!job) {
    console.error("[scan-worker] job failed before it was available", error);
    return;
  }

  console.error(`[scan-worker] failed job ${job.id}: ${error.message}`);

  await prisma.scan.updateMany({
    data: { status: "FAILED" },
    where: { id: job.data.scanId },
  });
});

async function shutdown(signal: string) {
  console.log(`[scan-worker] received ${signal}, shutting down`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[scan-worker] listening on the scan queue");