import Link from "next/link";

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
import { Skeleton } from "@/components/ui/skeleton";
import { ScanResults } from "./scan-results";

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
          <ScanResults initialUrl={url} scanId={scanId} />
        </section>
      </div>
    </main>
  );
}