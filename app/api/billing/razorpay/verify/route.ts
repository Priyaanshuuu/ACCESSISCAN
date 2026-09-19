import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyRazorpaySignature } from "@/lib/razorpay";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { orderId?: string; paymentId?: string; signature?: string };
  if (!body.orderId || !body.paymentId || !body.signature || !verifyRazorpaySignature(body.orderId, body.paymentId, body.signature)) return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
  const payment = await prisma.payment.findFirst({ where: { providerOrderId: body.orderId, user: { clerkId: user.id } } });
  if (!payment) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.payment.update({ data: { providerPaymentId: body.paymentId, status: "PAID" }, where: { id: payment.id } }),
    prisma.user.update({ data: { plan: payment.plan }, where: { id: payment.userId } }),
  ]);
  return NextResponse.json({ plan: payment.plan, status: "paid" });
}