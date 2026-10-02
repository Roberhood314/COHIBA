import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shim = require("../vendor/bigint-buffer-safe/index.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findInstalledBigintBufferPackages(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;

    if (entry.name === "bigint-buffer") {
      const packageJson = path.join(full, "package.json");
      if (fs.existsSync(packageJson)) results.push(packageJson);
      continue;
    }

    if (entry.name.startsWith("@")) {
      findInstalledBigintBufferPackages(full, results);
      continue;
    }

    const nested = path.join(full, "node_modules");
    if (fs.existsSync(nested)) findInstalledBigintBufferPackages(nested, results);
  }
  return results;
}

test("no vulnerable bigint-buffer version remains in installed production dependencies", () => {
  const packages = findInstalledBigintBufferPackages(path.join(root, "node_modules"));
  for (const packageJson of packages) {
    const installed = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    assert.equal(installed.name, "bigint-buffer");
    assert.equal(installed.version, "1.1.6");
  }
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
