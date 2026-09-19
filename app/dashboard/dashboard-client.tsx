"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

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

  async function loadDashboard() {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = (await response.json()) as { error?: string; sites?: Site[] };
    if (!response.ok) throw new Error(data.error || "Unable to load dashboard.");
    setSites(data.sites ?? []);
    const schedulesResponse = await fetch("/api/schedules", { cache: "no-store" });
    const schedulesData = (await schedulesResponse.json()) as { schedules?: Schedule[] };
    setSchedules(schedulesData.schedules ?? []);
    const preferencesResponse = await fetch("/api/notifications/preferences", { cache: "no-store" });
    const preferencesData = (await preferencesResponse.json()) as { preferences?: { emailEnabled: boolean } };
    setEmailEnabled(preferencesData.preferences?.emailEnabled ?? true);
  }

  useEffect(() => {
    void loadDashboard().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard."));
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

  if (error) {
    return <Alert className="m-8 border-[#e7b9b0] bg-[#fff1ee] text-[#8b3023]" variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] px-6 py-8 text-[#19251f] sm:px-10 lg:px-14">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-[#d7dfd5] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#688227]">Your workspace</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[#19382d]">Site dashboard</h1><p className="mt-2 text-[#68776d]">Monitor your websites and keep improvements moving.</p></div>
          <Link href="/" className="inline-flex h-9 items-center justify-center rounded-lg bg-[#19382d] px-4 text-sm font-medium text-white hover:bg-[#285342]">Scan a website</Link>
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
      </div>
      <AlertDialog open={Boolean(siteToDelete)} onOpenChange={(open) => !open && setSiteToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete saved site?</AlertDialogTitle><AlertDialogDescription>This removes the site and its scan history permanently.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-[#8b3023] text-white hover:bg-[#6f241b]" onClick={() => void deleteSite()}>Delete site</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}