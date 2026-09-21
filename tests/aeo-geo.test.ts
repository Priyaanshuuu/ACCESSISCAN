import assert from "node:assert/strict";
import test from "node:test";
import { buildAeoGeoReport, readAeoGeoReport, safeReportUrl, type AiReview } from "../lib/aeo-geo";
import { buildAiSources, reviewAeoGeoWithAi, validateAiReview } from "../lib/aeo-geo-ai";
import { samplePage } from "./fixtures/aeo-page";

const ai: AiReview = { status: "not_configured", model: "test", summary: "", recommendations: [], reviewedPageUrls: [] };
const coverage = { attempted: 3, analysed: 2, pageLimit: 10, depthLimit: 2, remainingLinks: 1, skipped: [{ url: "https://example.com/error", reason: "HTTP error" }] };

test("multi-page report deduplicates final URLs, counts checks and finds repeated metadata", () => {
  const first = samplePage();
  const second = samplePage({ url: "https://example.com/about", isArticle: false, author: "", datePublished: "", h1Count: 0 });
  const report = buildAeoGeoReport([first, second, first], coverage, ai);
  assert.equal(report.pages.length, 2);
  assert.equal(report.coverage.analysed, 2);
  assert.equal(report.coverage.skipped.length, 1);
  assert.equal(report.duplicates.length, 2);
  assert.equal(report.summary.aeo.total, 10);
  assert.equal(report.summary.aeo.passed, 9);
  assert.equal(report.summary.geo.total, 8);
  assert.equal("textExcerpt" in report.pages[0], false);
  assert.equal(readAeoGeoReport(JSON.parse(JSON.stringify(report)))?.pages.length, 2);
});

test("article-specific metadata and optional FAQ markup do not penalize unrelated pages", () => {
  const page = samplePage({ isArticle: false, author: "", datePublished: "", questionHeadings: [], answerPairs: [], structuredDataCount: 0 });
  for (const id of ["author", "published", "faq", "answers", "jsonld"]) assert.equal(page.checks.find((check) => check.id === id)?.status, "info");
  const blocked = samplePage({ robots: "googlebot: noindex, nofollow", invalidJsonLdCount: 1 });
  assert.equal(blocked.checks.find((check) => check.id === "indexing")?.status, "warning");
  assert.equal(blocked.checks.find((check) => check.id === "jsonld")?.status, "warning");
});

test("legacy and empty reports remain distinguishable and unsafe links cannot be rendered", () => {
  assert.equal(readAeoGeoReport({ title: "Legacy", wordCount: 20 }), null);
  assert.equal(readAeoGeoReport(null), null);
  assert.equal(safeReportUrl("javascript:alert(1)"), undefined);
  assert.equal(safeReportUrl("https://example.com/page"), "https://example.com/page");
  assert.deepEqual(buildAeoGeoReport([], { ...coverage, analysed: 0 }, ai).summary.aeo, { passed: 0, total: 0 });
});

const recommendation = { category: "AEO", priority: "medium", title: "Clarify setup steps", pageUrl: "https://example.com/guide", evidence: "Add your public website URL to begin.", action: "Explain where to enter the URL and what happens next." };
const review = { summary: "The page explains the basic workflow. Make the next step more explicit.", recommendations: [recommendation] };

test("AI validation rejects fabricated URLs, invented quotes and invalid priorities", () => {
  const sources = buildAiSources([samplePage()]);
  assert.ok(validateAiReview(review, sources));
  for (const override of [{ pageUrl: "https://invented.example" }, { evidence: "A quote that does not appear in this page." }, { priority: "urgent" }, { category: "SEO" }]) {
    assert.equal(validateAiReview({ ...review, recommendations: [{ ...recommendation, ...override }] }, sources), null);
  }
});

test("AI input is bounded to ten pages and 6500 characters per page", () => {
  const pages = Array.from({ length: 30 }, (_, i) => samplePage({ url: `https://example.com/${i}`, textExcerpt: "content ".repeat(10_000) }));
  const sources = buildAiSources(pages);
  assert.equal(sources.length, 10);
  assert.ok(sources.every((source) => source.evidence.length <= 6500));
});

test("missing key, disabled AI, private scans and empty pages never call OpenAI", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("Unexpected API request"); };
  assert.equal((await reviewAeoGeoWithAi([samplePage()], { apiKey: "", fetcher })).status, "not_configured");
  assert.equal((await reviewAeoGeoWithAi([samplePage()], { apiKey: "test", enabled: false, fetcher })).status, "disabled");
  assert.equal((await reviewAeoGeoWithAi([samplePage()], { apiKey: "test", authenticated: true, fetcher })).status, "skipped_private");
  assert.equal((await reviewAeoGeoWithAi([], { apiKey: "test", fetcher })).status, "no_pages");
});

test("Responses API receives a strict schema, no tools, bounded output and no response storage", async () => {
  const result = await reviewAeoGeoWithAi([samplePage()], {
    apiKey: "test-key", model: "test-model", enabled: true,
    fetcher: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, "test-model");
      assert.equal(request.store, false);
      assert.equal(request.tools, undefined);
      assert.equal(request.text.format.type, "json_schema");
      assert.equal(request.text.format.strict, true);
      assert.equal(request.max_output_tokens, 3500);
      assert.match(request.instructions, /untrusted website data/);
      assert.ok(init?.signal);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(review) }] }] });
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.recommendations.length, 1);
  assert.deepEqual(result.reviewedPageUrls, [samplePage().url]);
});

test("provider failures, refusals, incomplete output and invalid JSON preserve structural reporting", async () => {
  const fetchers: (typeof fetch)[] = [
    async () => new Response("Unavailable", { status: 429 }),
    async () => { throw new Error("Timed out"); },
    async () => Response.json({ status: "incomplete", output: [] }),
    async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }] }),
    async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "bad JSON" }] }] }),
  ];
  for (const fetcher of fetchers) {
    const result = await reviewAeoGeoWithAi([samplePage()], { apiKey: "test", enabled: true, fetcher });
    assert.equal(result.status, "unavailable");
    assert.equal(buildAeoGeoReport([samplePage()], coverage, result).pages.length, 1);
  }
});
