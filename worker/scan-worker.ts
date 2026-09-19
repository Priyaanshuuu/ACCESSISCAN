import "dotenv/config";

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AxeResults } from "axe-core";
import { Worker } from "bullmq";
import { chromium } from "playwright";
import { Resend } from "resend";

import { prisma } from "@/lib/prisma";
import { scanQueue, type ScanJob } from "@/lib/queue";
import { releaseScanSlot } from "@/lib/rate-limit";
import type { ScheduledScanJob } from "@/lib/schedule-queue";
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
      await prisma.issue.deleteMany({
        where: { scanId: scan.id },
      });
      await prisma.scanPage.deleteMany({ where: { scanId: scan.id } });

      const startUrl = new URL(job.data.url);
      const pending = [{ depth: 0, url: startUrl.toString() }];
      const visited = new Set<string>();
      const allViolations: AxeResults["violations"] = [];
      let firstResponseStatus: number | null = null;
      let firstPageTitle = "";
      let firstPageUrl = startUrl.toString();

      while (pending.length && visited.size < job.data.maxPages) {
        const next = pending.shift();
        if (!next || visited.has(next.url)) continue;
        visited.add(next.url);

        const response = await page.goto(next.url, {
          timeout: 30_000,
          waitUntil: "domcontentloaded",
        });
        const pageUrl = page.url();
        const pageTitle = await page.title();
        if (visited.size === 1) {
          firstResponseStatus = response?.status() ?? null;
          firstPageTitle = pageTitle;
          firstPageUrl = pageUrl;
        }

        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const axeResults = await page.evaluate(() =>
          (window as unknown as AxeWindow).axe.run(),
        );
        allViolations.push(...axeResults.violations);
        await prisma.scanPage.create({
          data: { depth: next.depth, issueCount: axeResults.violations.length, scanId: scan.id, status: "COMPLETED", url: pageUrl },
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

        if (next.depth < job.data.maxDepth && visited.size < job.data.maxPages) {
          const links = await page.locator("a[href]").evaluateAll((elements) =>
            elements.map((element) => (element as HTMLAnchorElement).href),
          );
          for (const link of links) {
            try {
              const linkUrl = new URL(link);
              if (linkUrl.origin === startUrl.origin && ["http:", "https:"].includes(linkUrl.protocol)) {
                linkUrl.hash = "";
                if (!visited.has(linkUrl.toString()) && !pending.some((item) => item.url === linkUrl.toString())) {
                  pending.push({ depth: next.depth + 1, url: linkUrl.toString() });
                }
              }
            } catch {
              // Ignore malformed links.
            }
          }
        }
      }

      const accessibilityScore = calculateAccessibilityScore(allViolations);

      let lighthouseResult: LighthouseResult | undefined;
      let lighthouseError: string | null = null;

      try {
        lighthouseResult = await runLighthouse(firstPageUrl);
      } catch (error) {
        lighthouseError = error instanceof Error
          ? error.message.slice(0, 1000)
          : "Lighthouse could not complete.";
        console.error(`[scan-worker] Lighthouse unavailable for ${scan.id}: ${lighthouseError}`);
      }

      const audits = lighthouseResult?.audits || {};
      const categories = lighthouseResult?.categories || {};
      const performanceScore = toScore(categories.performance?.score);
      const seoScore = toScore(categories.seo?.score);
      const bestPracticesScore = toScore(categories["best-practices"]?.score);

      await prisma.scan.update({
        data: {
          bestPracticesScore,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          finalUrl: firstPageUrl,
          httpStatus: firstResponseStatus,
          lighthouseAudits: {
            accessibility: pickAudit(audits, "accessibility", "accessibilityScore"),
            categories: Object.fromEntries(
              Object.entries(categories).map(([key, value]) => [key, value.score]),
            ),
            seo: pickAudit(audits, "document-title", "meta-description", "http-status-code"),
          },
          lighthouseError,
          lighthouseMetrics: pickAudit(audits, "largest-contentful-paint", "cumulative-layout-shift", "first-contentful-paint", "total-blocking-time"),
          pageTitle: firstPageTitle,
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
    lockDuration: 300_000,
  },
);

worker.on("completed", (job) => {
  console.log(`[scan-worker] completed job ${job.id}`);
  void releaseScanSlot(job.data.identity);
  void sendCompletionEmail(job.data.scanId);
});

const scheduledWorker = new Worker<ScheduledScanJob>(
  "scheduled-scan",
  async (job) => {
    const schedule = await prisma.scheduledScan.findUnique({
      include: { site: true, user: true },
      where: { id: job.data.scheduleId },
    });
    if (!schedule || !schedule.enabled) return;

    const scan = await prisma.scan.create({
      data: {
        id: `scan_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        maxDepth: schedule.user.plan === "FREE" ? 0 : schedule.user.plan === "INDIE" ? 2 : schedule.user.plan === "BUSINESS" ? 3 : 5,
        maxPages: schedule.user.plan === "FREE" ? 1 : schedule.user.plan === "INDIE" ? 10 : schedule.user.plan === "BUSINESS" ? 50 : 250,
        siteId: schedule.siteId,
        url: schedule.site.url,
        userId: schedule.userId,
      },
    });
    await scanQueue.add("scheduled-scan", {
      identity: `user:${schedule.userId}`,
      scanId: scan.id,
      url: scan.url,
    }, { timeout: 300_000 });

    const nextRunAt = new Date(schedule.nextRunAt);
    nextRunAt.setDate(nextRunAt.getDate() + (schedule.frequency === "DAILY" ? 1 : 7));
    await prisma.scheduledScan.update({ data: { nextRunAt }, where: { id: schedule.id } });
  },
  { connection: workerConnection, concurrency: 1 },
);

async function sendCompletionEmail(scanId: string) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resendKey || !from) return;

  const scan = await prisma.scan.findUnique({
    include: { user: { include: { notificationPreferences: true } } },
    where: { id: scanId },
  });
  const email = scan?.user?.email;
  if (!scan || !email || scan.user?.notificationPreferences?.emailEnabled === false) return;

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from,
    to: email,
    subject: `AccessiScan report: ${scan.url}`,
    text: `Your scan is complete. Overall score: ${scan.overallScore ?? "unavailable"}. Visit your dashboard to review the findings.`,
  });
}

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
    data: {
      failureReason: error.message.slice(0, 1000),
      status: "FAILED",
    },
    where: { id: job.data.scanId },
  });

  if (job) {
    await releaseScanSlot(job.data.identity);
  }
});

async function shutdown(signal: string) {
  console.log(`[scan-worker] received ${signal}, shutting down`);
  await worker.close();
  await scheduledWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[scan-worker] listening on the scan queue");

void prisma.scan.updateMany({
  data: {
    failureReason: "Worker timeout or restart interrupted this scan.",
    status: "FAILED",
  },
  where: {
    status: "RUNNING",
    updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
  },
}).catch((error) => {
  console.error("[scan-worker] failed to reconcile stale scans", error);
});

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

function normalizeSeverity(impact: string | null | undefined) {
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