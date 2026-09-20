import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

type ScanRouteProps = {
  params: Promise<{ scanId: string }>;
};

export async function GET(_request: Request, { params }: ScanRouteProps) {
  const { userId } = await auth();
  const actionKey = _request.headers.get("x-accessiscan-api-key");
  const isActionRequest = Boolean(
    actionKey && process.env.ACCESSISCAN_ACTION_API_KEY && actionKey === process.env.ACCESSISCAN_ACTION_API_KEY,
  );
  if (!userId && !isActionRequest) {
    return NextResponse.json({ error: "Sign in to view this scan." }, { status: 401 });
  }

  const { scanId } = await params;
  const scan = await prisma.scan.findUnique({
    include: {
      issues: {
        where: { suppressedAt: null },
        orderBy: [{ impact: "desc" }, { rule: "asc" }],
      },
      pages: { orderBy: { depth: "asc" } },
    },
    where: userId
      ? { id: scanId, user: { clerkId: userId } }
      : { id: scanId, userId: null },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  return NextResponse.json({
    scan: {
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
      finalUrl: scan.finalUrl,
      failureReason: scan.failureReason,
      httpStatus: scan.httpStatus,
      id: scan.id,
      issues: scan.issues,
      pages: scan.pages,
      overallScore: scan.overallScore,
      bestPracticesScore: scan.bestPracticesScore,
      lighthouseAudits: scan.lighthouseAudits,
      lighthouseError: scan.lighthouseError,
      aeoSignals: scan.aeoSignals,
      geoSignals: scan.geoSignals,
      lighthouseMetrics: scan.lighthouseMetrics,
      pageTitle: scan.pageTitle,
      performanceScore: scan.performanceScore,
      seoScore: scan.seoScore,
      status: scan.status.toLowerCase(),
      url: scan.url,
    },
  });
}