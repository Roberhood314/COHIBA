"use strict";

/*
 * COHIBA vendored compatibility shim for bigint-buffer.
 * Based on the public bigint-buffer-safe implementation by LoserLab
 * (commit f8b856ee1f865ab9524d5401c434a7db3f1137be, MIT).
 *
 * Purpose: mitigate CVE-2025-3194 / GHSA-3gc7-fjrx-p6mg by removing
 * the vulnerable native bigint-buffer implementation while preserving
 * the four-function API used transitively by Solana libraries.
 */

function assertBuffer(value, fnName) {
  if (!Buffer.isBuffer(value)) {
    throw new TypeError(
      `${fnName}: expected a Buffer, got ${value === null ? "null" : typeof value}`
    );
  }
}

function assertBigInt(value, fnName) {
  if (typeof value !== "bigint") {
    throw new TypeError(
      `${fnName}: expected a bigint, got ${value === null ? "null" : typeof value}`
    );
  }
}

function assertWidth(value, fnName) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `${fnName}: expected a non-negative integer width, got ${value}`
    );
  }
}

function toBigIntBE(buf) {
  assertBuffer(buf, "toBigIntBE");
  if (buf.length === 0) return 0n;
  const hex = buf.toString("hex");
  return hex.length === 0 ? 0n : BigInt("0x" + hex);
}

function toBigIntLE(buf) {
  assertBuffer(buf, "toBigIntLE");
  if (buf.length === 0) return 0n;
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString("hex");
  return hex.length === 0 ? 0n : BigInt("0x" + hex);
}

function toBufferBE(num, width) {
  assertBigInt(num, "toBufferBE");
  assertWidth(width, "toBufferBE");
  if (width === 0) return Buffer.alloc(0);
  const hex = num.toString(16).padStart(width * 2, "0");
  return Buffer.from(hex.slice(-width * 2), "hex");
}

function toBufferLE(num, width) {
  assertBigInt(num, "toBufferLE");
  assertWidth(width, "toBufferLE");
  if (width === 0) return Buffer.alloc(0);
  const buf = toBufferBE(num, width);
  buf.reverse();
  return buf;
}

module.exports = { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE };
