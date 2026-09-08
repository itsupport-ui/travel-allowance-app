import assert from "node:assert/strict";
import test from "node:test";

import type { OfflineMutationItem } from "../src/types/offlineMutation";
import {
  hasOfflineMutationExpired,
  indiaBusinessDate,
  isSameOfflineMutationIntent,
  offlineMutationRoute,
  summarizeOfflineItems,
} from "../src/services/offlineMutationPolicy";

const item = (
  overrides: Partial<OfflineMutationItem> = {}
): OfflineMutationItem => ({
  attemptCount: 0,
  businessDate: "2026-09-02",
  createdAt: "2026-09-02T06:00:00.000Z",
  expiresAt: "2026-09-03T00:00:00.000Z",
  id: "operation-1",
  lastAttemptAt: null,
  lastErrorCode: null,
  operationType: "therapist_workday_start",
  ownerId: 7,
  ownerRole: "therapist",
  status: "queued",
  targetId: null,
  ...overrides,
});

test("India business date changes exactly at the IST midnight boundary", () => {
  assert.equal(
    indiaBusinessDate(new Date("2026-09-01T18:29:59.999Z")),
    "2026-09-01"
  );
  assert.equal(
    indiaBusinessDate(new Date("2026-09-01T18:30:00.000Z")),
    "2026-09-02"
  );
});

test("an earlier-business-date action expires even inside its wall-clock TTL", () => {
  assert.equal(
    hasOfflineMutationExpired(
      item(),
      "2026-09-03",
      Date.parse("2026-09-02T12:00:00.000Z")
    ),
    true
  );
  assert.equal(
    hasOfflineMutationExpired(
      item(),
      "2026-09-02",
      Date.parse("2026-09-02T12:00:00.000Z")
    ),
    false
  );
});

test("deduplication is scoped by owner, role, operation, target, and date", () => {
  const original = item({
    operationType: "therapist_treatment_punch_in",
    targetId: 19,
  });
  assert.equal(isSameOfflineMutationIntent(original, { ...original, id: "two" }), true);
  assert.equal(
    isSameOfflineMutationIntent(original, { ...original, id: "two", ownerId: 8 }),
    false
  );
  assert.equal(
    isSameOfflineMutationIntent(original, { ...original, id: "two", targetId: 20 }),
    false
  );
});

test("replay routes are allow-listed and target actions require an ID", () => {
  assert.equal(
    offlineMutationRoute("doctor_visit_punch_out", 42),
    "/doctor-visits/42/punch-out"
  );
  assert.equal(
    offlineMutationRoute("therapist_claim_submit", null),
    "/claims/submit"
  );
  assert.throws(
    () => offlineMutationRoute("therapist_treatment_punch_in", null),
    /valid target/
  );
});

test("queue summaries keep queued, syncing, and attention states separate", () => {
  const summary = summarizeOfflineItems([
    item(),
    item({ id: "two", status: "syncing" }),
    item({ id: "three", status: "needs_attention" }),
  ]);
  assert.equal(summary.queuedCount, 1);
  assert.equal(summary.syncingCount, 1);
  assert.equal(summary.needsAttentionCount, 1);
});
