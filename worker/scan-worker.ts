import "dotenv/config";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AxeResults } from "axe-core";
import { Worker } from "bullmq";
import { chromium } from "playwright";

import { prisma } from "@/lib/prisma";
import type { ScanJob } from "@/lib/queue";

type AxeWindow = Window & {
  axe: {
    run: () => Promise<AxeResults>;
  };
};

type LighthouseResult = {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, { score: number | null; numericValue?: number; displayValue?: string }>;
};

const execFileAsync = promisify(execFile);

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

    const startedAt = Date.now();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const response = await page.goto(job.data.url, {
        timeout: 30_000,
        waitUntil: "domcontentloaded",
      });
      const pageTitle = await page.title();
      await page.addScriptTag({
        path: require.resolve("axe-core/axe.min.js"),
      });
      const axeResults = await page.evaluate(() =>
        (window as unknown as AxeWindow).axe.run(),
      );

      await prisma.issue.deleteMany({
        where: { scanId: scan.id },
      });
      await prisma.issue.createMany({
        data: axeResults.violations.map((violation) => ({
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          html: violation.nodes[0]?.html ?? null,
          impact: violation.impact,
          rule: violation.id,
          scanId: scan.id,
          tags: violation.tags,
          targets: violation.nodes.map((node) => node.target),
        })),
      });

      const lighthouseResult = await runLighthouse(page.url());

      const audits = lighthouseResult?.audits || {};
      const categories = lighthouseResult?.categories || {};

      await prisma.scan.update({
        data: {
          bestPracticesScore: toScore(categories["best-practices"]?.score),
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          finalUrl: page.url(),
          httpStatus: response?.status() ?? null,
          lighthouseAudits: {
            accessibility: pickAudit(audits, "accessibility", "accessibilityScore"),
            categories: Object.fromEntries(
              Object.entries(categories).map(([key, value]) => [key, value.score]),
            ),
            seo: pickAudit(audits, "document-title", "meta-description", "http-status-code"),
          },
          lighthouseMetrics: pickAudit(audits, "largest-contentful-paint", "cumulative-layout-shift", "first-contentful-paint", "total-blocking-time"),
          pageTitle,
          performanceScore: toScore(categories.performance?.score),
          seoScore: toScore(categories.seo?.score),
          status: "COMPLETED",
        },
        where: { id: scan.id },
      });
    } finally {
      await browser.close();
    }

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

function toScore(value: number | null | undefined) {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function pickAudit(
  audits: Record<string, { score: number | null; numericValue?: number; displayValue?: string }>,
  ...keys: string[]
) {
  return Object.fromEntries(
    keys
      .filter((key) => audits[key])
      .map((key) => [key, audits[key]]),
  );
}

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

async function runLighthouse(url: string) {
  const lighthouseCli = require.resolve("lighthouse/cli/index.js");
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      lighthouseCli,
      url,
      "--output=json",
      "--output-path=stdout",
      "--only-categories=performance,seo,best-practices",
      "--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage",
      "--quiet",
    ],
    { maxBuffer: 25 * 1024 * 1024 },
  );

  return JSON.parse(stdout) as LighthouseResult;
}