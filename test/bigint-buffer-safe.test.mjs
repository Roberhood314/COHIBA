import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bigintBuffer = require("../vendor/bigint-buffer-safe/index.cjs");

test("vendored bigint-buffer compatibility shim rejects unsafe input and preserves API", () => {
  assert.equal(bigintBuffer.toBigIntBE(Buffer.from([0x01, 0x00])), 256n);
  assert.equal(bigintBuffer.toBigIntLE(Buffer.from([0x00, 0x01])), 256n);
  assert.deepEqual(bigintBuffer.toBufferBE(256n, 2), Buffer.from([0x01, 0x00]));
  assert.deepEqual(bigintBuffer.toBufferLE(256n, 2), Buffer.from([0x00, 0x01]));

  assert.throws(() => bigintBuffer.toBigIntLE(null), TypeError);
  assert.throws(() => bigintBuffer.toBigIntBE("0100"), TypeError);
  assert.throws(() => bigintBuffer.toBufferLE(1n, -1), TypeError);
});
