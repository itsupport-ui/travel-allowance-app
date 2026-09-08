import { expect, test } from "@playwright/test"


test("admin dashboard presents cross-profession operational totals", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["dashboards.view", "follow_ups.manage"]))
  })
  await page.route("http://localhost:8000/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/admin-dashboard/summary") {
      await route.fulfill({
        json: {
          total_therapists: 3,
          total_doctors: 2,
          total_clinical_staff: 5,
          todays_schedules: 7,
          todays_therapist_schedules: 4,
          todays_doctor_visits: 3,
          pending_claims: 2,
          approved_claims: 6,
          rejected_claims: 1,
          completed_treatments: 8,
          completed_therapist_treatments: 5,
          completed_doctor_visits: 3,
          missed_clinical_activities: 1,
          todays_claims: 4,
          open_follow_ups: 2,
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/admin")
  await expect(page.getByText("Scheduled today")).toBeVisible()
  await expect(page.getByText("Active clinical staff")).toBeVisible()
  await expect(page.getByText("Open follow-ups")).toBeVisible()
  await expect(page.getByText("Completed today")).toBeVisible()
  await expect(page.getByText("5", { exact: true })).toBeVisible()
  await expect(page.getByText("7", { exact: true })).toBeVisible()
})
