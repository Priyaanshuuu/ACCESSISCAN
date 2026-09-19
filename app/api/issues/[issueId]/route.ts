import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ issueId: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { issueId } = await params;
  const body = (await request.json()) as { reason?: string; suppressed?: boolean };
  const issue = await prisma.issue.findFirst({ where: { id: issueId, scan: { user: { clerkId: userId } } } });
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });

  const suppressed = body.suppressed === true;
  const updated = await prisma.issue.update({
    data: {
      suppressionReason: suppressed ? (body.reason || "Marked as a false positive") : null,
      suppressedAt: suppressed ? new Date() : null,
    },
    where: { id: issue.id },
  });
  return NextResponse.json({ issue: updated });
}