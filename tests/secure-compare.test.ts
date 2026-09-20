import assert from "node:assert/strict";
import test from "node:test";

import { matchesHexSignature } from "../lib/secure-compare";

test("accepts equal hexadecimal signatures", () => {
  assert.equal(matchesHexSignature("aabbcc", "aabbcc"), true);
  assert.equal(matchesHexSignature("aabbcc", "AABBCC"), true);
});

test("rejects different or differently-sized signatures", () => {
  assert.equal(matchesHexSignature("aabbcc", "aabbcd"), false);
  assert.equal(matchesHexSignature("aabbcc", "aabb"), false);
  assert.equal(matchesHexSignature("not-hex", "not-hex"), false);
});
