import { analysePage, type PageSignals } from "../../lib/aeo-geo";

export function samplePage(overrides: Partial<PageSignals> = {}) {
  return analysePage({
    url: "https://example.com/guide", title: "Getting started", description: "A guide to setting up an accessible website.",
    language: "en", wordCount: 120, h1Count: 1, headingCount: 2, headings: ["Getting started", "How does it work?"],
    questionHeadings: ["How does it work?"], answerPairs: [{ question: "How does it work?", answer: "We inspect the structure of your website." }],
    textExcerpt: "Getting started. We inspect the structure of your website. Add your public website URL to begin.",
    structuredDataCount: 1, invalidJsonLdCount: 0, entityTypes: ["Article"], faqSchema: false, howToSchema: false,
    isArticle: true, author: "Example Author", datePublished: "2026-09-01", canonicalUrl: "https://example.com/guide",
    robots: "index, follow", hasOpenGraph: true, sameAsCount: 0, externalLinkCount: 1, ...overrides,
  });
}
