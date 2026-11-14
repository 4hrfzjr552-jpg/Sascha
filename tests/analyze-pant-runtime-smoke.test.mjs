import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load real Vercel entrypoints using the same native Node ESM resolution
// that failed in production. Bundling alone masks missing ESM local imports.
const roots = ["analyze-pant.ts", "generate-fitpic.ts", "replace-background.ts", "health.ts"];

function response() {
  return {
    statusCode: 200, body: null,
    status(n) { this.statusCode=n; return this; },
    json(payload) { this.body=payload; return this; },
  };
}

test("all Vercel API entrypoints load under native Node ESM", async () => {
  for (const endpoint of roots) {
    const module = await import(`../api/${endpoint}`);
    assert.equal(typeof module.default, "function", endpoint + " must export a handler");
    const res = response();
    await module.default({method:"GET"},res);
    assert.equal(res.statusCode,endpoint==="health.ts"?200:405,endpoint + " must answer instead of crashing");
    assert.equal(typeof res.body,"object",endpoint+" must reply in JSON");
  }
});

test("no Vercel entrypoint depends on extensionless local ESM imports", () => {
  const base=join(dirname(fileURLToPath(import.meta.url)),"../api");
  for (const name of roots) {
    const contents=readFileSync(join(base,name),"utf8");
    assert.doesNotMatch(contents,/from\s*["']\.\//,name+" has a runtime-unsafe relative import");
    assert.doesNotMatch(contents,/import\s*\(\s*["']\.\//,name+" has a runtime-unsafe dynamic import");
  }
});

test("analyze-pant handles malformed POST as JSON, without contacting Gemini", async () => {
  const {default:handler}=await import("../api/analyze-pant.ts");
  const res=response();
  await handler({method:"POST",body:"not json"},res);
  assert.equal(res.statusCode,400);
  assert.match(String(res.body?.error),/Ungültige Anfrage/);
});
