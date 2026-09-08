import { expect, test } from "@playwright/test"


test("treatment-plan controls follow server-owned actions instead of raw status", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["treatment_plans.approve"]))
  })
  const plan = {
    id: 41,
    doctor_visit_id: 17,
    doctor_id: 8,
    doctor_name: "Field Doctor",
    patient_name: "Test patient",
    diagnosis: "Test diagnosis",
    treatment_plan: "Test plan",
    sessions_required: 3,
    frequency: "weekly",
    duration: "3 weeks",
    special_instructions: null,
    status: "submitted",
    has_schedule: false,
    schedule_count: 0,
    available_actions: ["approve", "request_changes"],
    blocking_reasons: [],
    next_action: "review_plan",
  }
  await page.route("http://localhost:8000/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/treatment-plans/pending") {
      await route.fulfill({ json: [plan] })
    } else if (url.pathname === "/treatment-plans/approved" || url.pathname === "/therapists") {
      await route.fulfill({ json: [] })
    } else {
      await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
    }
  })

  await page.goto("/admin/treatment-plans")

  await expect(page.locator("span:visible", { hasText: "Pending review" }).first()).toBeVisible()
  await expect(page.locator("button:visible", { hasText: /^Approve$/ }).first()).toBeVisible()
  await expect(page.locator("button:visible", { hasText: /^Request changes$/ }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Generate Schedule" })).toHaveCount(0)
})
