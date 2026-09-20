import assert from "node:assert/strict";
import test from "node:test";

import { assertPublicUrl, resolvePublicHostname } from "../lib/url-safety";

test("allows a public IP address", async () => {
  assert.equal(await assertPublicUrl("https://93.184.216.34/"), "https://93.184.216.34/");
});

test("rejects private, loopback, metadata, and IPv4-mapped addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.10",
    "[::1]",
    "[::ffff:127.0.0.1]",
  ]) {
    await assert.rejects(() => resolvePublicHostname(address));
  }
});

test("rejects unsupported protocols and embedded credentials", async () => {
  await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), /HTTP and HTTPS/);
  await assert.rejects(() => assertPublicUrl("https://user:password@93.184.216.34"), /credentials/);
});

test("rejects local hostnames before DNS resolution", async () => {
  await assert.rejects(() => resolvePublicHostname("service.local"), /Private and local/);
  await assert.rejects(() => resolvePublicHostname("metadata.google.internal"), /Private and local/);
});
