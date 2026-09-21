import assert from "node:assert/strict";
import test from "node:test";
import PDFDocument from "pdfkit";
import { appendAeoGeoPdf } from "../lib/aeo-geo-pdf";
import { buildAeoGeoReport } from "../lib/aeo-geo";
import { samplePage } from "./fixtures/aeo-page";

test("enhanced reports export multiple pages and AI evidence to a valid PDF", async () => {
  const report = buildAeoGeoReport([samplePage(), samplePage({ url: "https://example.com/about", title: "About" })], {
    attempted: 2, analysed: 2, depthLimit: 2, pageLimit: 10, remainingLinks: 0, skipped: [],
  }, {
    status: "completed", model: "test", summary: "The content explains the product workflow.", reviewedPageUrls: [samplePage().url],
    recommendations: [{ category: "AEO", priority: "medium", title: "Explain the first step", pageUrl: samplePage().url, evidence: "Add your public website URL to begin.", action: "Explain where to enter the URL." }],
  });
  const document = new PDFDocument();
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => { document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  appendAeoGeoPdf(document, report);
  document.end();
  const buffer = await completed;
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.length > 1000);
});
