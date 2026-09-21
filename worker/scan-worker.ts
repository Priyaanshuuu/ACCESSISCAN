import "dotenv/config";

import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import type { AxeResults } from "axe-core";
import { Worker } from "bullmq";
import { chromium } from "playwright";
import { Resend } from "resend";

import { analysePage, buildAeoGeoReport, type AnalysedPage } from "@/lib/aeo-geo";
import { extractAeoGeoSignals } from "@/lib/aeo-geo-extract";
import { reviewAeoGeoWithAi } from "@/lib/aeo-geo-ai";
import { prisma } from "@/lib/prisma";
import { scanQueue, type ScanJob } from "@/lib/queue";
import { decryptBrowserState } from "@/lib/browser-state-crypto";
import { releaseScanSlot } from "@/lib/rate-limit";
import { hasActiveAccess } from "@/lib/billing";
import { planLimits } from "@/lib/plan-limits";
import { scheduleJobId, scheduleQueue, type ScheduledScanJob } from "@/lib/schedule-queue";
import { isTerminalJobFailure, reconcileInterruptedScans } from "@/lib/scan-job-lifecycle";
import { runLighthouse, type LighthouseResult } from "@/lib/lighthouse";
import { assertPublicUrl } from "@/lib/url-safety";

type AxeWindow = Window & {
  axe: {
    run: () => Promise<AxeResults>;
  };
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

const highConfidenceRules = new Set(["button-name", "document-title", "html-has-lang", "image-alt", "label"]);

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
      data: { status: "RUNNING", failureReason: null },
      where: { id: scan.id },
    });

    console.log(`[scan-worker] processing ${scan.id} for ${job.data.url}`);

    await assertPublicUrl(job.data.url);

    if (new URL(job.data.url).pathname.toLowerCase().endsWith(".pdf")) {
      await processPdfScan(scan.id, job.data.url, job.data.maxPages);
      return { scanId: scan.id, status: "completed" };
    }

    const startedAt = Date.now();
    const browserState = job.data.browserStateId
      ? await prisma.browserState.findUnique({ where: { id: job.data.browserStateId } })
      : null;
    if (browserState?.expiresAt && browserState.expiresAt < new Date()) {
      throw new Error("The authenticated browser session has expired.");
    }
    if (browserState && (browserState.requiresManualHandoff || browserState.kind !== "storage_state")) {
      throw new Error("Manual browser handoff is not supported. Upload a Playwright storage-state JSON instead.");
    }
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        storageState: browserState ? decryptBrowserState(browserState.ciphertext) : undefined,
      });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        try {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") {
            await route.continue();
            return;
          }
          if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() && visited.size > 1 && requestUrl.origin !== new URL(firstPageUrl).origin) {
            await route.abort("blockedbyclient");
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
      startUrl.hash = "";
      const pending = [{ depth: 0, url: startUrl.toString() }];
      const visited = new Set<string>();
      const allViolations: AxeResults["violations"] = [];
      const issueFingerprints = new Map<string, { count: number; violation: AxeResults["violations"][number] }>();
      let firstResponseStatus: number | null = null;
      let firstPageTitle = "";
      let firstPageUrl = startUrl.toString();
      const aeoGeoPages: AnalysedPage[] = [];
      const skippedAeoGeoPages: { url: string; reason: string }[] = [];
      const finalUrls = new Set<string>();

      while (pending.length && visited.size < job.data.maxPages) {
        const next = pending.shift();
        if (!next || visited.has(next.url)) continue;
        visited.add(next.url);

        const response = await page.goto(next.url, {
          timeout: 30_000,
          waitUntil: "domcontentloaded",
        }).catch((error: unknown) => {
          if (visited.size === 1) throw error;
          return null;
        });
        if (!response || response.status() >= 400 || !/text\/html|application\/xhtml\+xml/i.test(response.headers()["content-type"] || "")) {
          if (visited.size === 1) throw new Error("The starting page did not return a successful HTML response.");
          skippedAeoGeoPages.push({ url: next.url, reason: response ? "HTTP error or non-HTML response." : "Navigation failed, timed out, or left the site." });
          continue;
        }
        const pageUrl = page.url().split("#")[0];
        if (finalUrls.has(pageUrl)) {
          skippedAeoGeoPages.push({ url: next.url, reason: "Redirected to an already analysed page." });
          continue;
        }
        finalUrls.add(pageUrl);
        const pageTitle = await page.title();
        if (visited.size === 1) {
          firstResponseStatus = response?.status() ?? null;
          firstPageTitle = pageTitle;
          firstPageUrl = pageUrl;
        }
        try {
          const signals = await extractAeoGeoSignals(page);
          signals.robots = [signals.robots, response.headers()["x-robots-tag"] || ""].filter(Boolean).join(", ").slice(0, 2000);
          aeoGeoPages.push(analysePage(signals));
        } catch {
          skippedAeoGeoPages.push({ url: pageUrl, reason: "Content inspection could not complete." });
        }

        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const axeResults = await page.evaluate(() =>
          (window as unknown as AxeWindow).axe.run(),
        );
        await page.setViewportSize({ height: 844, width: 390 });
        const mobileResults = await page.evaluate(async () => {
          const axe = (window as unknown as AxeWindow).axe;
          const result = await axe.run();
          const viewport = document.querySelector('meta[name="viewport"]') !== null;
          const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const smallTargets = Array.from(document.querySelectorAll("a, button, input, select, textarea, [role=button]"))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
            }).length;
          return { horizontalOverflow, result, smallTargets, viewport };
        });
        await page.setViewportSize({ height: 900, width: 1440 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.focus("body");
        const keyboardResult = await inspectKeyboardFlow(page);
        allViolations.push(...axeResults.violations);
        await prisma.scanPage.create({
          data: {
            depth: next.depth,
            hasHorizontalOverflow: mobileResults.horizontalOverflow,
            hasViewportMeta: mobileResults.viewport,
            issueCount: axeResults.violations.length,
            keyboardFocusableCount: keyboardResult.focusableCount,
            keyboardIssueCount: keyboardResult.issueCount,
            mobileIssueCount: mobileResults.result.violations.length,
            scanId: scan.id,
            status: "COMPLETED",
            touchTargetCount: mobileResults.smallTargets,
            url: pageUrl,
          },
        });
        for (const violation of axeResults.violations) {
          const fingerprint = issueFingerprint(violation.id, violation.nodes[0]?.target);
          const existing = issueFingerprints.get(fingerprint);
          issueFingerprints.set(fingerprint, { count: (existing?.count ?? 0) + 1, violation });
        }

        if (next.depth < job.data.maxDepth && visited.size < job.data.maxPages) {
          const links = await page.locator("a[href]").evaluateAll((elements) =>
            elements.map((element) => (element as HTMLAnchorElement).href),
          );
          for (const link of links) {
            try {
              const linkUrl = new URL(link);
              if (linkUrl.origin === new URL(firstPageUrl).origin && ["http:", "https:"].includes(linkUrl.protocol)) {
                linkUrl.hash = "";
                if (pending.length < 2000 && linkUrl.href.length <= 2048 && !visited.has(linkUrl.toString()) && !finalUrls.has(linkUrl.toString()) && !pending.some((item) => item.url === linkUrl.toString())) {
                  pending.push({ depth: next.depth + 1, url: linkUrl.toString() });
                }
              }
            } catch {
              // Ignore malformed links.
            }
          }
        }
      }

      const aiReview = await reviewAeoGeoWithAi(aeoGeoPages, { authenticated: Boolean(job.data.browserStateId) });
      const aeoGeoReport = buildAeoGeoReport(aeoGeoPages, {
        attempted: visited.size, analysed: aeoGeoPages.length, pageLimit: job.data.maxPages,
        depthLimit: job.data.maxDepth, remainingLinks: pending.length, skipped: skippedAeoGeoPages,
      }, aiReview);
      const accessibilityScore = calculateAccessibilityScore(allViolations);
      const previousScan = scan.siteId
        ? await prisma.scan.findFirst({
            include: { issues: true },
            orderBy: { createdAt: "desc" },
            where: { id: { not: scan.id }, siteId: scan.siteId, status: "COMPLETED" },
          })
        : null;
      const previousFingerprints = new Set(previousScan?.issues.map((issue) => issue.fingerprint));
      const issueData = [...issueFingerprints.entries()].map(([fingerprint, entry]) => ({
        description: entry.violation.description,
            confidence: highConfidenceRules.has(entry.violation.id) ? "high" : "medium",
            confidenceReason: highConfidenceRules.has(entry.violation.id)
              ? "A deterministic rule directly identified the missing or invalid markup."
              : "Automated analysis found a likely issue; manual review is recommended.",
        fingerprint,
        firstSeenAt: new Date(),
        fix: fixTemplates[entry.violation.id]?.fix ?? "Review the linked guidance and update the affected markup.",
        help: entry.violation.help,
        helpUrl: entry.violation.helpUrl,
        html: entry.violation.nodes[0]?.html ?? null,
        impact: entry.violation.impact,
        lastSeenAt: new Date(),
        lifecycle: previousFingerprints.has(fingerprint) ? "ongoing" : "new",
        occurrenceCount: entry.count,
        recommendation: fixTemplates[entry.violation.id]?.recommendation ?? "Fix this issue in the affected component, then scan again to confirm the result.",
        rule: entry.violation.id,
        scanId: scan.id,
        severity: normalizeSeverity(entry.violation.impact),
        tags: entry.violation.tags,
        targets: entry.violation.nodes.map((node) => node.target),
      }));
      await prisma.issue.createMany({ data: issueData });

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
          aeoSignals: aeoGeoReport,
          geoSignals: { version: 2, summary: aeoGeoReport.summary.geo },
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
    lockDuration: 60_000,
  },
);

worker.on("completed", (job) => {
  console.log(`[scan-worker] completed job ${job.id}`);
  void releaseScanSlot(job.data.identity).catch((error) => console.error("[scan-worker] slot release failed", error));
  void sendCompletionEmail(job.data.scanId).catch((error) => console.error("[scan-worker] completion email failed", error));
});

const scheduledWorker = new Worker<ScheduledScanJob>(
  "scheduled-scan",
  async (job) => {
    const schedule = await prisma.scheduledScan.findUnique({
      include: { site: true, user: true },
      where: { id: job.data.scheduleId },
    });
    if (!schedule || !schedule.enabled || !hasActiveAccess(schedule.user.schedulingAccessUntil)) return;

    const scheduler = await scheduleQueue.getJobScheduler(scheduleJobId(schedule.id));
    if (scheduler?.next) {
      await prisma.scheduledScan.update({
        data: { nextRunAt: new Date(scheduler.next) },
        where: { id: schedule.id },
      });
    }

    const scan = await prisma.scan.create({
      data: {
        id: `scan_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        maxDepth: planLimits.PAID.maxDepth,
        maxPages: planLimits.PAID.maxPages,
        siteId: schedule.siteId,
        url: schedule.site.url,
        userId: schedule.userId,
      },
    });
    await scanQueue.add("scheduled-scan", {
      identity: `user:${schedule.userId}`,
      maxDepth: planLimits.PAID.maxDepth,
      maxPages: planLimits.PAID.maxPages,
      scanId: scan.id,
      url: scan.url,
    });

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

worker.on("error", (error) => console.error("[scan-worker] queue error", error));
scheduledWorker.on("error", (error) => console.error("[scheduled-worker] queue error", error));
worker.on("stalled", (jobId) => console.warn(`[scan-worker] recovering stalled job ${jobId}`));

worker.on("failed", (job, error) => {
  if (!job) { console.error("[scan-worker] job failed before it was available", error); return; }
  void (async () => {
    console.error(`[scan-worker] failed attempt for job ${job.id}: ${error.message}`);
    if (!isTerminalJobFailure(await job.getState())) return;
    const result = await prisma.scan.updateMany({
      data: { failureReason: error.message.slice(0, 1000), status: "FAILED" },
      where: { id: job.data.scanId, status: { in: ["RUNNING", "QUEUED"] } },
    });
    if (result.count) await releaseScanSlot(job.data.identity);
  })().catch((failure) => console.error("[scan-worker] could not record job failure", failure));
});

let reconciling = false;
async function reconcileStaleScans() {
  if (reconciling) return;
  reconciling = true;
  try {
    await reconcileInterruptedScans({
      listStaleScans: async () => {
        if (await scanQueue.isPaused()) return [];
        const scans = await prisma.scan.findMany({
          where: { status: { in: ["RUNNING", "QUEUED"] }, updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
          select: { id: true, status: true, updatedAt: true },
        });
        return scans.map((scan) => ({ ...scan, status: scan.status as "RUNNING" | "QUEUED" }));
      },
      listJobs: async () => (await scanQueue.getJobs(["active", "waiting", "delayed", "prioritized", "waiting-children", "completed", "failed"])).filter(Boolean),
      markFailed: async (scan, failureReason) => {
        if (await scanQueue.isPaused()) return false;
        return Boolean((await prisma.scan.updateMany({
          data: { failureReason, status: "FAILED" },
          where: { id: scan.id, status: scan.status, updatedAt: scan.updatedAt },
        })).count);
      },
      releaseSlot: releaseScanSlot,
    });
  } catch (error) { console.error("[scan-worker] failed to reconcile interrupted scans", error); }
  finally { reconciling = false; }
}
const reconciliationTimer = setInterval(() => void reconcileStaleScans(), 60_000);
reconciliationTimer.unref();
void reconcileStaleScans();

async function shutdown(signal: string) {
  console.log(`[scan-worker] received ${signal}, shutting down`);
  clearInterval(reconciliationTimer);
  await worker.close();
  await scheduledWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[scan-worker] listening on the scan queue");

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

async function inspectKeyboardFlow(page: import("playwright").Page) {
  const focusableCount = await page.locator(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
  ).count();
  const focusOrder: string[] = [];
  const maxTabs = Math.min(Math.max(focusableCount * 2, 10), 100);

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      return {
        focusVisible: rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none",
        selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`,
      };
    });
    if (!active) continue;
    focusOrder.push(active.selector);
    if (focusOrder.length > focusableCount && focusOrder[focusOrder.length - 1] === focusOrder[0]) break;
  }

  const invisibleFocusCount = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )).filter((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return rect.width === 0 || rect.height === 0 || styles.visibility === "hidden" || styles.display === "none";
  }).length);

  return {
    focusableCount,
    issueCount: invisibleFocusCount + (focusableCount > 0 && new Set(focusOrder).size < Math.min(focusableCount, 100) ? 1 : 0),
  };
}

function issueFingerprint(rule: string, target: unknown) {
  return crypto.createHash("sha256").update(`${rule}:${JSON.stringify(target ?? "")}`).digest("hex");
}

async function processPdfScan(scanId: string, url: string, maxPages: number) {
  const response = await fetch(url, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("PDF redirect did not include a destination.");
    await assertPublicUrl(new URL(location, url).toString());
    return processPdfScan(scanId, new URL(location, url).toString(), maxPages);
  }
  if (!response.ok) throw new Error(`PDF request failed with HTTP ${response.status}.`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/pdf") && !url.toLowerCase().endsWith(".pdf")) {
    throw new Error("The submitted URL is not a PDF.");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 25 * 1024 * 1024) throw new Error("PDF exceeds the 25 MB scan limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("PDF exceeds the 25 MB scan limit.");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const metadata = await document.getMetadata().catch(() => ({ info: {}, metadata: null }));
  let text = "";
  const pageCount = Math.min(document.numPages, Math.max(maxPages, 1));
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }

  const info = (metadata.info || {}) as Record<string, unknown>;
  const pdfSignals = {
    hasAuthor: typeof info.Author === "string" && info.Author.length > 0,
    hasTitle: typeof info.Title === "string" && info.Title.length > 0,
    isTagged: Boolean((info as { Marked?: boolean }).Marked),
    pageCount: document.numPages,
    scannedPages: pageCount,
    textCharacterCount: text.trim().length,
    textPageRatio: text.trim().length > 0 ? 1 : 0,
  };

  await prisma.scanPage.create({
    data: {
      depth: 0,
      issueCount: pdfSignals.isTagged && pdfSignals.textCharacterCount > 0 ? 0 : 1,
      scanId,
      status: "COMPLETED",
      url,
    },
  });
  await prisma.scan.update({
    data: {
      completedAt: new Date(),
      finalUrl: url,
      httpStatus: response.status,
      pageTitle: typeof info.Title === "string" ? info.Title : "PDF document",
      pdfSignals,
      status: "COMPLETED",
    },
    where: { id: scanId },
  });
}
