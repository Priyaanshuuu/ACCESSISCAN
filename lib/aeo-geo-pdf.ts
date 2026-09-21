import type { AeoGeoReport } from "./aeo-geo";

export function appendAeoGeoPdf(document: PDFKit.PDFDocument, report: AeoGeoReport) {
  document.addPage().fontSize(20).fillColor("#19382d").text("AEO and GEO readiness");
  document.moveDown().fontSize(10).fillColor("#5d6b62").text(`${report.coverage.analysed} pages analysed from ${report.coverage.attempted} attempts. Page limit: ${report.coverage.pageLimit}; depth: ${report.coverage.depthLimit}.`);
  document.text("Structural checks and AI suggestions do not measure search rankings or actual AI citations. Only crawled content is covered.");
  document.text(`AEO checks passed: ${report.summary.aeo.passed}/${report.summary.aeo.total}. GEO checks passed: ${report.summary.geo.passed}/${report.summary.geo.total}. Informational checks are excluded.`);
  for (const skipped of report.coverage.skipped) document.moveDown(0.5).text(`Skipped: ${skipped.url} - ${skipped.reason}`);
  for (const duplicate of report.duplicates) document.moveDown(0.5).text(`Repeated ${duplicate.field}: ${duplicate.value}\n${duplicate.urls.join("\n")}`);
  document.moveDown().fontSize(14).fillColor("#19382d").text("AI content review");
  document.fontSize(10).fillColor("#5d6b62");
  if (report.ai.status === "completed") {
    document.text(`Reviewed excerpts from ${report.ai.reviewedPageUrls.length} pages. Suggestions require human review.`);
    document.text(report.ai.summary);
    for (const item of report.ai.recommendations) {
      document.moveDown().text(`${item.priority.toUpperCase()} / ${item.category}: ${item.title}`);
      document.text(item.pageUrl).text(`Evidence: ${item.evidence}`).text(`Suggested change: ${item.action}`);
    }
  } else document.text("AI review was not available for this scan. The structural findings below remain available.");
  for (const page of report.pages) {
    document.moveDown().fontSize(13).fillColor("#19382d").text(page.title || "Untitled page");
    document.fontSize(10).fillColor("#5d6b62").text(page.url);
    document.text(`${page.wordCount} words; ${page.headingCount} headings; ${page.structuredDataCount} JSON-LD blocks.`);
    for (const check of page.checks) {
      document.moveDown(0.5).text(`${check.category} / ${check.status.toUpperCase()}: ${check.label}`);
      document.text(check.evidence);
      if (check.recommendation) document.text(`Suggestion: ${check.recommendation}`);
    }
  }
}
