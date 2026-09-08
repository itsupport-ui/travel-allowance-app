import { expect, test } from "@playwright/test"


const installDoctorSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-doctor-token")
    window.localStorage.setItem("role", "doctor")
    window.localStorage.setItem(
      "permissions",
      JSON.stringify(["consultations.own"])
    )
  })
}


const consultation = (overrides = {}) => ({
  id: 71,
  patient_name: "Lifecycle Patient",
  patient_phone: "9000000000",
  patient_address: "Audit-safe address",
  doctor_id: 8,
  doctor_visit_id: null,
  origin_consultation_id: null,
  successor_consultation_id: null,
  origin_kind: null,
  visit_id: null,
  has_visit: false,
  scheduled_date: "2026-09-08",
  scheduled_time: "10:00:00",
  purpose: "Discuss treatment options",
  notes: null,
  call_outcome: null,
  preliminary_diagnosis: null,
  proposed_treatment: null,
  estimated_amount: null,
  rejection_reason: null,
  follow_up_date: null,
  follow_up_time: null,
  follow_up_reason: null,
  cancellation_code: null,
  cancellation_reason: null,
  cancelled_by: null,
  cancelled_at: null,
  patient_decision: "pending",
  status: "scheduled",
  created_by: 1,
  created_at: "2026-09-01T08:00:00Z",
  completed_at: null,
  lifecycle_version: 1,
  updated_at: "2026-09-01T08:00:00Z",
  available_actions: ["complete", "reschedule", "cancel"],
  blocking_reasons: [],
  next_action: "complete",
  ...overrides,
})


test("doctor reschedules without overwriting the original consultation", async ({
  page,
}) => {
  await installDoctorSession(page)
  let submittedPayload = null
  let list = [consultation()]

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === "GET" && path === "/doctor-consultations/my") {
      await route.fulfill({ json: list })
      return
    }
    if (request.method() === "GET" && path === "/doctor/workday/today") {
      await route.fulfill({
        json: {
          id: null,
          is_active: false,
          should_prompt_end: false,
          available_actions: ["start_workday"],
          blocking_reasons: [],
          next_action: "start_workday",
        },
      })
      return
    }
    if (
      request.method() === "POST" &&
      path === "/doctor-consultations/71/reschedule"
    ) {
      submittedPayload = request.postDataJSON()
      const replacement = consultation({
        id: 72,
        origin_consultation_id: 71,
        origin_kind: "rescheduled",
        scheduled_date: submittedPayload.scheduled_date,
        scheduled_time: `${submittedPayload.scheduled_time}:00`,
      })
      list = [
        consultation({
          status: "cancelled",
          cancellation_code: "rescheduled",
          cancellation_reason: submittedPayload.reason,
          successor_consultation_id: 72,
          lifecycle_version: 2,
          available_actions: ["view_successor"],
          next_action: "view_successor",
        }),
        replacement,
      ]
      await route.fulfill({ status: 201, json: replacement })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/doctor/consultations")
  await page.getByRole("button", { name: "Reschedule" }).click()
  const dialog = page.getByRole("dialog", {
    name: "Reschedule consultation",
  })
  await dialog.locator("#lifecycle-date").fill("2026-09-10")
  await dialog.locator("#lifecycle-time").fill("14:30")
  await dialog
    .locator("#lifecycle-reason")
    .fill("Patient requested a later appointment")
  await dialog.getByRole("button", { name: "Create replacement" }).click()

  await expect(page.getByText("Replacement consultation scheduled")).toBeVisible()
  expect(submittedPayload).toEqual({
    lifecycle_version: 1,
    reason: "Patient requested a later appointment",
    scheduled_date: "2026-09-10",
    scheduled_time: "14:30",
  })
  await expect(
    page
      .locator("p:visible, dd:visible")
      .filter({ hasText: /10 Sept? 2026/ })
      .first()
  ).toBeVisible()
})


test("follow-up outcome requires a dated task", async ({ page }) => {
  await installDoctorSession(page)
  let submittedPayload = null

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === "GET" && path === "/doctor-consultations/my") {
      await route.fulfill({ json: [consultation()] })
      return
    }
    if (request.method() === "GET" && path === "/doctor/workday/today") {
      await route.fulfill({
        json: {
          id: null,
          is_active: false,
          should_prompt_end: false,
          available_actions: ["start_workday"],
          blocking_reasons: [],
          next_action: "start_workday",
        },
      })
      return
    }
    if (
      request.method() === "PUT" &&
      path === "/doctor-consultations/71/complete"
    ) {
      submittedPayload = request.postDataJSON()
      await route.fulfill({
        json: consultation({
          status: "completed",
          patient_decision: "follow_up",
          call_outcome: submittedPayload.call_outcome,
          follow_up_date: submittedPayload.follow_up_date,
          follow_up_time: `${submittedPayload.follow_up_time}:00`,
          follow_up_reason: submittedPayload.follow_up_reason,
          lifecycle_version: 2,
          available_actions: ["schedule_follow_up", "confirm", "reject"],
          next_action: "schedule_follow_up",
        }),
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/doctor/consultations")
  await page.getByRole("button", { name: "Complete" }).click()
  const dialog = page.getByRole("dialog", { name: "Complete consultation" })
  await dialog.locator('[name="call_outcome"]').fill("Needs symptom review")
  await dialog.locator('[name="patient_decision"]').selectOption("follow_up")
  await expect(dialog.getByText("Set a clear follow-up task")).toBeVisible()
  await dialog.locator('[name="follow_up_date"]').fill("2026-09-12")
  await dialog.locator('[name="follow_up_time"]').fill("11:15")
  await dialog
    .locator('[name="follow_up_reason"]')
    .fill("Review symptoms after medication")
  await dialog
    .getByRole("button", { name: "Complete consultation" })
    .click()

  await expect(page.getByText("Consultation completed")).toBeVisible()
  expect(submittedPayload).toMatchObject({
    lifecycle_version: 1,
    patient_decision: "follow_up",
    follow_up_date: "2026-09-12",
    follow_up_time: "11:15",
    follow_up_reason: "Review symptoms after medication",
  })
})
