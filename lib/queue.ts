import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const parsedRedisUrl = new URL(redisUrl);

export const redisConnection = {
  host: parsedRedisUrl.hostname,
  password: parsedRedisUrl.password || undefined,
  port: Number(parsedRedisUrl.port || 6379),
};

export type ScanJob = {
  identity: string;
  maxDepth: number;
  maxPages: number;
  scanId: string;
  url: string;
};

export const scanQueue = new Queue<ScanJob>("scan", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      delay: 5000,
      type: "exponential",
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});