import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { extractAeoGeoSignals } from "../lib/aeo-geo-extract";
import { analysePage, buildAeoGeoReport } from "../lib/aeo-geo";

test("Chromium extracts multiple rendered pages, nested schemas and real question headings", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://example.com/**", async (route) => {
      const isGuide = new URL(route.request().url()).pathname === "/guide";
      await route.fulfill({ contentType: "text/html", body: isGuide ? `<!doctype html><html lang="en"><head>
        <title>Guide</title><meta name="description" content="A helpful guide"><link rel="canonical" href="/guide">
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","author":{"@id":"#writer"},"datePublished":"2026-09-01","sameAs":"https://profiles.example/guide"},{"@id":"#writer","@type":"Person","name":"Example Author"},{"@type":["FAQPage","WebPage"],"mainEntity":[{"@type":"Question","name":"How?","acceptedAnswer":{"@type":"Answer","text":"Start here"}}]}]}</script>
        <script type="application/ld+json">{invalid}</script></head><body><nav>Navigation excluded</nav><main>
        <h1>Guide</h1><h2>How does this work?</h2><p>Enter your website address to begin the scan.</p>
        <h2>Pricing?</h2><p>The price depends on the features you select.</p><a href="/about">About</a></main></body></html>` : `<!doctype html><html><head><title>About</title><meta name="robots" content="noindex"></head><body><main><h1>About us</h1><p>We build useful software.</p><h2>Why choose us?</h2><h2>Contact</h2></main></body></html>` });
    });
    await page.goto("https://example.com/guide");
    const first = await extractAeoGeoSignals(page);
    assert.equal(first.wordCount, 23);
    assert.equal(first.questionHeadings.length, 2);
    assert.equal(first.answerPairs.length, 2);
    assert.equal(first.faqSchema, true);
    assert.ok(first.entityTypes.includes("Answer"));
    assert.equal(first.author, "Example Author");
    assert.equal(first.datePublished, "2026-09-01");
    assert.equal(first.canonicalUrl, "https://example.com/guide");
    assert.equal(first.invalidJsonLdCount, 1);
    assert.equal(first.sameAsCount, 1);
    assert.ok(!first.textExcerpt.includes("Navigation excluded"));
    await page.goto("https://example.com/about");
    const second = await extractAeoGeoSignals(page);
    assert.equal(second.answerPairs.length, 0);
    assert.equal(second.questionHeadings.length, 1);
    assert.equal(second.robots, "noindex");
    const report = buildAeoGeoReport([analysePage(first), analysePage(second)], { attempted: 2, analysed: 2, pageLimit: 10, depthLimit: 2, remainingLinks: 0, skipped: [] }, { status: "not_configured", model: "test", summary: "", recommendations: [], reviewedPageUrls: [] });
    assert.equal(report.pages.length, 2);
    assert.equal(report.pages[1].checks.find((check) => check.id === "indexing")?.status, "warning");
  } finally { await browser.close(); }
});
