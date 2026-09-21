import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { fulfillPayment } from "@/lib/payment-fulfillment";
import { matchesHexSignature } from "@/lib/secure-compare";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!matchesHexSignature(expected, signature)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });

  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string; amount?: number; currency?: string; status?: string } } } };
  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    if (entity?.order_id && entity.id) {
      const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
      if (payment && entity.status === "captured" && entity.amount === payment.amountPaise && entity.currency === payment.currency) {
        await fulfillPayment(payment.providerOrderId, entity.id);
      }
    }
  }
  return NextResponse.json({ received: true });
}
