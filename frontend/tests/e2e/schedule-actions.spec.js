import { expect, test } from "@playwright/test"


test("schedule controls follow server-owned actions", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify([]))
  })

  const base = {
    area: "Test area",
    blocking_reasons: [],
    clinical_notes: null,
    doctor_id: 3,
    doctor_name: "Test doctor",
    duration_minutes: 60,
    expected_end_time: "10:00:00",
    has_conflict: false,
    instructions: "Test instructions",
    medicines: null,
    occurrence_date: "2026-09-06",
    patient_address: "Test address",
    patient_phone: null,
    patient_reference_id: null,
    precautions: null,
    priority: "normal",
    schedule_type: "one_time",
    start_date: null,
    start_time: "09:00:00",
    status: "scheduled",
    therapist_id: 4,
    therapist_name: "Test therapist",
    treatment_name: "Physiotherapy",
    visit_type: "home_visit",
  }
  const items = [
    {
      ...base,
      id: 21,
      patient_name: "Editable patient",
      operational_status: "scheduled",
      available_actions: ["view_details", "edit", "cancel"],
      next_action: "edit",
    },
    {
      ...base,
      id: 22,
      patient_name: "Active session patient",
      operational_status: "in_progress",
      available_actions: ["view_details", "monitor_session"],
      blocking_reasons: ["SESSION_IN_PROGRESS"],
      next_action: "monitor_session",
    },
  ]

  await page.route("http://localhost:8000/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/admin-schedules/review") {
      await route.fulfill({
        json: {
          items,
          summary: { today: 2, upcoming: 0, in_progress: 1, completed: 0, completed_today: 0, cancelled: 0, cancelled_today: 0, high_priority_today: 0, conflicts: 0 },
          page: 1,
          page_size: 20,
          total: 2,
          total_pages: 1,
        },
      })
      return
    }
    if (url.pathname === "/admin-schedules/form-options") {
      await route.fulfill({ json: { patients: [], doctors: [], therapists: [] } })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/admin/schedules")
  const editable = page.locator("article", { hasText: "Editable patient" })
  const active = page.locator("article", { hasText: "Active session patient" })

  await expect(editable.getByRole("link", { name: "Edit", exact: true })).toBeVisible()
  await expect(editable.getByRole("button", { name: "Cancel", exact: true })).toBeVisible()
  await expect(active.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0)
  await expect(active.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0)
})
