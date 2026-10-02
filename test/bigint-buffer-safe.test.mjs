import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("deprecated bigint-buffer package is absent from the installed production tree", () => {
  const tree = execFileSync("npm", ["ls", "bigint-buffer", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  const parsed = JSON.parse(tree);
  const deps = parsed.dependencies || {};
  assert.equal(Object.prototype.hasOwnProperty.call(deps, "bigint-buffer"), false);
});

test("legacy vendored bigint-buffer compatibility shim is not used by production dependencies", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies?.["bigint-buffer"], undefined);
  assert.equal(pkg.overrides?.["bigint-buffer"], undefined);
});
