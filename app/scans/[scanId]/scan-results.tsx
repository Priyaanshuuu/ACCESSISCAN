"use client";

import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type ScanIssue = {
  description: string;
  help: string;
  helpUrl: string;
  html: string | null;
  id: string;
  impact: string | null;
  rule: string;
  tags: unknown;
  targets: unknown;
};

type ScanData = {
  durationMs: number | null;
  finalUrl: string | null;
  httpStatus: number | null;
  id: string;
  issues: ScanIssue[];
  pageTitle: string | null;
  status: string;
  url: string;
};

type ScanResultsProps = {
  initialUrl?: string;
  scanId: string;
};

const impactStyles: Record<string, string> = {
  critical: "bg-[#f8d8d2] text-[#8b3023]",
  serious: "bg-[#fbe7bf] text-[#83530c]",
  moderate: "bg-[#fff2c9] text-[#765d0b]",
  minor: "bg-[#e5edf5] text-[#385773]",
};

function formatImpact(impact: string | null) {
  return impact ? impact.charAt(0).toUpperCase() + impact.slice(1) : "Needs review";
}

function getList(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => (Array.isArray(item) ? item : [item])) : [];
}

export function ScanResults({ initialUrl, scanId }: ScanResultsProps) {
  const [scan, setScan] = useState<ScanData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loadScan() {
      try {
        const response = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        const data = (await response.json()) as { error?: string; scan?: ScanData };

        if (!response.ok || !data.scan) {
          throw new Error(data.error || "Unable to load this scan.");
        }

        if (!active) return;
        setScan(data.scan);
        setError("");

        if (data.scan.status === "queued" || data.scan.status === "running") {
          timer = setTimeout(loadScan, 3000);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load this scan.");
        }
      }
    }

    void loadScan();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [scanId]);

  if (error) {
    return (
      <Alert className="border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive">
        <AlertTitle>Could not load the scan</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!scan || scan.status === "queued" || scan.status === "running") {
    return (
      <Card className="w-full max-w-2xl border-[#d0ddca] bg-white shadow-[0_24px_70px_rgba(25,56,45,0.1)]">
        <CardHeader className="space-y-4 border-b border-[#e1e8df] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardDescription className="text-[#718078]">Scan status</CardDescription>
              <CardTitle className="mt-2 text-2xl text-[#19382d]">Preparing your results</CardTitle>
            </div>
            <Badge className="bg-[#eff8d7] text-[#58713b]">{scan?.status === "running" ? "Running" : "Queued"}</Badge>
          </div>
          <Skeleton className="h-5 w-3/4 bg-[#e3eddb]" />
        </CardHeader>
        <CardContent className="space-y-4 p-6 sm:p-8">
          <p className="text-sm text-[#68776d]">{scan?.url || initialUrl || "Your website"}</p>
          <Skeleton className="h-24 w-full bg-[#f0f4ed]" />
        </CardContent>
      </Card>
    );
  }

  if (scan.status === "failed") {
    return (
      <Alert className="w-full max-w-2xl border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive">
        <AlertTitle>The scan failed</AlertTitle>
        <AlertDescription>We could not finish scanning this website. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const impactCounts = scan.issues.reduce<Record<string, number>>((counts, issue) => {
    const impact = issue.impact || "unassigned";
    counts[impact] = (counts[impact] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="w-full max-w-3xl space-y-5">
      <Card className="border-[#d0ddca] bg-white shadow-[0_24px_70px_rgba(25,56,45,0.1)]">
        <CardHeader className="border-b border-[#e1e8df] p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardDescription className="text-[#718078]">Accessibility scan complete</CardDescription>
              <CardTitle className="mt-2 break-words text-2xl text-[#19382d]">{scan.pageTitle || scan.url}</CardTitle>
              <p className="mt-2 break-all text-sm text-[#718078]">{scan.finalUrl || scan.url}</p>
            </div>
            <Badge className="w-fit bg-[#dff1ba] text-[#38531f]">Completed</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-4 sm:p-8">
          <div><p className="text-xs uppercase tracking-[0.16em] text-[#89958c]">Issues</p><p className="mt-1 text-3xl font-semibold text-[#19382d]">{scan.issues.length}</p></div>
          <div><p className="text-xs uppercase tracking-[0.16em] text-[#89958c]">Critical</p><p className="mt-1 text-3xl font-semibold text-[#8b3023]">{impactCounts.critical || 0}</p></div>
          <div><p className="text-xs uppercase tracking-[0.16em] text-[#89958c]">Status</p><p className="mt-2 text-sm font-semibold text-[#19382d]">HTTP {scan.httpStatus || "-"}</p></div>
          <div><p className="text-xs uppercase tracking-[0.16em] text-[#89958c]">Duration</p><p className="mt-2 text-sm font-semibold text-[#19382d]">{scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "-"}</p></div>
        </CardContent>
      </Card>

      <Card className="border-[#d0ddca] bg-white">
        <CardHeader className="p-6 pb-3 sm:p-8 sm:pb-4">
          <CardTitle className="text-xl text-[#19382d]">Accessibility issues</CardTitle>
          <CardDescription>{scan.issues.length ? "Review each finding and its affected elements." : "No automated accessibility issues were found."}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
          {scan.issues.length > 0 && <Separator className="mb-2 bg-[#e1e8df]" />}
          <Accordion>
            {scan.issues.map((issue) => (
              <AccordionItem key={issue.id} value={issue.id}>
                <AccordionTrigger className="gap-4 py-4 hover:no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-[#19382d]">{issue.help}</span>
                    <span className="mt-1 block font-mono text-xs font-normal text-[#89958c]">{issue.rule}</span>
                  </span>
                  <Badge className={impactStyles[issue.impact || ""] || "bg-[#eef1ed] text-[#5d6b62]"}>{formatImpact(issue.impact)}</Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4 text-sm text-[#5d6b62]">
                    <p>{issue.description}</p>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[#89958c]">Affected target</p>
                      <div className="space-y-1 font-mono text-xs text-[#38531f]">
                        {getList(issue.targets).map((target, index) => <p key={`${issue.id}-target-${index}`}>{String(target)}</p>)}
                      </div>
                    </div>
                    {issue.html && <pre className="overflow-x-auto rounded-lg bg-[#f4f7f2] p-3 text-xs text-[#38531f]"><code>{issue.html}</code></pre>}
                    <a className="font-semibold text-[#688227] underline underline-offset-4" href={issue.helpUrl} rel="noreferrer" target="_blank">Learn how to fix this issue</a>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <a className={buttonVariants({ className: "bg-[#19382d] text-white hover:bg-[#285342]" })} href="/">Scan another website</a>
    </div>
  );
}