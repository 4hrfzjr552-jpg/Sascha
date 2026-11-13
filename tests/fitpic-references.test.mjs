import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFitpicJson, pickJeansReferences, validateFitpicReview, fitpicCheckErrorMessage } from "../api/_fitpicChecks.ts";

const photo = (index, kind, confidence = 0.98) => ({ index, kind, confidence });

test("bag on PHOTO ONE is excluded and full front is prioritized", () => {
  assert.deepEqual(pickJeansReferences({ photos: [
    photo(1, "inventory"), photo(2, "detail"), photo(3, "full_back"),
    photo(4, "full_front"), photo(5, "detail"),
  ] }, 5), [3, 2, 1, 4]);
});
test("bag on last photo is excluded without assuming it must be last", () => {
  assert.deepEqual(pickJeansReferences({ photos: [
    photo(1, "full_front"), photo(2, "detail"),
    photo(3, "full_back"), photo(4, "detail"), photo(5, "inventory"),
  ] }, 5), [0, 2, 1, 3]);
});
test("fails closed when no complete front jeans picture exists", () => {
  assert.throws(() => pickJeansReferences({ photos: [
    photo(1, "inventory"), photo(2, "detail"), photo(3, "detail"),
  ] }, 3), /gesamten Jeans-Vorderseite/);
});
test("fails closed for ambiguous/unrecognized inventory photos", () => {
  assert.throws(() => pickJeansReferences({ photos: [
    photo(1, "inventory", 0.4), photo(2, "full_front"), photo(3, "full_back"),
  ] }, 3), /nicht sicher/);
  assert.throws(() => pickJeansReferences({ photos: [
    photo(1, "full_front"), photo(1, "full_back"),
  ] }, 2), /uneindeutig/);
});
test("parses plain and fenced JSON and rejects malformed JSON", () => {
  assert.deepEqual(parseFitpicJson('{"approved":false}'), { approved: false });
  assert.deepEqual(parseFitpicJson('```json\n{"approved":true}\n```'), { approved: true });
  assert.throws(() => parseFitpicJson("nonsense"));
});
test("approval requires explicit boolean, confidence and zero issues", () => {
  assert.equal(validateFitpicReview({ approved: true, confidence: 0.91, issues: [] }).approved, true);
  assert.equal(validateFitpicReview({ approved: true, confidence: 0.91, issues: ["wrong wash"] }).approved, false);
  assert.equal(validateFitpicReview({ approved: true, confidence: 0.5, issues: [] }).approved, false);
  assert.equal(validateFitpicReview({ approved: "true", confidence: 0.99, issues: [] }).approved, false);
  assert.equal(validateFitpicReview({ approved: true, issues: [] }).approved, false);
});
test("shows actionable quota/model errors without leaking keys", () => {
  assert.match(fitpicCheckErrorMessage({status:429},"Fitpic-Prüfung"), /Kontingent/);
  assert.match(fitpicCheckErrorMessage({status:404},"Fitpic-Prüfung"), /Prüfmodell/);
});
