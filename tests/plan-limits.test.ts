import assert from "node:assert/strict";
import test from "node:test";

import { hasPaidPlan, planLimits } from "../lib/plan-limits";

test("free users receive the one-page, shallow scan allowance", () => {
  assert.deepEqual(planLimits.FREE, { maxDepth: 0, maxPages: 1 });
});

test("paid plans are recognized consistently", () => {
  assert.equal(hasPaidPlan("FREE"), false);
  assert.equal(hasPaidPlan("INDIE"), true);
  assert.equal(hasPaidPlan("BUSINESS"), true);
  assert.equal(hasPaidPlan("AGENCY"), true);
});

test("paid plan limits increase with the plan tier", () => {
  assert.ok(planLimits.INDIE.maxPages < planLimits.BUSINESS.maxPages);
  assert.ok(planLimits.BUSINESS.maxPages < planLimits.AGENCY.maxPages);
});
