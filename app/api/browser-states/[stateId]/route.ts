import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hasScanAccess } from "@/lib/billing";

type Props = { params: Promise<{ stateId: string }> };

export async function DELETE(_request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const databaseUser = await prisma.user.findUnique({ where: { clerkId: user.id } });
  if (!databaseUser || !hasScanAccess(databaseUser)) {
    return NextResponse.json({ error: "Upgrade to a paid plan to use authenticated browser sessions." }, { status: 403 });
  }
  const { stateId } = await params;
  const result = await prisma.browserState.deleteMany({ where: { id: stateId, userId: databaseUser.id } });
  return result.count ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Browser state not found." }, { status: 404 });
}
