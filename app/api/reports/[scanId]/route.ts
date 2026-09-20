import PDFDocument from "pdfkit";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hasPaidPlan } from "@/lib/plan-limits";

type Props = { params: Promise<{ scanId: string }> };

export async function GET(request: Request, { params }: Props) {
  const { userId } = await auth();
  const actionKey = request.headers.get("x-accessiscan-api-key");
  const isActionRequest = Boolean(
    actionKey && process.env.ACCESSISCAN_ACTION_API_KEY && actionKey === process.env.ACCESSISCAN_ACTION_API_KEY,
  );
  if (!userId && !isActionRequest) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { scanId } = await params;
  const scan = await prisma.scan.findUnique({
    include: { issues: { orderBy: { severity: "asc" } }, user: { select: { plan: true } } },
    where: userId ? { id: scanId, user: { clerkId: userId } } : { id: scanId, userId: null },
  });
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (userId && (!scan.user || !hasPaidPlan(scan.user.plan))) {
    return NextResponse.json({ error: "Upgrade to a paid plan to download PDF reports." }, { status: 403 });
  }
  if (scan.status !== "COMPLETED") return NextResponse.json({ error: "Report is available after the scan completes." }, { status: 409 });

  const document = new PDFDocument({ margin: 48 });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve) => document.on("end", () => resolve(Buffer.concat(chunks))));

  document.fontSize(22).fillColor("#19382d").text("AccessiScan report");
  document.moveDown(0.5).fontSize(11).fillColor("#5d6b62").text(scan.url);
  document.moveDown().fontSize(14).fillColor("#19382d").text(`Overall score: ${scan.overallScore ?? "Unavailable"}`);
  document.fontSize(11).fillColor("#5d6b62").text(`Performance: ${scan.performanceScore ?? "-"} | SEO: ${scan.seoScore ?? "-"} | Best practices: ${scan.bestPracticesScore ?? "-"}`);
  document.moveDown().text(`Completed: ${scan.completedAt?.toISOString() ?? "-"}`);
  document.moveDown().fontSize(16).fillColor("#19382d").text("Accessibility findings");

  if (!scan.issues.length) {
    document.moveDown().fontSize(11).fillColor("#5d6b62").text("No automated accessibility findings were recorded.");
  } else {
    for (const issue of scan.issues) {
      document.moveDown(0.5).fontSize(12).fillColor("#19382d").text(`${issue.severity.toUpperCase()} - ${issue.help}`);
      document.fontSize(10).fillColor("#5d6b62").text(issue.description);
      if (issue.fix) document.text(`Suggested fix: ${issue.fix}`);
    }
  }

  document.end();
  const buffer = await completed;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="accessiscan-${scan.id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
