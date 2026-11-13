import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Import the REAL Vercel function directly with Node's native ESM loader.
// This catches extensionless relative imports which GitHub's bundled-only
// check previously concealed and which crash on the production Node runtime.
test("fitpic Vercel entrypoint loads in native Node ESM", async () => {
  const mod = await import("../api/generate-fitpic.ts");
  assert.equal(typeof mod.default, "function");
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await mod.default({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.success, false);
});
test("fitpic handler does not rely on extensionless local imports", () => {
  const text = readFileSync(new URL("../api/generate-fitpic.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /from\s*["']\.\//);
});
