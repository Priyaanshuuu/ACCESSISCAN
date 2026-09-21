import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extendMonth } from "@/lib/billing";

export async function fulfillPayment(orderId: string, providerPaymentId: string) {
  return prisma.$transaction((tx) => fulfillPaymentInTransaction(tx, orderId, providerPaymentId));
}

export async function fulfillPaymentInTransaction(tx: Prisma.TransactionClient, orderId: string, providerPaymentId: string) {
  const payment = await tx.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return null;
  // Serialize renewals for one account, including simultaneous webhook/checkout delivery.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${payment.userId} FOR UPDATE`;
  const claimed = await tx.payment.updateMany({
    where: { id: payment.id, status: { not: "PAID" } },
    data: { status: "PAID", providerPaymentId },
  });
  if (!claimed.count) return payment;
  const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
  await tx.user.update({
    where: { id: user.id },
    data: payment.product === "SCHEDULING"
      ? { schedulingAccessUntil: extendMonth(user.schedulingAccessUntil) }
      : { scanCredits: { increment: 1 } },
  });
  return payment;
}
