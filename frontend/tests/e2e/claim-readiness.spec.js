import { expect, test } from "@playwright/test"


const installSession = async (page, role, permissions) => {
  await page.addInitScript(({ selectedRole, selectedPermissions }) => {
    window.localStorage.setItem("token", `e2e-${selectedRole}-token`)
    window.localStorage.setItem("role", selectedRole)
    window.localStorage.setItem(
      "permissions",
      JSON.stringify(selectedPermissions),
    )
  }, {
    selectedRole: role,
    selectedPermissions: permissions,
  })
}


const therapistReadyPreview = {
  business_date: "2026-09-02",
  state: "ready",
  can_submit: true,
  submission_mode: "submit",
  eligible_record_count: 2,
  eligible_record_ids: [11, 12],
  pending_review_count: 0,
  existing_claim_id: null,
  existing_claim_status: null,
  existing_claim_revision: null,
  rejection_reason: null,
  total_amount: 235.33,
  total_source: "eligible_records",
  calculation_version: "decimal-v1",
  rounding_mode: "ROUND_HALF_UP",
  available_actions: ["submit_claim"],
  blocking_reasons: [],
  next_action: "submit_claim",
  total_km: 6.35,
  per_km_rate: 9.5,
  travel_total: 60.33,
  daily_allowance: 175,
  patient_visited_today: true,
  policy_id: 4,
  policy_version: 4,
  policy_effective_from: "2026-09-02",
}


test("therapist sees the server total before submitting a claim", async ({ page }) => {
  await installSession(page, "therapist", ["travel.manage"])
  let submitted = false
  let submissionCount = 0

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === "GET" && path === "/travel/today") {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "GET" && path === "/therapist/workday/today") {
      await route.fulfill({
        json: {
          started: true,
          is_active: true,
          should_prompt_end: false,
          available_actions: ["end_workday"],
          blocking_reasons: [],
        },
      })
      return
    }
    if (request.method() === "GET" && path === "/claims/preview") {
      await route.fulfill({
        json: submitted
          ? {
              ...therapistReadyPreview,
              state: "already_submitted",
              can_submit: false,
              submission_mode: null,
              eligible_record_count: 0,
              eligible_record_ids: [],
              existing_claim_id: 91,
              existing_claim_status: "pending",
              existing_claim_revision: 1,
              total_source: "existing_claim",
              available_actions: ["view_claim"],
              next_action: "view_claim",
            }
          : therapistReadyPreview,
      })
      return
    }
    if (request.method() === "POST" && path === "/claims/submit") {
      submissionCount += 1
      submitted = true
      await route.fulfill({
        json: {
          id: 91,
          claim_date: "2026-09-02",
          total_km: 6.35,
          per_km_rate: 9.5,
          travel_total: 60.33,
          daily_allowance: 175,
          grand_total: 235.33,
          patient_visited_today: true,
          status: "pending",
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/travel/today")
  const preview = page.getByTestId("therapist-claim-readiness")
  await expect(preview.getByRole("heading", { name: "Today's claim preview" })).toBeVisible()
  await expect(preview.getByText("₹235.33")).toBeVisible()
  await expect(preview.getByText("Policy v4")).toBeVisible()

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("2 travel entries")
    expect(dialog.message()).toContain("₹235.33")
    await dialog.accept()
  })
  await page.getByRole("button", { name: "Submit Claim" }).click()

  await expect(preview.getByText("already submitted")).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit Claim" })).toBeDisabled()
  expect(submissionCount).toBe(1)
})


test("doctor sees the exact manual-review blocker from the server", async ({ page }) => {
  await installSession(page, "doctor", ["doctor_claims.submit"])

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (
      request.method() === "GET" &&
      ["/doctor-expenses/today", "/doctor-claims/my"].includes(path)
    ) {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "GET" && path === "/doctor/workday/today") {
      await route.fulfill({
        json: {
          started: true,
          is_active: true,
          should_prompt_end: false,
          available_actions: ["end_workday"],
          blocking_reasons: [],
        },
      })
      return
    }
    if (request.method() === "GET" && path === "/doctor-claims/preview") {
      await route.fulfill({
        json: {
          business_date: "2026-09-02",
          state: "blocked",
          can_submit: false,
          submission_mode: "submit",
          eligible_record_count: 1,
          eligible_record_ids: [42],
          pending_review_count: 1,
          existing_claim_id: null,
          existing_claim_status: null,
          existing_claim_revision: null,
          rejection_reason: null,
          total_amount: 125,
          total_source: "eligible_records",
          calculation_version: "decimal-v1",
          rounding_mode: "ROUND_HALF_UP",
          available_actions: ["open_manual_expense"],
          blocking_reasons: [{
            code: "MANUAL_DOCTOR_EXPENSE_REVIEW_REQUIRED",
            message: "Resolve all manual expense reviews before submitting today's claim so no expense is stranded outside it.",
            recoverable: true,
            suggested_action: "open_manual_expense",
            affected_count: 1,
            blocking_fields: ["manual_review_status"],
          }],
          next_action: "open_manual_expense",
          expense_total: 125,
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/doctor/claims")
  const preview = page.getByTestId("doctor-claim-readiness")
  await expect(preview.getByText("Today's server-calculated preview")).toBeVisible()
  await expect(preview.getByText(/Resolve all manual expense reviews/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Submit Claim" })).toBeDisabled()
})
