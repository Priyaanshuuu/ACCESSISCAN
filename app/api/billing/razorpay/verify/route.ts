import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { fulfillPayment } from "@/lib/payment-fulfillment";
import { razorpay, verifyRazorpaySignature } from "@/lib/razorpay";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { orderId?: string; paymentId?: string; signature?: string };
  if (!body.orderId || !body.paymentId || !body.signature || !verifyRazorpaySignature(body.orderId, body.paymentId, body.signature)) return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 400 });
  const payment = await prisma.payment.findFirst({ where: { providerOrderId: body.orderId, user: { clerkId: user.id } } });
  if (!payment) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  const captured = await razorpay.payments.fetch(body.paymentId);
  if (captured.order_id !== payment.providerOrderId || captured.status !== "captured" || Number(captured.amount) !== payment.amountPaise || captured.currency !== payment.currency) {
    return NextResponse.json({ error: "Payment is not captured yet. Access will update after payment confirmation." }, { status: 409 });
  }
  await fulfillPayment(payment.providerOrderId, body.paymentId);
  return NextResponse.json({ product: payment.product, status: "paid" });
}