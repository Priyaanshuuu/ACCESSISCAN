import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type ScanRouteProps = {
  params: Promise<{ scanId: string }>;
};

export async function GET(_request: Request, { params }: ScanRouteProps) {
  const { scanId } = await params;
  const scan = await prisma.scan.findUnique({
    include: {
      issues: {
        orderBy: [{ impact: "desc" }, { rule: "asc" }],
      },
    },
    where: { id: scanId },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  return NextResponse.json({
    scan: {
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
      finalUrl: scan.finalUrl,
      httpStatus: scan.httpStatus,
      id: scan.id,
      issues: scan.issues,
      pageTitle: scan.pageTitle,
      status: scan.status.toLowerCase(),
      url: scan.url,
    },
  });
}