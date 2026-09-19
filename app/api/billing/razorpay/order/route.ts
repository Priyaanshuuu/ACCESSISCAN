import crypto from "node:crypto";

import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";

const plans = {
  INDIE: { amountPaise: 20000, name: "Indie" },
  BUSINESS: { amountPaise: 150000, name: "Business" },
  AGENCY: { amountPaise: 500000, name: "Agency" },
} as const;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { plan?: keyof typeof plans };
  if (!body.plan) return NextResponse.json({ error: "A valid paid plan is required." }, { status: 400 });
  const selectedPlanKey = body.plan;
  const selectedPlan = plans[selectedPlanKey];

  const databaseUser = await prisma.user.upsert({
    create: { clerkId: user.id, email: user.emailAddresses[0]?.emailAddress ?? null },
    update: { email: user.emailAddresses[0]?.emailAddress ?? null },
    where: { clerkId: user.id },
  });
  const order = await razorpay.orders.create({
    amount: selectedPlan.amountPaise,
    currency: "INR",
    notes: { plan: selectedPlanKey, userId: databaseUser.id },
    receipt: `accessiscan_${databaseUser.id}_${Date.now()}`,
  }) as unknown as { id: string };
  const payment = await prisma.payment.create({
    data: { amountPaise: selectedPlan.amountPaise, plan: selectedPlanKey, providerOrderId: order.id, userId: databaseUser.id },
  });

  return NextResponse.json({ amountPaise: selectedPlan.amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, paymentId: payment.id, planName: selectedPlan.name }, { status: 201 });
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}