import type { Page } from "playwright";
import type { PageSignals } from "./aeo-geo";

// Runs inside Chromium. Keep all DOM helpers inside this function.
export function extractDocumentSignals(): PageSignals {
  const root = document.querySelector<HTMLElement>("main, [role='main']") || document.body;
  const text = (root?.innerText || "").replace(/\s+/g, " ").trim();
  const headingElements = Array.from(root?.querySelectorAll<HTMLElement>("h1, h2, h3") || []);
  const headingText = headingElements.map((heading) => (heading.innerText || "").trim()).filter(Boolean);
  const questionHeadings: string[] = [];
  const answerPairs: { question: string; answer: string }[] = [];
  for (const heading of headingElements) {
    const question = heading.innerText.trim().slice(0, 250);
    if (!question || !(/^(what|why|how|when|where|who|which|can|is|are|should|does|do)\b/i.test(question) || /[?\u061f]$/.test(question))) continue;
    if (questionHeadings.length >= 20) break;
    questionHeadings.push(question);
    let next = heading.nextElementSibling;
    for (let count = 0; next && count < 3; count++, next = next.nextElementSibling) {
      if (/^H[1-6]$/.test(next.tagName)) break;
      const answer = (next as HTMLElement).innerText?.trim() || "";
      if (answer.split(/\s+/).filter(Boolean).length >= 5) {
        answerPairs.push({ question, answer: answer.slice(0, 500) });
        break;
      }
    }
  }
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const entities: Record<string, unknown>[] = [];
  let invalidJsonLdCount = 0;
  for (const script of scripts) {
    try {
      const raw = script.textContent || "";
      if (raw.length > 250_000) { invalidJsonLdCount++; continue; }
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") { invalidJsonLdCount++; continue; }
      const pending: unknown[] = [parsed];
      let visited = 0;
      while (pending.length && visited++ < 2000 && entities.length < 1000) {
        const item = pending.pop();
        if (Array.isArray(item)) { pending.push(...item.slice(0, 1000)); continue; }
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        entities.push(record);
        pending.push(...Object.values(record).filter((value) => value && typeof value === "object"));
      }
    } catch { invalidJsonLdCount++; }
  }
  const entityTypes = [...new Set(entities.flatMap((item) => {
    const values = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return values.filter((value): value is string => typeof value === "string").map((type) => type.replace(/^https?:\/\/schema.org\//, "").slice(0, 100));
  }))].slice(0, 50);
  let author = document.querySelector('meta[name="author"]')?.getAttribute("content") || document.querySelector<HTMLElement>('[rel="author"], [itemprop="author"]')?.innerText || "";
  let datePublished = document.querySelector('meta[property="article:published_time"], [itemprop="datePublished"]')?.getAttribute("content") || document.querySelector('[itemprop="datePublished"], time[datetime]')?.getAttribute("datetime") || "";
  const references = new Set<string>();
  for (const entity of entities) {
    if (!author && entity.author) {
      const authors = Array.isArray(entity.author) ? entity.author : [entity.author];
      author = authors.map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const resolved = typeof record["@id"] === "string" ? entities.find((entry) => entry["@id"] === record["@id"] && typeof entry.name === "string") : null;
        return typeof record.name === "string" ? record.name : typeof resolved?.name === "string" ? resolved.name : "";
      }).filter(Boolean).join(", ");
    }
    if (!datePublished && typeof entity.datePublished === "string") datePublished = entity.datePublished;
    for (const value of Array.isArray(entity.sameAs) ? entity.sameAs : [entity.sameAs]) {
      if (typeof value === "string" && /^https?:\/\//i.test(value)) references.add(value);
    }
  }
  let canonicalUrl = "";
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical) try { const url = new URL(canonical, document.baseURI); if (["http:", "https:"].includes(url.protocol)) canonicalUrl = url.href.slice(0, 2000); } catch { /* Invalid canonical. */ }
  const externalLinks = new Set<string>();
  for (const element of Array.from(root?.querySelectorAll<HTMLAnchorElement>("a[href]") || [])) {
    try { const url = new URL(element.href); if (["http:", "https:"].includes(url.protocol) && url.origin !== location.origin) externalLinks.add(url.href); } catch { /* Invalid link. */ }
  }
  return {
    url: location.href.split("#")[0],
    title: document.title.trim().slice(0, 500),
    description: (document.querySelector('meta[name="description"]')?.getAttribute("content") || "").trim().slice(0, 1000),
    language: document.documentElement.lang.slice(0, 40),
    wordCount: text.split(/\s+/).filter(Boolean).length,
    h1Count: headingElements.filter((heading) => heading.tagName === "H1").length,
    headingCount: headingText.length,
    headings: headingText.slice(0, 30).map((heading) => heading.slice(0, 250)),
    questionHeadings, answerPairs, textExcerpt: text.slice(0, 4000),
    structuredDataCount: scripts.length, invalidJsonLdCount, entityTypes,
    faqSchema: entityTypes.includes("FAQPage"), howToSchema: entityTypes.includes("HowTo"),
    isArticle: entityTypes.some((type) => ["Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle"].includes(type)) || document.querySelector('meta[property="og:type"]')?.getAttribute("content") === "article",
    author: author.trim().slice(0, 300), datePublished: datePublished.slice(0, 100), canonicalUrl,
    robots: Array.from(document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')).map((meta) => meta.getAttribute("content") || "").join(", ").slice(0, 1000),
    hasOpenGraph: Boolean(document.querySelector('meta[property^="og:"]')),
    sameAsCount: references.size, externalLinkCount: externalLinks.size,
  };
}

export async function extractAeoGeoSignals(page: Page): Promise<PageSignals> {
  // Allow hydration to settle without hanging on sites with persistent requests.
  await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
  return page.evaluate(extractDocumentSignals);
}
