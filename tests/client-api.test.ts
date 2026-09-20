import assert from "node:assert/strict";
import test from "node:test";
import { getPaidResource, requestJson } from "../lib/client-api";

test("free accounts never request paid schedules or browser states", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected paid request"); });
  assert.deepEqual(await getPaidResource("FREE", "/api/schedules", { schedules: [] }), { schedules: [] });
  assert.deepEqual(await getPaidResource("FREE", "/api/browser-states", { states: [] }), { states: [] });
  assert.equal(fetch.mock.callCount(), 0);
});

test("paid accounts load protected resources", async (t) => {
  const schedules = [{ id: "schedule-1", frequency: "WEEKLY" }];
  t.mock.method(globalThis, "fetch", async () => Response.json({ schedules }));
  assert.deepEqual(await getPaidResource("INDIE", "/api/schedules", { schedules: [] }), { schedules });
});

test("a denied schedule change preserves the API's upgrade message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Upgrade to a paid plan to schedule scans." }, { status: 403 }));
  await assert.rejects(requestJson("/api/schedules", { method: "POST" }), /Upgrade to a paid plan/);
});

test("HTML server errors produce a usable error instead of a JSON parse failure", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Server error</html>", { status: 500 }));
  await assert.rejects(requestJson("/api/schedules/one", { method: "PATCH" }), /Request failed \(500\)/);
});

test("network failures can be caught by section error handlers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network unavailable"); });
  await assert.rejects(requestJson("/api/schedules"), /Network unavailable/);
});

test("successful schedule changes return the server state including the next run", async (t) => {
  const schedule = { id: "one", enabled: true, nextRunAt: "2026-10-01T00:00:00Z" };
  t.mock.method(globalThis, "fetch", async () => Response.json({ schedule }));
  assert.deepEqual(await requestJson("/api/schedules/one", { method: "PATCH" }), { schedule });
});
