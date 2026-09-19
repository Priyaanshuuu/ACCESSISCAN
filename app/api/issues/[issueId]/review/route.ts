import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ issueId: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { issueId } = await params;
  const body = (await request.json()) as {
    notes?: string;
    status?: "not_reviewed" | "in_review" | "confirmed" | "false_positive" | "needs_remediation";
  };
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, scan: { user: { clerkId: userId } } },
  });
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  if (!body.status) return NextResponse.json({ error: "A review status is required." }, { status: 400 });

  const updated = await prisma.issue.update({
    data: {
      reviewNotes: body.notes?.slice(0, 4000) || null,
      reviewedAt: body.status === "not_reviewed" ? null : new Date(),
      reviewedBy: body.status === "not_reviewed" ? null : userId,
      reviewStatus: body.status,
    },
    where: { id: issue.id },
  });
  return NextResponse.json({ issue: updated });
}