"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Globe, Activity, CalendarClock } from "lucide-react";
import { getPaidResource, getSchedulingResource, requestJson } from "@/lib/client-api";
import { products, type Product } from "@/lib/billing";
import { hasPaidPlan } from "@/lib/plan-limits";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Scan = {
  createdAt: string;
  durationMs: number | null;
  id: string;
  overallScore: number | null;
  performanceScore: number | null;
  seoScore: number | null;
  status: string;
  url: string;
};

type Site = { id: string; name: string | null; scans: Scan[]; url: string };
type Schedule = { enabled: boolean; frequency: "DAILY" | "WEEKLY"; id: string; siteId: string; site: Site; nextRunAt: string };
type Plan = "FREE" | "PAID";
type BrowserState = { createdAt: string; expiresAt: string | null; id: string; label: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const chartConfig: ChartConfig = {
  score: { label: "Overall score", color: "#688227" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export function DashboardClient() {
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [schedulePending, setSchedulePending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [schedulingActive, setSchedulingActive] = useState(false);
  const [accessDates, setAccessDates] = useState<{ scans?: string | null; scheduling?: string | null }>({});
  const [billingOpen, setBillingOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Product>("SCANS");
  const [billingPending, setBillingPending] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [browserStates, setBrowserStates] = useState<BrowserState[]>([]);
  const [browserStateLabel, setBrowserStateLabel] = useState("");
  const [browserStateError, setBrowserStateError] = useState("");

  async function loadDashboard() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as { error?: string; plan?: Plan; schedulingActive?: boolean; scansAccessUntil?: string | null; schedulingAccessUntil?: string | null; sites?: Site[] };
    if (!response.ok) throw new Error(data.error || "Unable to load dashboard.");
    setSites(data.sites ?? []);
    setPlan(data.plan ?? "FREE");
    setSchedulingActive(data.schedulingActive ?? false);
    setAccessDates({ scans: data.scansAccessUntil, scheduling: data.schedulingAccessUntil });
    const currentPlan = data.plan ?? "FREE";
    await Promise.all([
      getSchedulingResource(data.schedulingActive ?? false, "/api/schedules", { schedules: [] as Schedule[] })
        .then((data) => { setSchedules(data.schedules); setScheduleError(""); })
        .catch((error) => setScheduleError(error instanceof Error ? error.message : "Unable to load schedules.")),
      requestJson<{ preferences?: { emailEnabled: boolean } }>("/api/notifications/preferences")
        .then((data) => setEmailEnabled(data.preferences?.emailEnabled ?? true))
        .catch(() => setScheduleError("Unable to load email preferences. Please refresh to retry.")),
      getPaidResource(currentPlan, "/api/browser-states", { states: [] as BrowserState[] })
        .then((data) => { setBrowserStates(data.states); setBrowserStateError(""); })
        .catch((error) => setBrowserStateError(error instanceof Error ? error.message : "Unable to load sessions.")),
    ]);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDashboard().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard.")).finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const allScans = useMemo(() => sites.flatMap((site) => site.scans), [sites]);
  const chartData = [...allScans]
    .filter((scan) => scan.overallScore !== null)
    .reverse()
    .map((scan) => ({ date: formatDate(scan.createdAt), score: scan.overallScore }));

  async function deleteSite() {
    if (!siteToDelete) return;
    const response = await fetch(`/api/sites/${siteToDelete.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Unable to delete this site.");
      return;
    }
    setSites((current) => current.filter((site) => site.id !== siteToDelete.id));
    setSiteToDelete(null);
  }

  async function updateSchedule(url: string, method: "POST" | "PATCH", body: object) {
    if (!schedulingActive) { setSelectedPlan("SCHEDULING"); setBillingOpen(true); return; }
    setScheduleError("");
    setSchedulePending(true);
    try {
      const data = await requestJson<{ schedule: Schedule }>(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!data.schedule?.id) throw new Error("The server did not return a schedule. Please refresh and try again.");
      setSchedules((current) => [...current.filter((item) => item.siteId !== data.schedule.siteId), data.schedule]);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Unable to update the schedule. Please try again.");
    } finally {
      setSchedulePending(false);
    }
  }

  async function saveSchedule(siteId: string, frequency: string | null) {
    if (frequency !== "DAILY" && frequency !== "WEEKLY") return;
    await updateSchedule("/api/schedules", "POST", { frequency, siteId });
  }

  async function toggleSchedule(schedule: Schedule, enabled: boolean) {
    await updateSchedule(`/api/schedules/${schedule.id}`, "PATCH", { enabled });
  }

  async function toggleEmail(enabled: boolean) {
    setScheduleError("");
    try {
      await requestJson("/api/notifications/preferences", {
        body: JSON.stringify({ emailEnabled: enabled }),
        headers: { "Content-Type": "application/json" }, method: "PATCH",
      });
      setEmailEnabled(enabled);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Unable to update email preferences.");
    }
  }

  async function uploadBrowserState(event: ChangeEvent<HTMLInputElement>) {
    if (!hasPaidPlan(plan)) { setSelectedPlan("SCANS"); setBillingOpen(true); return; }
    const file = event.target.files?.[0];
    if (!file || !browserStateLabel.trim()) {
      setBrowserStateError("Choose a JSON storage-state file and enter a label.");
      return;
    }
    try {
      const requestBody = {
        kind: "storage_state",
        label: browserStateLabel.trim(),
        state: JSON.parse(await file.text()),
      };

      const response = await fetch("/api/browser-states", {
        body: JSON.stringify(requestBody),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; state?: BrowserState };
      if (!response.ok || !data.state) throw new Error(data.error || "Unable to save browser state.");
      setBrowserStates((current) => [data.state!, ...current]);
      setBrowserStateLabel("");
      setBrowserStateError("");
      event.target.value = "";
    } catch (uploadError) {
      setBrowserStateError(uploadError instanceof Error ? uploadError.message : "The file is not valid JSON.");
    }
  }

  async function deleteBrowserState(stateId: string) {
    setBrowserStateError("");
    try {
      const response = await fetch(`/api/browser-states/${stateId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Unable to delete this session.");
      }
      setBrowserStates((current) => current.filter((state) => state.id !== stateId));
    } catch (error) {
      setBrowserStateError(error instanceof Error ? error.message : "Unable to delete this session.");
    }
  }

  async function startPayment() {
    if (billingPending) return;
    setBillingPending(true);
    setBillingError("");
    try {
      const response = await fetch("/api/billing/razorpay/order", {
        body: JSON.stringify({ product: selectedPlan }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const order = (await response.json()) as { error?: string; amountPaise?: number; currency?: string; keyId?: string; orderId?: string };
      if (!response.ok || !order.keyId || !order.orderId) {
        setBillingError(order.error || "Unable to start payment.");
        setBillingPending(false);
        return;
      }
      if (!window.Razorpay) {
        setBillingError("Razorpay checkout is still loading. Please try again.");
        setBillingPending(false);
        return;
      }

      const checkout = new window.Razorpay({
        amount: order.amountPaise,
        currency: order.currency,
        description: `${products[selectedPlan].name} - one month`,
        key: order.keyId,
        name: "AccessiScan",
        order_id: order.orderId,
        handler: async (payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verification = await fetch("/api/billing/razorpay/verify", {
              body: JSON.stringify({ orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });
            if (verification.ok) {
              setBillingOpen(false);
              void loadDashboard().catch(() => setBillingError("Payment verified. Refresh to load your paid features."));
            } else {
              setBillingError("Payment completed but verification failed. Please contact support.");
            }
          } catch { setBillingError("Unable to verify payment. Refresh to check your access before paying again."); }
          finally { setBillingPending(false); }
        },
        modal: { ondismiss: () => { setBillingPending(false); setBillingError("Payment was cancelled."); } },
        theme: { color: "#19382d" },
      });
      checkout.open();
    } catch {
      setBillingPending(false);
      setBillingError("Unable to start payment. Please try again.");
    }
  }

  if (loading) return <main id="main-content" className="page-shell" role="status">Loading your workspace…</main>;

  if (error) {
    return <Alert className="m-8 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  return (
    <main id="main-content" className="workspace page-shell flex-1 text-[#19251f]">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-[#d7dfd5] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#688227]">Your workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[#19382d]">Site dashboard</h1><p className="mt-2 text-[#68776d]">Monitor your websites and keep improvements moving.</p></div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setBillingOpen(true)} type="button">{plan === "FREE" ? "Unlock scans · ₹100/month" : "Manage paid features"}</Button><Link href="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#19382d] px-4 text-sm font-medium text-white hover:bg-[#285342]">New scan <ArrowUpRight aria-hidden="true" className="size-4" /></Link></div>
        </header>

        <section aria-label="Workspace overview" className="grid gap-4 sm:grid-cols-3">
          {[{ label: "Saved websites", value: sites.length, Icon: Globe }, { label: "Scans recorded", value: allScans.length, Icon: Activity }, { label: "Active schedules", value: schedules.filter((schedule) => schedule.enabled).length, Icon: CalendarClock }].map(({ label, value, Icon }) => (
            <Card key={label}><CardContent className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-primary tabular-nums">{value}</p></div><span className="flex size-11 items-center justify-center rounded-xl bg-[#eff4e9] text-[#5d7430]"><Icon aria-hidden="true" className="size-5" /></span></CardContent></Card>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          <Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Score trend</CardTitle><CardDescription>Overall scores across your recent completed scans.</CardDescription></CardHeader><CardContent>
            {chartData.length > 0 ? <ChartContainer config={chartConfig} className="h-[250px] w-full"><LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 10, top: 10 }}><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={30} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="score" dot={{ fill: "#688227", r: 4 }} stroke="var(--color-score)" strokeWidth={3} type="monotone" /></LineChart></ChartContainer> : <div className="flex h-[250px] items-center justify-center rounded-xl bg-[#f7faf4] text-sm text-[#718078]">Complete a scan to see score history.</div>}
          </CardContent></Card>
          <Card className="border-[#d0ddca] bg-[#19382d] text-white"><CardHeader><CardDescription className="text-white/70">Keep making progress</CardDescription><CardTitle className="mt-3 text-2xl leading-tight text-white">Small fixes.<br />Lasting improvements.</CardTitle><CardDescription className="mt-3 leading-6 text-white/70">Keep track of your results and turn each scan into a better experience for your visitors.</CardDescription></CardHeader><CardContent><Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#d8f36a] hover:underline">Run a website check <ArrowUpRight aria-hidden="true" className="size-4" /></Link></CardContent></Card>
        </section>

        <section className="space-y-4"><div><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#19382d]">Saved sites</h2><p className="mt-1 text-sm text-[#718078]">Latest score and scan history for each website.</p></div>{sites.length === 0 ? <Card className="border-[#d0ddca] bg-white"><CardContent className="flex flex-col items-center px-6 py-10 text-center"><Globe aria-hidden="true" className="mb-4 size-8 text-[#688227]" /><h3 className="text-lg font-semibold text-primary">Your next improvement starts here</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Scan a website to save it here and start building a history of your results.</p><Link href="/" className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90">Scan a website</Link></CardContent></Card> : <div className="grid gap-5 md:grid-cols-2">{sites.map((site) => { const latest = site.scans[0]; return <Card key={site.id} className="border-[#d0ddca] bg-white"><CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-lg text-[#19382d]">{site.name || site.url}</CardTitle><CardDescription className="mt-1 truncate">{site.url}</CardDescription></div><Badge className="bg-[#eff8d7] text-[#58713b]">{latest?.overallScore ?? "-"}</Badge></div></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-[#718078]">{site.scans.length} recent scan{site.scans.length === 1 ? "" : "s"}</span><div className="flex gap-2"><Link href={`/?url=${encodeURIComponent(site.url)}`} className="inline-flex h-8 items-center rounded-lg border border-[#cbd7c9] px-3 text-xs font-medium text-[#38531f] hover:bg-[#f0f4ed]">Scan again</Link><Button onClick={() => setSiteToDelete(site)} className="h-8 bg-[#fff1ee] px-3 text-xs text-[#8b3023] hover:bg-[#f8d8d2]" type="button">Delete</Button></div></CardContent></Card>; })}</div>}</section>

        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Recent scans</CardTitle><CardDescription>Compare your latest results at a glance.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Website</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead /></TableRow></TableHeader><TableBody>{allScans.length === 0 && <TableRow><TableCell colSpan={5} className="!py-10 text-center text-muted-foreground">Your scan results will appear here after your first check.</TableCell></TableRow>}{allScans.slice(0, 20).map((scan) => <TableRow key={scan.id}><TableCell className="max-w-[240px] truncate font-medium text-[#38531f]">{scan.url}</TableCell><TableCell>{formatDate(scan.createdAt)}</TableCell><TableCell><Badge className={scan.status === "completed" ? "bg-[#dff1ba] text-[#38531f]" : "bg-[#eef1ed] text-[#5d6b62]"}>{scan.status}</Badge></TableCell><TableCell>{scan.overallScore ?? "-"}</TableCell><TableCell className="space-x-3 text-right"><Link className="text-xs font-semibold text-[#688227] underline underline-offset-4" href={`/scans/${scan.id}?url=${encodeURIComponent(scan.url)}`}>View</Link>{plan !== "FREE" && scan.status === "completed" && <a className="text-xs font-semibold text-[#688227] underline underline-offset-4" href={`/api/reports/${scan.id}`}>PDF</a>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></section>
        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Scheduled scans</CardTitle><CardDescription>Keep an eye on changes with daily or weekly checks. Scheduling pauses when its monthly access expires.</CardDescription></CardHeader><CardContent className="space-y-3">{scheduleError && <Alert variant="destructive"><AlertDescription>{scheduleError}</AlertDescription></Alert>}{!schedulingActive ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Set daily or weekly scans with email reports for ₹250/month, purchased separately from scan access.</p><Button onClick={() => { setSelectedPlan("SCHEDULING"); setBillingOpen(true); }}>Unlock scheduling · ₹250/month</Button></div> : sites.map((site) => { const schedule = schedules.find((item) => item.siteId === site.id); return <div className="flex flex-col gap-3 rounded-lg border border-[#e1e8df] p-4 sm:flex-row sm:items-center sm:justify-between" key={site.id}><div className="min-w-0"><p className="truncate font-medium text-[#19382d]">{site.name || site.url}</p><p className="text-xs text-[#718078]">{schedule?.enabled ? `Next run ${formatDate(schedule.nextRunAt)}` : "Monitoring is off"}</p></div><div className="flex items-center gap-3"><Select disabled={schedulePending} value={schedule?.frequency || "WEEKLY"} onValueChange={(value) => void saveSchedule(site.id, value)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAILY">Daily</SelectItem><SelectItem value="WEEKLY">Weekly</SelectItem></SelectContent></Select>{schedule && <Switch disabled={schedulePending} aria-label={`Enable monitoring for ${site.name || site.url}`} checked={schedule.enabled} onCheckedChange={(checked) => void toggleSchedule(schedule, checked)} />}</div></div>; })}<div className="flex items-center justify-between border-t border-[#e1e8df] pt-4"><span className="text-sm text-[#5d6b62]">Email scan reports</span><Switch aria-label="Email scan reports" checked={emailEnabled} onCheckedChange={(checked) => void toggleEmail(checked)} /></div></CardContent></Card></section>
        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Authenticated sessions</CardTitle><CardDescription>Upload a Playwright storage-state JSON for pages you are authorized to test. Expired sessions are cleaned automatically.</CardDescription></CardHeader><CardContent className="space-y-4">{!hasPaidPlan(plan) ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Authenticated browser sessions are included with paid plans.</p><Button onClick={() => { setSelectedPlan("SCANS"); setBillingOpen(true); }}>Unlock scans for ₹100/month</Button></div> : <><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Session label" value={browserStateLabel} onChange={(event) => setBrowserStateLabel(event.target.value)} placeholder="Session label" /><Input aria-label="Upload browser session JSON" accept="application/json" onChange={(event) => void uploadBrowserState(event)} type="file" /><span className="self-center text-xs text-[#718078]">JSON only</span></div>{browserStateError && <Alert className="border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertDescription>{browserStateError}</AlertDescription></Alert>}<Alert className="border-[#d9e4d3] bg-[#f7faf4] text-[#38531f]"><AlertDescription>Do not upload credentials, cookies, or browser state that belongs to someone else. This encrypted session must be used only for your own authorized website testing.</AlertDescription></Alert><div className="space-y-2">{browserStates.length === 0 ? <p className="text-sm text-[#718078]">No authenticated sessions saved.</p> : browserStates.map((state) => <div className="flex items-center justify-between rounded-lg border border-[#e1e8df] p-3" key={state.id}><div><p className="font-medium text-[#19382d]">{state.label}</p><p className="text-xs text-[#718078]">Storage state</p><p className="text-xs text-[#718078]">Added {formatDate(state.createdAt)}{state.expiresAt ? ` · expires ${formatDate(state.expiresAt)}` : ""}</p></div><Button className="h-8 bg-[#fff1ee] px-3 text-xs text-[#8b3023] hover:bg-[#f8d8d2]" onClick={() => void deleteBrowserState(state.id)} type="button">Delete</Button></div>)}</div></>}</CardContent></Card></section>
      </div>
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose a paid feature</DialogTitle><DialogDescription>Your first scan is free. Buy one month of access and renew when needed. No automatic debit.</DialogDescription></DialogHeader>
          <RadioGroup className="mt-4" onValueChange={(value) => setSelectedPlan(value as Product)} value={selectedPlan}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <RadioGroupItem value="SCANS" /><span><strong>Scan access · ₹100/month</strong><span className="block text-sm text-muted-foreground">Additional scans, PDF reports, and authenticated sessions. Up to 10 pages per scan. Email scheduling sold separately.</span>{accessDates.scans && <span className="block text-sm">Access until {new Date(accessDates.scans).toLocaleDateString()}</span>}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <RadioGroupItem value="SCHEDULING" /><span><strong>Email scheduling · ₹250/month</strong><span className="block text-sm text-muted-foreground">Daily or weekly scheduled scans and email reports. Does not unlock additional on-demand scans.</span>{accessDates.scheduling && <span className="block text-sm">Access until {new Date(accessDates.scheduling).toLocaleDateString()}</span>}</span>
            </label>
          </RadioGroup>
          {billingError && <Alert variant="destructive"><AlertDescription>{billingError}</AlertDescription></Alert>}
          <Button disabled={billingPending} onClick={() => void startPayment()} type="button">Pay ₹{products[selectedPlan].amountPaise / 100} for one month</Button>
        </DialogContent>
      </Dialog>
      <script async src="https://checkout.razorpay.com/v1/checkout.js" />
      <AlertDialog open={Boolean(siteToDelete)} onOpenChange={(open) => !open && setSiteToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete saved site?</AlertDialogTitle><AlertDialogDescription>This removes the site and its scan history permanently.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#8b3023] text-white hover:bg-[#6f241b]" onClick={() => void deleteSite()}>Delete site</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}
