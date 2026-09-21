export type ReadinessCheck = {
  id: string;
  category: "AEO" | "GEO";
  label: string;
  status: "pass" | "warning" | "info";
  evidence: string;
  recommendation: string;
};

export type PageSignals = {
  url: string;
  title: string;
  description: string;
  language: string;
  wordCount: number;
  h1Count: number;
  headingCount: number;
  headings: string[];
  questionHeadings: string[];
  answerPairs: { question: string; answer: string }[];
  textExcerpt: string;
  structuredDataCount: number;
  invalidJsonLdCount: number;
  entityTypes: string[];
  faqSchema: boolean;
  howToSchema: boolean;
  isArticle: boolean;
  author: string;
  datePublished: string;
  canonicalUrl: string;
  robots: string;
  hasOpenGraph: boolean;
  sameAsCount: number;
  externalLinkCount: number;
};

export type AnalysedPage = PageSignals & { checks: ReadinessCheck[] };
export type ReportPage = Omit<AnalysedPage, "textExcerpt">;
export type AiRecommendation = {
  category: "AEO" | "GEO";
  priority: "high" | "medium" | "low";
  title: string;
  pageUrl: string;
  evidence: string;
  action: string;
};
export type AiReview = {
  status: "completed" | "unavailable" | "disabled" | "not_configured" | "skipped_private" | "no_pages";
  model: string;
  summary: string;
  reviewedPageUrls: string[];
  recommendations: AiRecommendation[];
};
export type AeoGeoReport = {
  version: 2;
  pages: ReportPage[];
  coverage: { attempted: number; analysed: number; pageLimit: number; depthLimit: number; remainingLinks: number; skipped: { url: string; reason: string }[] };
  summary: { aeo: { passed: number; total: number }; geo: { passed: number; total: number } };
  duplicates: { field: "title" | "description"; value: string; urls: string[] }[];
  ai: AiReview;
};

export function analysePage(signals: PageSignals): AnalysedPage {
  const checks: ReadinessCheck[] = [];
  const add = (id: string, category: "AEO" | "GEO", label: string, passed: boolean, evidence: string, recommendation: string, informational = false) => {
    checks.push({ id, category, label, status: informational ? "info" : passed ? "pass" : "warning", evidence, recommendation: passed && !informational ? "" : recommendation });
  };
  add("title", "AEO", "Page title present", Boolean(signals.title.trim()), signals.title || "No page title found.", "Write a title that identifies this page's specific topic.");
  add("description", "AEO", "Meta description", Boolean(signals.description.trim()), signals.description || "No meta description found.", "Summarize the page's purpose and answer in a unique meta description.");
  add("h1", "AEO", "One primary heading", signals.h1Count === 1, `${signals.h1Count} H1 headings found.`, "Use one clear primary heading to identify the page's main topic.");
  add("content", "AEO", "Readable page content", signals.wordCount > 0, `${signals.wordCount} words in the main content.`, "Ensure the page exposes readable content after rendering.");
  add("answers", "AEO", "Answers near question headings", signals.answerPairs.length === signals.questionHeadings.length, `${signals.questionHeadings.length} sampled question headings; ${signals.answerPairs.length} have nearby answer text.`, "Where a heading asks a question, provide a concise answer immediately below it.", signals.questionHeadings.length === 0);
  add("faq", "AEO", "FAQ / HowTo markup", signals.faqSchema || signals.howToSchema, `FAQPage: ${signals.faqSchema ? "present" : "not found"}; HowTo: ${signals.howToSchema ? "present" : "not found"}.`, "Use these types only when the visible page genuinely contains FAQs or instructions. They are not required for every page.", true);
  add("jsonld", "GEO", "Structured data parses as JSON", signals.invalidJsonLdCount === 0, `${signals.structuredDataCount} JSON-LD blocks; ${signals.invalidJsonLdCount} malformed or unsupported blocks.`, "Correct invalid JSON-LD, then validate its vocabulary separately. Parsing alone does not validate schema requirements.", signals.structuredDataCount === 0);
  add("entities", "GEO", "Declared entities", signals.entityTypes.length > 0, signals.entityTypes.join(", ") || "No JSON-LD entity types found.", "Describe the actual organization, product, or article with appropriate structured data.", true);
  add("canonical", "GEO", "Canonical page URL", Boolean(signals.canonicalUrl), signals.canonicalUrl || "No valid HTTP(S) canonical URL found.", "Declare the preferred URL for this page to reduce ambiguity between duplicates.");
  add("indexing", "GEO", "Page-level indexing directives", !/(?:^|[\s,:;])(noindex|none)(?:$|[\s,;])/i.test(signals.robots), signals.robots || "No page-level robots directive found; crawler access was not verified.", "Review noindex if this page is intended for public discovery. This check does not inspect robots.txt.");
  add("author", "GEO", "Article author", Boolean(signals.author), signals.author || "No author found in metadata or JSON-LD.", "For authored articles, identify the real author and provide relevant background.", !signals.isArticle);
  add("published", "GEO", "Article publication date", Boolean(signals.datePublished), signals.datePublished || "No publication date found.", "For articles, publish an accurate publication date; do not invent freshness dates.", !signals.isArticle);
  add("references", "GEO", "External references", signals.externalLinkCount > 0, `${signals.externalLinkCount} external links; ${signals.sameAsCount} entity identity references.`, "Support factual claims with relevant sources. Link presence does not establish authority or verify a claim.", true);
  return { ...signals, checks };
}

export function buildAeoGeoReport(pages: AnalysedPage[], coverage: AeoGeoReport["coverage"], ai: AiReview): AeoGeoReport {
  const unique = [...new Map(pages.map((page) => [page.url, page])).values()];
  const summary = { aeo: { passed: 0, total: 0 }, geo: { passed: 0, total: 0 } };
  for (const page of unique) for (const check of page.checks) {
    if (check.status === "info") continue;
    const bucket = summary[check.category === "AEO" ? "aeo" : "geo"];
    bucket.total++;
    if (check.status === "pass") bucket.passed++;
  }
  const duplicates: AeoGeoReport["duplicates"] = [];
  for (const field of ["title", "description"] as const) {
    const groups = new Map<string, string[]>();
    for (const page of unique) {
      const value = page[field].trim().replace(/\s+/g, " ").toLowerCase();
      if (value) groups.set(value, [...(groups.get(value) ?? []), page.url]);
    }
    for (const [value, urls] of groups) if (urls.length > 1) duplicates.push({ field, value, urls });
  }
  return {
    version: 2,
    pages: unique.map((page) => {
      const { textExcerpt, ...stored } = page;
      void textExcerpt; // Content excerpts are used transiently by the AI review, not stored.
      return stored;
    }),
    coverage: { ...coverage, analysed: unique.length }, summary, duplicates, ai,
  };
}

export function readAeoGeoReport(value: unknown): AeoGeoReport | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AeoGeoReport>;
  return candidate.version === 2 && Array.isArray(candidate.pages) && candidate.coverage && candidate.summary && candidate.ai && Array.isArray(candidate.duplicates)
    ? candidate as AeoGeoReport : null;
}

export function safeReportUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
