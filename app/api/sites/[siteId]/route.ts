import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type SiteRouteProps = { params: Promise<{ siteId: string }> };

export async function DELETE(_request: Request, { params }: SiteRouteProps) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({
    where: { id: siteId, user: { clerkId: userId } },
  });
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });

  await prisma.site.delete({ where: { id: site.id } });
  return new NextResponse(null, { status: 204 });
}