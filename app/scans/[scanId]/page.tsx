import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ScanStatusPageProps = {
  params: Promise<{ scanId: string }>;
  searchParams: Promise<{ url?: string }>;
};

export default async function ScanStatusPage({
  params,
  searchParams,
}: ScanStatusPageProps) {
  const { scanId } = await params;
  const { url } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f5f7f2] px-6 py-6 text-[#19251f] sm:px-10 lg:px-14">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col">
        <header className="flex items-center justify-between border-b border-[#d7dfd5] pb-5">
          <Link className="flex items-center gap-3 text-sm font-semibold tracking-[0.16em] text-[#19382d]" href="/">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d8f36a] text-lg font-bold tracking-normal text-[#19382d]">A</span>
            ACCESSISCAN
          </Link>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#718078]">Scan status</span>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-2xl border-[#d0ddca] bg-white shadow-[0_24px_70px_rgba(25,56,45,0.1)]">
            <CardHeader className="border-b border-[#e1e8df] p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardDescription className="text-[#718078]">Your scan request</CardDescription>
                  <CardTitle className="mt-2 text-2xl tracking-[-0.03em] text-[#19382d]">Preparing your website scan</CardTitle>
                </div>
                <Badge className="w-fit bg-[#eff8d7] text-[#58713b] hover:bg-[#eff8d7]">Queued</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#89958c]">Website</p>
                {url ? (
                  <p className="break-all text-base font-medium text-[#19382d]">{url}</p>
                ) : (
                  <Skeleton className="h-5 w-3/4 bg-[#e3eddb]" />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#89958c]">Scan ID</p>
                <p className="break-all font-mono text-sm text-[#5d6b62]">{scanId}</p>
              </div>

              <Alert className="border-[#d9e4d3] bg-[#f7faf4] text-[#38531f]">
                <AlertTitle>Waiting for the scanner</AlertTitle>
                <AlertDescription className="text-[#68776d]">
                  The worker and persistent scan status will be connected in the next infrastructure steps.
                </AlertDescription>
              </Alert>

              <Button asChild className="bg-[#19382d] text-white hover:bg-[#285342]">
                <Link href="/">Scan another website</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}