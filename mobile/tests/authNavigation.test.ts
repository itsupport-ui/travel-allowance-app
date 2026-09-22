import assert from "node:assert/strict";
import test from "node:test";

import { isUserRole } from "../src/types/auth";
import { getHomeRoute } from "../src/utils/authNavigation";

test("telecaller is a supported authenticated role", () => {
  assert.equal(isUserRole("telecaller"), true);
});

test("telecaller lands in the consultation workspace", () => {
  assert.equal(
    getHomeRoute("telecaller"),
    "/(admin)/doctor-workflow-consultations"
  );
});

test("existing role home routes remain unchanged", () => {
  assert.equal(getHomeRoute("admin"), "/(admin)");
  assert.equal(getHomeRoute("clinical_head"), "/(admin)");
  assert.equal(getHomeRoute("doctor"), "/(doctor)/(tabs)");
  assert.equal(getHomeRoute("therapist"), "/therapist");
});
