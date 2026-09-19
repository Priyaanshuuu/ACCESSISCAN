import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });

  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string } } } };
  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    if (entity?.order_id && entity.id) {
      const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
      if (payment) {
        await prisma.$transaction([
          prisma.payment.update({ data: { providerPaymentId: entity.id, status: "PAID" }, where: { id: payment.id } }),
          prisma.user.update({ data: { plan: payment.plan }, where: { id: payment.userId } }),
        ]);
      }
    }
  }
  return NextResponse.json({ received: true });
}