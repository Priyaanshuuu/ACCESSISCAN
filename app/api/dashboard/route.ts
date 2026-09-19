import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your dashboard." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    include: {
      sites: {
        include: {
          scans: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    where: { clerkId: userId },
  });

  return NextResponse.json({ plan: user?.plan ?? "FREE", sites: user?.sites ?? [] });
}