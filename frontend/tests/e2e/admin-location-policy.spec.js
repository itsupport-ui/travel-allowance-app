import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"


const installAdminSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["dashboards.view"]))
  })
}


test("admin can create a versioned field location policy", async ({ page }) => {
  await installAdminSession(page)
  let savedRequest = null
  const baseline = {
    id: 1,
    version: 1,
    effective_from: "1970-01-01",
    effective_to: null,
    geofence_radius_m: 250,
    gps_accuracy_threshold_m: 250,
    evidence_max_age_minutes: 15,
    approval_valid_hours: 8,
    max_evidence_movement_m: 250,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
  }
  const reimbursementBaseline = {
    id: 10,
    version: 3,
    per_km_rate: 8,
    daily_allowance: 150,
    doctor_receipt_threshold: 500,
    effective_from: "2026-09-01",
    effective_to: null,
    rounding_mode: "ROUND_HALF_UP",
  }

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === "GET" && ["/settings", "/settings/"].includes(path)) {
      await route.fulfill({
        json: reimbursementBaseline,
      })
      return
    }
    if (request.method() === "GET" && path === "/settings/reimbursement-policy/history") {
      await route.fulfill({ json: [reimbursementBaseline] })
      return
    }
    if (request.method() === "GET" && path === "/settings/location-policy/history") {
      await route.fulfill({ json: [baseline] })
      return
    }
    if (request.method() === "GET" && path === "/settings/location-policy") {
      await route.fulfill({ json: baseline })
      return
    }
    if (request.method() === "PUT" && path === "/settings/location-policy") {
      savedRequest = request.postDataJSON()
      await route.fulfill({
        json: {
          ...baseline,
          ...savedRequest,
          id: 2,
          version: 2,
          created_by: 1,
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/admin/settings")
  await expect(page.getByRole("heading", { name: "Reimbursement policy history" })).toBeVisible()
  await expect(page.getByText("Receipt from INR 500.00")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Field Location Policy" })).toBeVisible()
  await expect(page.getByRole("status").last()).toContainText("version 1")
  await page.getByLabel("Patient geofence radius (m)").fill("500")
  await page.getByRole("button", { name: "Save new location policy version" }).click()

  await expect.poll(() => savedRequest).toMatchObject({
    geofence_radius_m: 500,
    gps_accuracy_threshold_m: 250,
    evidence_max_age_minutes: 15,
    approval_valid_hours: 8,
    max_evidence_movement_m: 250,
  })
  await expect(page.getByText("Version 2")).toBeVisible()

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(
    accessibility.violations.filter(({ impact }) =>
      impact === "critical" || impact === "serious"
    ),
  ).toEqual([])
})
