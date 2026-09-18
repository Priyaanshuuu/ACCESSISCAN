import "dotenv/config";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AxeResults } from "axe-core";
import { Worker } from "bullmq";
import { chromium } from "playwright";

import { prisma } from "@/lib/prisma";
import type { ScanJob } from "@/lib/queue";
import { assertPublicUrl } from "@/lib/url-safety";

type AxeWindow = Window & {
  axe: {
    run: () => Promise<AxeResults>;
  };
};

type LighthouseResult = {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, { score: number | null; numericValue?: number; displayValue?: string }>;
};

const fixTemplates: Record<string, { fix: string; recommendation: string }> = {
  "button-name": {
    fix: "Add visible text or an accessible aria-label that describes the button action.",
    recommendation: "Every button needs a clear accessible name so screen-reader users know what it does.",
  },
  "color-contrast": {
    fix: "Increase the foreground/background contrast to meet WCAG AA requirements.",
    recommendation: "Use a contrast checker and verify normal text reaches 4.5:1 and large text reaches 3:1.",
  },
  "document-title": {
    fix: "Add a unique, descriptive <title> element to the page head.",
    recommendation: "Use a concise title that identifies the page and its purpose.",
  },
  "html-has-lang": {
    fix: "Add a valid lang attribute to the root html element, such as lang=\"en\".",
    recommendation: "The document language lets assistive technology select the correct pronunciation rules.",
  },
  "image-alt": {
    fix: "Add meaningful alt text, or use alt=\"\" when the image is decorative.",
    recommendation: "Describe the image's purpose rather than its visual appearance alone.",
  },
  label: {
    fix: "Associate the form control with a visible label using label htmlFor or an aria-label.",
    recommendation: "A programmatic label helps everyone understand what information the field requires.",
  },
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

    await assertPublicUrl(job.data.url);

    const startedAt = Date.now();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.route("**/*", async (route) => {
        try {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
            await route.continue();
            return;
          }
          await assertPublicUrl(requestUrl.toString());
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });
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
          fix: fixTemplates[violation.id]?.fix ?? "Review the linked guidance and update the affected markup.",
          help: violation.help,
          helpUrl: violation.helpUrl,
          html: violation.nodes[0]?.html ?? null,
          impact: violation.impact,
          recommendation: fixTemplates[violation.id]?.recommendation ?? "Fix this issue in the affected component, then scan again to confirm the result.",
          rule: violation.id,
          scanId: scan.id,
          severity: normalizeSeverity(violation.impact),
          tags: violation.tags,
          targets: violation.nodes.map((node) => node.target),
        })),
      });

      const lighthouseResult = await runLighthouse(page.url());

      const audits = lighthouseResult?.audits || {};
      const categories = lighthouseResult?.categories || {};
      const performanceScore = toScore(categories.performance?.score);
      const seoScore = toScore(categories.seo?.score);
      const bestPracticesScore = toScore(categories["best-practices"]?.score);
      const accessibilityScore = calculateAccessibilityScore(axeResults.violations);

      await prisma.scan.update({
        data: {
          bestPracticesScore,
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
          overallScore: calculateOverallScore(accessibilityScore, performanceScore, seoScore, bestPracticesScore),
          performanceScore,
          seoScore,
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

function normalizeSeverity(impact: string | null) {
  if (impact === "critical" || impact === "serious") return "critical";
  if (impact === "moderate") return "warning";
  return "info";
}

function calculateAccessibilityScore(violations: AxeResults["violations"]) {
  const penalty = violations.reduce((total, violation) => {
    const weight = violation.impact === "critical" ? 20 : violation.impact === "serious" ? 12 : violation.impact === "moderate" ? 6 : 2;
    return total + weight;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function calculateOverallScore(
  accessibility: number,
  performance: number | null,
  seo: number | null,
  bestPractices: number | null,
) {
  if (performance === null || seo === null || bestPractices === null) return null;
  return Math.round(
    accessibility * 0.4 + performance * 0.25 + seo * 0.2 + bestPractices * 0.15,
  );
}