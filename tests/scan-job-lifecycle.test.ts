import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalJobFailure, reconcileInterruptedScans } from "../lib/scan-job-lifecycle";

test("a failed attempt does not become a failed scan while BullMQ will retry it", () => {
  for (const state of ["active", "waiting", "delayed", "prioritized", "completed"]) assert.equal(isTerminalJobFailure(state), false);
  assert.equal(isTerminalJobFailure("failed"), true);
});

test("reconciliation preserves runnable scans and only fails terminal or orphaned jobs", async () => {
  const states = ["active", "waiting", "delayed", "prioritized", "waiting-children", "failed", "completed", "missing"];
  const failed: string[] = [];
  const released: string[] = [];
  const count = await reconcileInterruptedScans({
    listStaleScans: async () => states.map((id) => ({ id, status: "RUNNING", updatedAt: new Date(0) })),
    listJobs: async () => states.filter((state) => state !== "missing").map((state) => ({ data: { scanId: state, identity: state }, getState: async () => state })),
    markFailed: async (scan) => { failed.push(scan.id); return true; },
    releaseSlot: async (identity) => { released.push(identity); },
  });
  assert.equal(count, 3);
  assert.deepEqual(failed, ["failed", "completed", "missing"]);
  assert.deepEqual(released, ["failed", "completed"]);
});

test("a Redis outage never marks running scans failed", async () => {
  await assert.rejects(reconcileInterruptedScans({
    listStaleScans: async () => [{ id: "one", status: "RUNNING", updatedAt: new Date(0) }],
    listJobs: async () => { throw new Error("Redis unavailable"); },
    markFailed: async () => { assert.fail("Must not update scans without a queue snapshot"); },
    releaseSlot: async () => { assert.fail("Must not release slots"); },
  }), /Redis unavailable/);
});

test("a scan changed by a newer attempt is not failed or released by stale reconciliation", async () => {
  const count = await reconcileInterruptedScans({
    listStaleScans: async () => [{ id: "one", status: "RUNNING", updatedAt: new Date(0) }],
    listJobs: async () => [],
    markFailed: async () => false,
    releaseSlot: async () => { assert.fail("Must not release a newer scan's slot"); },
  });
  assert.equal(count, 0);
});
