import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ stateId: string }> };

export async function DELETE(_request: Request, { params }: Props) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { stateId } = await params;
  const result = await prisma.browserState.deleteMany({ where: { id: stateId, user: { clerkId: user.id } } });
  return result.count ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Browser state not found." }, { status: 404 });
}