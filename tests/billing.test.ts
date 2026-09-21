import assert from "node:assert/strict";
import test from "node:test";
import { extendMonth, hasActiveAccess, hasScanAccess, isProduct, products } from "../lib/billing";

const now = new Date("2026-01-31T12:00:00Z");
test("only the two feature purchases are accepted at their INR prices", () => {
  assert.equal(products.SCANS.amountPaise, 10000);
  assert.equal(products.SCHEDULING.amountPaise, 25000);
  for (const value of ["INDIE", "BUSINESS", "AGENCY", "__proto__", "toString", null, 100]) assert.equal(isProduct(value), false);
  assert.equal(isProduct("SCANS"), true);
  assert.equal(isProduct("SCHEDULING"), true);
});
test("monthly access expires at the boundary and rejects missing dates", () => {
  assert.equal(hasActiveAccess(now, now), false);
  assert.equal(hasActiveAccess(new Date(now.getTime() + 1), now), true);
  assert.equal(hasActiveAccess(null, now), false);
  assert.equal(hasActiveAccess("invalid", now), false);
});
test("one scan credit grants scan access, while scheduling alone does not", () => {
  const user = { plan: "FREE", scansAccessUntil: null, scanCredits: 0, schedulingAccessUntil: new Date("2026-03-01") };
  assert.equal(hasActiveAccess(user.schedulingAccessUntil, now), true);
  assert.equal(hasScanAccess(user, now), false);
  assert.equal(hasScanAccess({ ...user, scanCredits: 1 }, now), true);
  assert.equal(hasScanAccess({ ...user, plan: "PAID", scansAccessUntil: now }, now), false);
  assert.equal(hasScanAccess({ ...user, plan: "PAID", scansAccessUntil: new Date("2026-03-01") }, now), true);
});
test("calendar month renewal clamps month-end and handles leap years", () => {
  assert.equal(extendMonth(null, now).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(extendMonth(null, new Date("2028-01-31T12:00:00Z")).toISOString(), "2028-02-29T12:00:00.000Z");
  assert.equal(extendMonth(null, new Date("2026-12-15T12:00:00Z")).toISOString(), "2027-01-15T12:00:00.000Z");
});
test("early renewal preserves remaining time and late renewal starts today", () => {
  assert.equal(extendMonth(new Date("2026-03-15T12:00:00Z"), now).toISOString(), "2026-04-15T12:00:00.000Z");
  assert.equal(extendMonth(new Date("2025-12-15"), now).toISOString(), "2026-02-28T12:00:00.000Z");
});
test("historical scan purchases keep their existing access", () => {
  for (const plan of ["INDIE", "BUSINESS", "AGENCY"]) assert.equal(hasScanAccess({ plan, scansAccessUntil: null, scanCredits: 0 }, now), true);
});
