import assert from "node:assert/strict";
import test from "node:test";

import {
  isSecureDraftMetadata,
  MAX_SECURE_DRAFT_CHUNKS,
  SECURE_DRAFT_CHUNK_CHARACTERS,
  splitSecureDraft,
} from "../src/utils/formDraftPolicy";

test("secure form drafts split and reconstruct without changing clinical text", () => {
  const value = "Clinical plan 🩺 ".repeat(100);
  const chunks = splitSecureDraft(value);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= SECURE_DRAFT_CHUNK_CHARACTERS));
  assert.equal(chunks.join(""), value);
});

test("secure form drafts reject payloads beyond the bounded device limit", () => {
  const oversized = "x".repeat(
    SECURE_DRAFT_CHUNK_CHARACTERS * MAX_SECURE_DRAFT_CHUNKS + 1
  );

  assert.throws(() => splitSecureDraft(oversized), /too large/i);
});

test("secure draft metadata rejects unsafe keys and chunk counts", () => {
  const valid = {
    chunkCount: 2,
    digest: "a".repeat(64),
    generation: "b".repeat(32),
    savedAt: "2026-09-06T08:00:00.000Z",
    version: 2,
  };

  assert.equal(isSecureDraftMetadata(valid), true);
  assert.equal(isSecureDraftMetadata({ ...valid, digest: "../unsafe" }), false);
  assert.equal(isSecureDraftMetadata({ ...valid, chunkCount: 0 }), false);
});
