"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
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
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(() => searchParams.get("url") ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [scanId, setScanId] = useState("");
  const [browserStates, setBrowserStates] = useState<{ id: string; label: string; expiresAt: string | null }[]>([]);
  const [browserStateId, setBrowserStateId] = useState("none");

  useEffect(() => {
    void fetch("/api/browser-states", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { states: [] })
      .then((data: { states?: typeof browserStates }) => setBrowserStates(data.states ?? []));
  }, []);

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
    <main className="min-h-screen overflow-hidden bg-[#f5f7f2] text-[#19251f]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-[#d7dfd5] pb-5">
          <Link className="flex items-center gap-3 text-sm font-semibold tracking-[0.16em] text-[#19382d]" href="/">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d8f36a] text-lg font-bold tracking-normal text-[#19382d]">A</span>
            ACCESSISCAN
          </Link>
          <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-[#718078] sm:block">Website intelligence</span>
        </header>

        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-20">
          <div>
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.24em] text-[#688227]">A clearer web starts here</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#19382d] sm:text-7xl">
              Find what your website is missing.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#5d6b62] sm:text-xl">
              Scan a deployed site for accessibility, performance, and SEO issues, then get practical fixes in plain English.
            </p>

            <Show when="signed-out">
              <div className="mt-10 max-w-xl rounded-xl border border-[#d9e4d3] bg-white p-5 shadow-[0_8px_24px_rgba(25,56,45,0.05)]">
                <p className="text-sm leading-6 text-[#5d6b62]">Sign in to start a scan and keep your results connected to your account.</p>
                <SignInButton mode="modal">
                  <Button className="mt-4 bg-[#19382d] text-white hover:bg-[#285342]" type="button">Sign in to scan</Button>
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
                  <Select value={browserStateId} onValueChange={setBrowserStateId}>
                    <SelectTrigger className="w-full bg-white" id="browser-state"><SelectValue placeholder="Scan as public visitor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Public visitor</SelectItem>
                      {browserStates.map((state) => <SelectItem key={state.id} value={state.id}>{state.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {error ? (
                <Alert className="mt-3 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" id="url-error" variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
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
            <div className="absolute -inset-5 rounded-[2rem] bg-[#e3eddb] blur-2xl" />
            <div className="relative rounded-[1.75rem] border border-[#d0ddca] bg-[#19382d] p-5 text-white shadow-[0_24px_70px_rgba(25,56,45,0.2)] sm:p-7">
              <div className="flex items-center justify-between border-b border-white/15 pb-5">
                <span className="text-sm font-medium text-white/70">Example scan</span>
                <span className="rounded-full bg-[#d8f36a] px-3 py-1 text-xs font-bold text-[#19382d]">LIVE VIEW</span>
              </div>
              <div className="py-8">
                <p className="text-sm text-white/60">accessiscan.com</p>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-7xl font-semibold tracking-[-0.08em] text-[#d8f36a]">82</span>
                  <span className="mb-2 text-sm text-white/60">overall score</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-5">
                <div><p className="text-xs text-white/50">A11Y</p><p className="mt-1 text-xl font-semibold">94</p></div>
                <div><p className="text-xs text-white/50">SPEED</p><p className="mt-1 text-xl font-semibold">76</p></div>
                <div><p className="text-xs text-white/50">SEO</p><p className="mt-1 text-xl font-semibold">81</p></div>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#d7dfd5] pt-5 text-xs uppercase tracking-[0.16em] text-[#89958c] sm:flex-row sm:items-center sm:justify-between">
          <span>Accessibility, performance, clarity</span>
          <span>Built for the modern web</span>
        </footer>
      </div>
    </main>
  );
}
