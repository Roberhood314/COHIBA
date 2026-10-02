import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shim = require("../vendor/bigint-buffer-safe/index.cjs");

test("patched bigint-buffer fork is installed in the production dependency tree", () => {
  const tree = execFileSync("npm", ["ls", "bigint-buffer", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.match(tree, /1\.1\.6-cohiba\.1/);
});

test("patched bigint-buffer fork preserves API and rejects unsafe input", () => {
  assert.equal(shim.toBigIntBE(Buffer.from([0x01, 0x00])), 256n);
  assert.equal(shim.toBigIntLE(Buffer.from([0x00, 0x01])), 256n);
  assert.deepEqual(shim.toBufferBE(256n, 2), Buffer.from([0x01, 0x00]));
  assert.deepEqual(shim.toBufferLE(256n, 2), Buffer.from([0x00, 0x01]));
  assert.throws(() => shim.toBigIntLE(null), TypeError);
  assert.throws(() => shim.toBigIntBE("0100"), TypeError);
  assert.throws(() => shim.toBufferLE(1n, -1), TypeError);
});
