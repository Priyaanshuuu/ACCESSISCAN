import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeReportUrl, type AeoGeoReport, type AiReview } from "@/lib/aeo-geo";

const aiMessages: Record<AiReview["status"], string> = {
  completed: "AI suggestions are grounded in sampled page content. Review them before making changes.",
  not_configured: "AI review is not enabled for this installation. Your structural checks are available below.",
  disabled: "AI review is disabled. Your structural checks are available below.",
  skipped_private: "AI review is skipped for scans using saved sign-in sessions. Their page content is not sent to OpenAI.",
  unavailable: "AI review could not complete. Your structural checks are still available; a new scan can retry the review.",
  no_pages: "No HTML page content was available for AI review.",
};

function SourceLink({ url }: { url: string }) {
  const href = safeReportUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-primary underline underline-offset-4">{url}</a> : <span className="break-all text-sm">{url}</span>;
}

export function AeoGeoReportView({ report }: { report: AeoGeoReport }) {
  return <div className="space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>AEO and GEO readiness</CardTitle>
        <CardDescription>Evidence from {report.coverage.analysed} crawled pages. These checks describe content structure, not search rankings or actual AI citations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Pages analysed</p><p className="text-2xl font-semibold">{report.coverage.analysed}</p><p className="text-xs text-muted-foreground">{report.coverage.attempted} attempted; limit {report.coverage.pageLimit}, depth {report.coverage.depthLimit}</p></div>
          {(["aeo", "geo"] as const).map((category) => <div key={category} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{category.toUpperCase()} structural checks passed</p><p className="text-2xl font-semibold">{report.summary[category].passed} / {report.summary[category].total}</p><p className="text-xs text-muted-foreground">Across all analysed pages; informational checks excluded</p></div>)}
        </div>
        <p className="text-sm text-muted-foreground">Coverage follows same-site links within your scan allowance. Disconnected pages and content loaded after the rendering wait may not be included. {report.coverage.remainingLinks > 0 && `${report.coverage.remainingLinks} discovered links remain outside this scan.`}</p>
        {report.coverage.skipped.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">{report.coverage.skipped.length} pages skipped or unavailable</summary><ul className="mt-3 space-y-3">{report.coverage.skipped.map((page, index) => <li key={`${page.url}-${index}`}><SourceLink url={page.url} /><p className="text-sm text-muted-foreground">{page.reason}</p></li>)}</ul></details>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>AI content review</CardTitle><CardDescription>{aiMessages[report.ai.status]}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {report.ai.status === "completed" ? <>
          <p className="text-sm">Reviewed excerpts from {report.ai.reviewedPageUrls.length} of {report.pages.length} pages.</p>
          <p className="leading-relaxed">{report.ai.summary}</p>
          {report.ai.recommendations.length === 0 && <p className="text-sm text-muted-foreground">No additional evidence-backed suggestions were returned.</p>}
          {report.ai.recommendations.map((item, index) => <article key={`${item.pageUrl}-${index}`} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.category}</Badge><Badge variant="secondary">{item.priority} priority</Badge><h3 className="font-semibold">{item.title}</h3></div>
            <SourceLink url={item.pageUrl} />
            <blockquote className="break-words border-l-2 pl-3 text-sm text-muted-foreground">{item.evidence}</blockquote>
            <p className="text-sm leading-relaxed">{item.action}</p>
          </article>)}
        </> : <p className="text-sm text-muted-foreground">The automated findings below do not depend on AI availability.</p>}
      </CardContent>
    </Card>

    {report.duplicates.length > 0 && <Card><CardHeader><CardTitle>Repeated metadata across pages</CardTitle><CardDescription>Give distinct pages distinct descriptions of their purpose. Intentional duplicates may need canonical URLs.</CardDescription></CardHeader><CardContent className="space-y-4">{report.duplicates.map((item, index) => <div className="space-y-2 rounded-xl border p-4" key={`${item.field}-${index}`}><p className="font-medium">Repeated {item.field}: {item.value}</p>{item.urls.map((url) => <SourceLink key={url} url={url} />)}</div>)}</CardContent></Card>}

    <Card>
      <CardHeader><CardTitle>Page-by-page findings</CardTitle><CardDescription>Expand a page to inspect measured evidence and recommended changes. A passed check verifies only the stated condition.</CardDescription></CardHeader>
      <CardContent><Accordion multiple>
        {report.pages.map((page) => <AccordionItem key={page.url} value={page.url}>
          <AccordionTrigger><span className="min-w-0"><span className="block font-semibold">{page.title || "Untitled page"}</span><span className="block break-all text-xs text-muted-foreground">{page.url}</span><span className="block text-xs">{page.checks.filter((check) => check.status === "warning").length} checks need attention</span></span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 py-3">
              <p className="text-sm text-muted-foreground">{page.wordCount} words · {page.headingCount} headings · {page.structuredDataCount} JSON-LD blocks · {page.entityTypes.join(", ") || "No declared entity types"}</p>
              <SourceLink url={page.url} />
              {page.checks.map((check) => <div key={check.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant={check.status === "warning" ? "secondary" : "outline"}>{check.status === "warning" ? "Review" : check.status === "pass" ? "Passed" : "Informational"}</Badge><span className="text-xs text-muted-foreground">{check.category}</span><h4 className="font-medium">{check.label}</h4></div><p className="break-words text-sm text-muted-foreground">{check.evidence}</p>{check.recommendation && <p className="text-sm">{check.recommendation}</p>}</div>)}
              {page.answerPairs.length > 0 && <details><summary className="cursor-pointer font-medium">Detected question-and-answer examples</summary><div className="mt-3 space-y-3">{page.answerPairs.map((pair, index) => <div key={index}><p className="font-medium">{pair.question}</p><p className="text-sm text-muted-foreground">{pair.answer}</p></div>)}</div></details>}
            </div>
          </AccordionContent>
        </AccordionItem>)}
      </Accordion></CardContent>
    </Card>
  </div>;
}
