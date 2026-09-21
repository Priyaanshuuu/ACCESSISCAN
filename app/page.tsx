"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Accessibility, ArrowUpRight, Gauge, Search } from "lucide-react";
import { Show, SignInButton, useAuth } from "@clerk/nextjs";
import type { UserPlan } from "@prisma/client";
import { getPaidResource, requestJson } from "@/lib/client-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function isValidWebsiteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function Home() {
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(() => searchParams.get("url") ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [scanId, setScanId] = useState("");
  const [browserStates, setBrowserStates] = useState<{ id: string; label: string; expiresAt: string | null }[]>([]);
  const [browserStateId, setBrowserStateId] = useState("none");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void requestJson<{ plan: UserPlan }>("/api/dashboard")
      .then(({ plan }) => getPaidResource(plan, "/api/browser-states", { states: [] as typeof browserStates }))
      .then(({ states }) => { if (active) setBrowserStates(states); })
      .catch(() => { if (active) setBrowserStates([]); });
    return () => { active = false; };
  }, [isSignedIn]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUrl = url.trim();
    if (!isValidWebsiteUrl(trimmedUrl)) {
      setSubmittedUrl("");
      setScanId("");
      setError("Enter a valid website URL, including http:// or https://.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    setSubmittedUrl("");
    setScanId("");

    try {
      const response = await fetch("/api/scans", {
        body: JSON.stringify({
          browserStateId: browserStateId === "none" ? undefined : browserStateId,
          url: trimmedUrl,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        scanId?: string;
        url?: string;
      };

      if (!response.ok || !data.scanId || !data.url) {
        throw new Error(data.error || "Unable to create the scan.");
      }

      setSubmittedUrl(data.url);
      setScanId(data.scanId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create the scan. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="flex-1 text-[#19251f]">
      <div className="page-shell flex flex-col">

        <section className="grid items-center gap-12 pb-16 pt-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16 lg:py-16">
          <div>
            <p className="eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce5cd] bg-[#edf3e3] px-3 py-2"><span className="size-1.5 rounded-full bg-[#688227]" />A clearer web starts here</p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#19382d] sm:text-6xl lg:text-[4.25rem]">
              Better websites.<br /><span className="text-[#66764f]">One scan at a time.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#5d6b62] sm:text-xl">
              Scan a deployed site for accessibility, performance, and SEO issues, then get practical fixes in plain English.
            </p>

            <Show when="signed-out">
              <div className="mt-10 max-w-xl rounded-xl border border-[#d9e4d3] bg-white p-5 shadow-[0_8px_24px_rgba(25,56,45,0.05)]">
                <p className="font-semibold text-primary">Your first scan is free.</p>
                <p className="mt-1 text-sm leading-6 text-[#5d6b62]">Find the issues, understand the impact, and know what to fix next.</p>
                <SignInButton mode="modal">
                  <Button className="mt-4 bg-[#19382d] text-white hover:bg-[#285342]" type="button">Start your first scan <ArrowUpRight aria-hidden="true" /></Button>
                </SignInButton>
              </div>
            </Show>
            <Show when="signed-in">
            <form className="mt-10 max-w-xl" onSubmit={handleSubmit} noValidate>
              <label className="mb-3 block text-sm font-semibold text-[#19382d]" htmlFor="website-url">
                Website URL
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-describedby={error ? "url-error" : "url-hint"}
                  aria-invalid={Boolean(error)}
                  className="h-14 min-w-0 flex-1 rounded-xl border border-[#cbd7c9] bg-white px-4 text-base text-[#19382d] shadow-[0_8px_24px_rgba(25,56,45,0.05)] outline-none transition placeholder:text-[#9aa79d] focus:border-[#78942f] focus:ring-4 focus:ring-[#d8f36a]/40"
                  id="website-url"
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="https://yourwebsite.com"
                  type="url"
                  value={url}
                />
                <Button
                  className="h-14 rounded-xl bg-[#19382d] px-6 font-semibold text-white transition hover:bg-[#285342] focus:outline-none focus:ring-4 focus:ring-[#d8f36a]/60 disabled:cursor-wait disabled:opacity-70"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Preparing..." : "Scan website"}
                </Button>
              </div>
              {browserStates.length > 0 && (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-semibold text-[#19382d]" htmlFor="browser-state">Authenticated session</label>
                  <Select value={browserStateId} onValueChange={(value) => setBrowserStateId(value ?? "none")}>
                    <SelectTrigger className="w-full bg-white" id="browser-state"><SelectValue placeholder="Scan as public visitor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Public visitor</SelectItem>
                      {browserStates.map((state) => <SelectItem key={state.id} value={state.id}>{state.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {error ? (
                <>
                <Alert className="mt-3 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" id="url-error" variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                {error.includes("₹100") && <Link className="mt-3 inline-block text-sm font-semibold text-[#38531f] underline underline-offset-4" href="/dashboard">Buy a scan credit in your dashboard</Link>}
                </>
              ) : (
                <p className="mt-3 text-sm text-[#7b887e]" id="url-hint">
                  Start with any public website. Your scan will be saved to your account.
                </p>
              )}
              {submittedUrl && (
                <Alert className="mt-5 border-[#c8df93] bg-[#eff8d7] text-[#38531f]" role="status">
                  <AlertTitle>Queued</AlertTitle>
                  <AlertDescription className="text-[#58713b]">
                    {submittedUrl}
                    <span className="mt-1 block text-xs">Scan ID: {scanId}</span>
                    <Link className="mt-3 inline-block text-xs font-semibold underline underline-offset-4" href={`/scans/${scanId}?url=${encodeURIComponent(submittedUrl)}`}>
                      View scan status
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </form>
            </Show>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:mr-0">
            <div className="relative rounded-2xl border border-[#d0ddca] bg-[#19382d] p-6 text-white shadow-[0_16px_40px_rgba(25,56,45,0.12)] sm:p-8">
              <div className="flex items-center justify-between border-b border-white/15 pb-5">
                <span className="text-sm font-medium text-white/70">Example scan</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">Report preview</span>
              </div>
              <div className="py-8">
                <p className="text-sm text-white/70">yourwebsite.com</p>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-7xl font-semibold tracking-[-0.08em] text-[#d8f36a]">82</span>
                  <span className="mb-2 text-sm text-white/60">overall score</span>
                </div>
              </div>
              <div className="space-y-4 border-t border-white/15 pt-5">
                {[{ label: "Accessibility", score: 94 }, { label: "Performance", score: 76 }, { label: "SEO", score: 81 }].map(({ label, score }) => (
                  <div key={label}>
                    <div className="mb-2 flex justify-between text-sm"><span className="text-white/80">{label}</span><span className="font-medium tabular-nums">{score}</span></div>
                    <div aria-hidden="true" className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d8f36a]" style={{ width: `${score}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="What your scan covers" className="mb-12 grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
          {[{ Icon: Accessibility, title: "Make it accessible", description: "Find barriers that make your website harder to use." }, { Icon: Gauge, title: "Make it faster", description: "See what slows pages down and where to improve." }, { Icon: Search, title: "Make it discoverable", description: "Check the SEO basics that help people find your site." }].map(({ Icon, title, description }) => (
            <div key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-primary"><Icon aria-hidden="true" className="size-5" /></span>
              <div><h2 className="text-sm font-semibold text-primary">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div>
            </div>
          ))}
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#d7dfd5] pt-5 text-xs uppercase tracking-[0.16em] text-[#89958c] sm:flex-row sm:items-center sm:justify-between">
          <span>Accessibility, performance, clarity</span>
          <span>Built for the modern web</span>
        </footer>
      </div>
    </main>
  );
}
