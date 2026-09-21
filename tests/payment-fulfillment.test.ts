import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { fulfillPaymentInTransaction } from "../lib/payment-fulfillment";

for (const product of ["SCANS", "SCHEDULING"] as const) {
  test(product + " checkout and webhook retries grant entitlement only once", async () => {
    let paid = false;
    let updates = 0;
    const user = { plan: "FREE", freeScanUsed: false, id: "test-user", scanCredits: 0, scansAccessUntil: null as Date | null, schedulingAccessUntil: null as Date | null };
    const tx = {
      $queryRaw: async () => [{ id: user.id }],
      payment: {
        findUnique: async () => ({ id: "test-payment", userId: user.id, product }),
        updateMany: async () => { if (paid) return { count: 0 }; paid = true; return { count: 1 }; },
      },
      user: {
        findUniqueOrThrow: async () => user,
        update: async ({ data }: { data: { scanCredits?: { increment: number }; schedulingAccessUntil?: Date } }) => { updates++; if (data.scanCredits) user.scanCredits += data.scanCredits.increment; if (data.schedulingAccessUntil) user.schedulingAccessUntil = data.schedulingAccessUntil; return user; },
      },
    };
    await fulfillPaymentInTransaction(tx as unknown as Prisma.TransactionClient, "order-test", "payment-test");
    await fulfillPaymentInTransaction(tx as unknown as Prisma.TransactionClient, "order-test", "payment-test");
    assert.equal(updates, 1);
    if (product === "SCANS") {
      assert.equal(user.scanCredits, 1);
      assert.equal(user.scansAccessUntil, null);
      assert.equal(user.schedulingAccessUntil, null);
      assert.equal(user.plan, "FREE");
      assert.equal(user.freeScanUsed, false);
    } else {
      assert.ok(user.schedulingAccessUntil && user.schedulingAccessUntil > new Date());
      assert.equal(user.scansAccessUntil, null);
      assert.equal(user.scanCredits, 0);
      assert.equal(user.plan, "FREE");
      assert.equal(user.freeScanUsed, false);
    }
  });
}
