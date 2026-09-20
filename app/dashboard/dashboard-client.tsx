"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";

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
type Plan = "FREE" | "INDIE" | "BUSINESS" | "AGENCY";
type BrowserState = { createdAt: string; expiresAt: string | null; id: string; kind?: "storage_state" | "manual_handoff"; label: string; manualNotes?: string | null; requiresManualHandoff?: boolean };

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
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [plan, setPlan] = useState<Plan>("FREE");
  const [billingOpen, setBillingOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Exclude<Plan, "FREE">>("INDIE");
  const [billingError, setBillingError] = useState("");
  const [browserStates, setBrowserStates] = useState<BrowserState[]>([]);
  const [browserStateLabel, setBrowserStateLabel] = useState("");
  const [browserStateError, setBrowserStateError] = useState("");
  const [browserStateKind, setBrowserStateKind] = useState<"storage_state" | "manual_handoff">("storage_state");
  const [manualNotes, setManualNotes] = useState("");

  async function loadDashboard() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as { error?: string; plan?: Plan; sites?: Site[] };
    if (!response.ok) throw new Error(data.error || "Unable to load dashboard.");
    setSites(data.sites ?? []);
    setPlan(data.plan ?? "FREE");
    const schedulesResponse = await fetch("/api/schedules", { cache: "no-store" });
    const schedulesData = (await schedulesResponse.json()) as { schedules?: Schedule[] };
    setSchedules(schedulesData.schedules ?? []);
    const preferencesResponse = await fetch("/api/notifications/preferences", { cache: "no-store" });
    const preferencesData = (await preferencesResponse.json()) as { preferences?: { emailEnabled: boolean } };
    setEmailEnabled(preferencesData.preferences?.emailEnabled ?? true);
    const browserStatesResponse = await fetch("/api/browser-states", { cache: "no-store" });
    const browserStatesData = (await browserStatesResponse.json()) as { states?: BrowserState[] };
    setBrowserStates(browserStatesData.states ?? []);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDashboard().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard."));
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

  async function saveSchedule(siteId: string, frequency: "DAILY" | "WEEKLY") {
    const response = await fetch("/api/schedules", {
      body: JSON.stringify({ frequency, siteId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setError("Unable to save this schedule.");
      return;
    }
    const data = (await response.json()) as { schedule: Schedule };
    setSchedules((current) => [...current.filter((item) => item.siteId !== siteId), data.schedule]);
  }

  async function toggleSchedule(schedule: Schedule, enabled: boolean) {
    await fetch(`/api/schedules/${schedule.id}`, {
      body: JSON.stringify({ enabled }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, enabled } : item));
  }

  async function toggleEmail(enabled: boolean) {
    setEmailEnabled(enabled);
    await fetch("/api/notifications/preferences", {
      body: JSON.stringify({ emailEnabled: enabled }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
  }

  async function uploadBrowserState(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !browserStateLabel.trim()) {
      setBrowserStateError("Choose a JSON storage-state file and enter a label.");
      return;
    }
    try {
      const requestBody = browserStateKind === "manual_handoff"
        ? {
            kind: "manual_handoff",
            label: browserStateLabel.trim(),
            manualNotes: manualNotes.trim() || "Manual secure handoff required for MFA/CAPTCHA-protected flow.",
          }
        : {
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
      setManualNotes("");
      setBrowserStateError("");
      event.target.value = "";
    } catch (uploadError) {
      setBrowserStateError(uploadError instanceof Error ? uploadError.message : "The file is not valid JSON.");
    }
  }

  async function deleteBrowserState(stateId: string) {
    const response = await fetch(`/api/browser-states/${stateId}`, { method: "DELETE" });
    if (response.ok) setBrowserStates((current) => current.filter((state) => state.id !== stateId));
  }

  async function startPayment() {
    setBillingError("");
    const response = await fetch("/api/billing/razorpay/order", {
      body: JSON.stringify({ plan: selectedPlan }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const order = (await response.json()) as { error?: string; amountPaise?: number; currency?: string; keyId?: string; orderId?: string };
    if (!response.ok || !order.keyId || !order.orderId) {
      setBillingError(order.error || "Unable to start payment.");
      return;
    }
    if (!window.Razorpay) {
      setBillingError("Razorpay checkout is still loading. Please try again.");
      return;
    }

    const checkout = new window.Razorpay({
      amount: order.amountPaise,
      currency: order.currency,
      description: `${selectedPlan} plan subscription`,
      key: order.keyId,
      name: "AccessiScan",
      order_id: order.orderId,
      handler: async (payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verification = await fetch("/api/billing/razorpay/verify", {
          body: JSON.stringify({ orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (verification.ok) {
          setPlan(selectedPlan);
          setBillingOpen(false);
        } else {
          setBillingError("Payment completed but verification failed. Please contact support.");
        }
      },
      modal: { ondismiss: () => setBillingError("Payment was cancelled.") },
      theme: { color: "#19382d" },
    });
    checkout.open();
  }

  if (error) {
    return <Alert className="m-8 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] px-6 py-8 text-[#19251f] sm:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-[#d7dfd5] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#688227]">Your workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[#19382d]">Site dashboard</h1><p className="mt-2 text-[#68776d]">Monitor your websites and keep improvements moving.</p></div>
          <div className="flex gap-3"><Button className="bg-[#19382d] text-white hover:bg-[#285342]" onClick={() => setBillingOpen(true)} type="button">{plan === "FREE" ? "Upgrade plan" : `${plan} plan`}</Button><Link href="/" className="inline-flex h-9 items-center justify-center rounded-lg bg-[#19382d] px-4 text-sm font-medium text-white hover:bg-[#285342]">Scan a website</Link></div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          <Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Score trend</CardTitle><CardDescription>Overall scores across your recent completed scans.</CardDescription></CardHeader><CardContent>
            {chartData.length > 0 ? <ChartContainer config={chartConfig} className="h-[250px] w-full"><LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 10, top: 10 }}><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={30} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="score" dot={{ fill: "#688227", r: 4 }} stroke="var(--color-score)" strokeWidth={3} type="monotone" /></LineChart></ChartContainer> : <div className="flex h-[250px] items-center justify-center rounded-xl bg-[#f7faf4] text-sm text-[#718078]">Complete a scan to see score history.</div>}
          </CardContent></Card>
          <Card className="border-[#d0ddca] bg-[#19382d] text-white"><CardHeader><CardDescription className="text-white/60">Portfolio</CardDescription><CardTitle className="text-5xl text-[#d8f36a]">{sites.length}</CardTitle><CardDescription className="text-white/70">saved {sites.length === 1 ? "site" : "sites"}</CardDescription></CardHeader><CardContent><p className="text-sm text-white/70">{allScans.length} scans recorded across your workspace.</p></CardContent></Card>
        </section>

        <section className="space-y-4"><div><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#19382d]">Saved sites</h2><p className="mt-1 text-sm text-[#718078]">Latest score and scan history for each website.</p></div>{sites.length === 0 ? <Card className="border-[#d0ddca] bg-white"><CardContent className="p-8 text-center text-sm text-[#718078]">No saved sites yet. Start your first scan to create one.</CardContent></Card> : <div className="grid gap-5 md:grid-cols-2">{sites.map((site) => { const latest = site.scans[0]; return <Card key={site.id} className="border-[#d0ddca] bg-white"><CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-lg text-[#19382d]">{site.name || site.url}</CardTitle><CardDescription className="mt-1 truncate">{site.url}</CardDescription></div><Badge className="bg-[#eff8d7] text-[#58713b]">{latest?.overallScore ?? "-"}</Badge></div></CardHeader><CardContent className="flex items-center justify-between gap-3"><span className="text-sm text-[#718078]">{site.scans.length} recent scan{site.scans.length === 1 ? "" : "s"}</span><div className="flex gap-2"><Link href={`/?url=${encodeURIComponent(site.url)}`} className="inline-flex h-8 items-center rounded-lg border border-[#cbd7c9] px-3 text-xs font-medium text-[#38531f] hover:bg-[#f0f4ed]">Scan again</Link><Button onClick={() => setSiteToDelete(site)} className="h-8 bg-[#fff1ee] px-3 text-xs text-[#8b3023] hover:bg-[#f8d8d2]" type="button">Delete</Button></div></CardContent></Card>; })}</div>}</section>

        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Recent scans</CardTitle><CardDescription>Compare your latest results at a glance.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Website</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead /></TableRow></TableHeader><TableBody>{allScans.slice(0, 20).map((scan) => <TableRow key={scan.id}><TableCell className="max-w-[240px] truncate font-medium text-[#38531f]">{scan.url}</TableCell><TableCell>{formatDate(scan.createdAt)}</TableCell><TableCell><Badge className={scan.status === "completed" ? "bg-[#dff1ba] text-[#38531f]" : "bg-[#eef1ed] text-[#5d6b62]"}>{scan.status}</Badge></TableCell><TableCell>{scan.overallScore ?? "-"}</TableCell><TableCell className="space-x-3 text-right"><Link className="text-xs font-semibold text-[#688227] underline underline-offset-4" href={`/scans/${scan.id}?url=${encodeURIComponent(scan.url)}`}>View</Link>{scan.status === "completed" && <a className="text-xs font-semibold text-[#688227] underline underline-offset-4" href={`/api/reports/${scan.id}`}>PDF</a>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></section>
        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Scheduled scans</CardTitle><CardDescription>Keep an eye on changes with daily or weekly checks.</CardDescription></CardHeader><CardContent className="space-y-3">{sites.map((site) => { const schedule = schedules.find((item) => item.siteId === site.id); return <div className="flex flex-col gap-3 rounded-lg border border-[#e1e8df] p-4 sm:flex-row sm:items-center sm:justify-between" key={site.id}><div className="min-w-0"><p className="truncate font-medium text-[#19382d]">{site.name || site.url}</p><p className="text-xs text-[#718078]">{schedule?.enabled ? `Next run ${formatDate(schedule.nextRunAt)}` : "Monitoring is off"}</p></div><div className="flex items-center gap-3"><Select value={schedule?.frequency || "WEEKLY"} onValueChange={(value) => void saveSchedule(site.id, value as "DAILY" | "WEEKLY")}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAILY">Daily</SelectItem><SelectItem value="WEEKLY">Weekly</SelectItem></SelectContent></Select>{schedule && <Switch checked={schedule.enabled} onCheckedChange={(checked) => void toggleSchedule(schedule, checked)} />}</div></div>; })}<div className="flex items-center justify-between border-t border-[#e1e8df] pt-4"><span className="text-sm text-[#5d6b62]">Email scan reports</span><Switch checked={emailEnabled} onCheckedChange={(checked) => void toggleEmail(checked)} /></div></CardContent></Card></section>
        <section><Card className="border-[#d0ddca] bg-white"><CardHeader><CardTitle className="text-xl text-[#19382d]">Authenticated sessions</CardTitle><CardDescription>Upload Playwright storage state or register a secure manual handoff for MFA/CAPTCHA-protected pages. Only upload sessions you own and are authorized to use. Expired sessions are cleaned automatically.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input value={browserStateLabel} onChange={(event) => setBrowserStateLabel(event.target.value)} placeholder="Session label" /><Input accept="application/json" onChange={(event) => void uploadBrowserState(event)} type="file" /><span className="self-center text-xs text-[#718078]">JSON only</span></div><div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><Select value={browserStateKind} onValueChange={(value) => setBrowserStateKind(value as "storage_state" | "manual_handoff")}><SelectTrigger className="w-full"><SelectValue placeholder="Session type" /></SelectTrigger><SelectContent><SelectItem value="storage_state">Playwright storage state</SelectItem><SelectItem value="manual_handoff">Manual secure handoff</SelectItem></SelectContent></Select>{browserStateKind === "manual_handoff" && <Input value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} placeholder="Describe MFA/CAPTCHA steps" />} </div>{browserStateError && <Alert className="border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertDescription>{browserStateError}</AlertDescription></Alert>}<Alert className="border-[#d9e4d3] bg-[#f7faf4] text-[#38531f]"><AlertDescription>Do not upload credentials, cookies, or browser state that belongs to someone else. This session is encrypted and must be used only for your own authorized website testing. Manual handoff is meant for secure MFA/CAPTCHA scenarios where automation cannot proceed unaided.</AlertDescription></Alert><div className="space-y-2">{browserStates.length === 0 ? <p className="text-sm text-[#718078]">No authenticated sessions saved.</p> : browserStates.map((state) => <div className="flex items-center justify-between rounded-lg border border-[#e1e8df] p-3" key={state.id}><div><p className="font-medium text-[#19382d]">{state.label}</p><p className="text-xs text-[#718078]">{state.kind === "manual_handoff" ? "Manual secure handoff" : "Storage state"}{state.manualNotes ? ` · ${state.manualNotes.slice(0, 60)}` : ""}</p><p className="text-xs text-[#718078]">Added {formatDate(state.createdAt)}{state.expiresAt ? ` · expires ${formatDate(state.expiresAt)}` : ""}</p></div><Button className="h-8 bg-[#fff1ee] px-3 text-xs text-[#8b3023] hover:bg-[#f8d8d2]" onClick={() => void deleteBrowserState(state.id)} type="button">Delete</Button></div>)}</div></CardContent></Card></section>
      </div>
      <Dialog open={billingOpen} onOpenChange={setBillingOpen}><DialogContent><DialogHeader><DialogTitle>Choose an AccessiScan plan</DialogTitle><DialogDescription>Pay securely in INR with Razorpay.</DialogDescription></DialogHeader><RadioGroup className="mt-4" onValueChange={(value) => setSelectedPlan(value as Exclude<Plan, "FREE">)} value={selectedPlan}><label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><RadioGroupItem value="INDIE" /><span><strong>Indie</strong><span className="ml-2 text-sm text-muted-foreground">₹200/month</span></span></label><label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><RadioGroupItem value="BUSINESS" /><span><strong>Business</strong><span className="ml-2 text-sm text-muted-foreground">₹1,500/month</span></span></label><label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3"><RadioGroupItem value="AGENCY" /><span><strong>Agency</strong><span className="ml-2 text-sm text-muted-foreground">₹5,000/month</span></span></label></RadioGroup>{billingError && <Alert className="mt-4 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertDescription>{billingError}</AlertDescription></Alert>}<Button className="mt-5 w-full bg-[#19382d] text-white hover:bg-[#285342]" onClick={() => void startPayment()} type="button">Continue to Razorpay</Button></DialogContent></Dialog>
      <script async src="https://checkout.razorpay.com/v1/checkout.js" />
      <AlertDialog open={Boolean(siteToDelete)} onOpenChange={(open) => !open && setSiteToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete saved site?</AlertDialogTitle><AlertDialogDescription>This removes the site and its scan history permanently.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#8b3023] text-white hover:bg-[#6f241b]" onClick={() => void deleteSite()}>Delete site</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}