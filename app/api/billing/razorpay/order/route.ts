import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isProduct, products } from "@/lib/billing";
import { randomUUID } from "node:crypto";
import { razorpay } from "@/lib/razorpay";


export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const product: unknown = body?.product;
  if (!isProduct(product)) return NextResponse.json({ error: "Choose scan access or email scheduling." }, { status: 400 });
  const selectedPlan = products[product];

  const databaseUser = await prisma.user.upsert({
    create: { clerkId: user.id, email: user.emailAddresses[0]?.emailAddress ?? null },
    update: { email: user.emailAddresses[0]?.emailAddress ?? null },
    where: { clerkId: user.id },
  });
  const order = await razorpay.orders.create({
    amount: selectedPlan.amountPaise,
    currency: "INR",
    notes: { product, userId: databaseUser.id },
    receipt: `as_${randomUUID()}`,
  }) as unknown as { id: string };
  const payment = await prisma.payment.create({
    data: { amountPaise: selectedPlan.amountPaise, plan: "PAID", product, providerOrderId: order.id, userId: databaseUser.id },
  });

  return NextResponse.json({ amountPaise: selectedPlan.amountPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, paymentId: payment.id, product, productName: selectedPlan.name }, { status: 201 });
}
