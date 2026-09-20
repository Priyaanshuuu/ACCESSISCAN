import Link from "next/link";

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
    <main id="main-content" className="page-shell flex-1 text-[#19251f]">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">Website insights</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Your scan report</h1></div>
          <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/dashboard">Back to dashboard &rarr;</Link>
        </header>

        <section className="flex justify-center pb-10">
          <ScanResults initialUrl={url} scanId={scanId} />
        </section>
      </div>
    </main>
  );
}
