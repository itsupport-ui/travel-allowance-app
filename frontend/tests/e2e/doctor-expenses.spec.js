import { expect, test } from "@playwright/test"
import { Buffer } from "node:buffer"


const installDoctorSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-doctor-token")
    window.localStorage.setItem("role", "doctor")
    window.localStorage.setItem(
      "permissions",
      JSON.stringify(["doctor_expenses.manage"]),
    )
  })
}


test("doctor can submit a categorized manual expense for review", async ({ page }) => {
  await installDoctorSession(page)
  let submittedBody = ""

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (
      request.method() === "GET" &&
      ["/doctor-expenses/today", "/doctor-expenses/my", "/doctor-visits/today/completed"].includes(path)
    ) {
      await route.fulfill({ json: [] })
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
    if (request.method() === "POST" && path === "/doctor-expenses/") {
      submittedBody = request.postData() || ""
      await route.fulfill({
        status: 201,
        json: {
          id: 501,
          doctor_id: 41,
          doctor_name: null,
          expense_date: "2026-09-01",
          workday_id: null,
          visit_id: null,
          from_waypoint_id: null,
          to_waypoint_id: null,
          from_location: "Clinic",
          to_location: "Training venue",
          from_latitude: null,
          from_longitude: null,
          to_latitude: null,
          to_longitude: null,
          distance_km: null,
          transport_mode: "cab",
          fare: 250,
          proof_file: "proof.pdf",
          remarks: "Approved training travel",
          expense_category: "authorized_other",
          manual_reason: "The approved training trip was outside a patient visit.",
          manual_review_status: "pending",
          manual_review_reason: null,
          manual_reviewed_by: null,
          manual_reviewed_at: null,
          manual_revision: 1,
          manual_review_version: 1,
          policy_id: null,
          rate_applied: null,
          calculation_version: "decimal-v1",
          rounding_mode: "ROUND_HALF_UP",
          available_actions: ["edit", "cancel"],
          status: "draft",
          claim_id: null,
          created_at: "2026-09-01T08:00:00Z",
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/doctor/expenses")
  await expect(page.getByRole("heading", { name: "Doctor Expenses" })).toBeVisible()
  await page.getByRole("button", { name: "Add Expense" }).click()
  const dialog = page.getByRole("dialog", { name: "Add expense" })
  await dialog.locator('[name="entry_mode"]').selectOption("manual")
  await dialog.locator('[name="expense_date"]').fill("2026-09-01")
  await dialog.locator('[name="from_location"]').fill("Clinic")
  await dialog.locator('[name="to_location"]').fill("Training venue")
  await dialog.locator('[name="expense_category"]').selectOption("authorized_other")
  await dialog.locator('[name="transport_mode"]').selectOption("cab")
  await dialog.locator('[name="fare"]').fill("250")
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e receipt"),
  })
  await dialog.locator('[name="manual_reason"]').fill(
    "The approved training trip was outside a patient visit.",
  )
  await dialog.locator('[name="remarks"]').fill("Approved training travel")
  await dialog.getByRole("button", { name: "Add expense" }).click()

  await expect.poll(() => submittedBody).toContain('name="expense_category"')
  expect(submittedBody).toContain("authorized_other")
  expect(submittedBody).toContain('name="manual_reason"')
  expect(submittedBody).toContain("outside a patient visit")
  expect(submittedBody).toContain('name="proof_file"')
  await expect(page.getByText("Expense added")).toBeVisible()
})
