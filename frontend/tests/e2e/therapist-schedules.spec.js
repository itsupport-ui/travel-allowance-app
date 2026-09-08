import { expect, test } from "@playwright/test"

const installTherapistSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-test-token")
    window.localStorage.setItem("role", "therapist")
    window.localStorage.setItem(
      "permissions",
      JSON.stringify(["schedules.own"]),
    )
  })
}

const mockReadOnlyScheduleApi = async (page) => {
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() !== "GET") {
      await route.fulfill({ status: 405, json: { detail: "Read-only E2E mock" } })
      return
    }

    if (path === "/therapist/workday/today") {
      await route.fulfill({
        json: {
          started: true,
          is_active: false,
          can_end_workday: false,
          should_prompt_end: false,
        },
      })
      return
    }

    if (
      [
        "/schedule/my-today",
        "/schedule/my-upcoming",
        "/schedule/completed",
        "/schedule/missed",
      ].includes(path)
    ) {
      await route.fulfill({ json: [] })
      return
    }

    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })
}

test("unauthenticated users cannot open the therapist schedule workspace", async ({ page }) => {
  await page.goto("/therapist/schedules?view=today")

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Therapist Travel App" })).toBeVisible()
})

test("legacy schedule links preserve their selected destination", async ({ page }) => {
  await installTherapistSession(page)
  await mockReadOnlyScheduleApi(page)

  await page.goto("/upcoming-schedule")

  await expect(page).toHaveURL(/\/therapist\/schedules\?view=upcoming$/)
  await expect(page.getByRole("tab", { name: "Upcoming" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.getByText("No upcoming schedules")).toBeVisible()
})

test("therapists can switch all schedule states without leaving the workspace", async ({ page }) => {
  await installTherapistSession(page)
  await mockReadOnlyScheduleApi(page)

  await page.goto("/therapist/schedules?view=today")
  await expect(page.getByRole("heading", { name: "My Schedules" })).toBeVisible()
  await expect(page.getByText("No clinical schedules assigned for today")).toBeVisible()

  await page.getByRole("tab", { name: "Upcoming" }).click()
  await expect(page).toHaveURL(/view=upcoming/)
  await expect(page.getByText("No upcoming schedules")).toBeVisible()

  await page.getByRole("tab", { name: "Completed" }).click()
  await expect(page).toHaveURL(/view=completed/)
  await expect(page.getByText("No completed schedules found")).toBeVisible()

  await page.getByRole("tab", { name: "Missed" }).click()
  await expect(page).toHaveURL(/view=missed/)
  await expect(page.getByText("No missed schedules found")).toBeVisible()
})

test("a failed schedule request stays visible and can be retried", async ({ page }) => {
  await installTherapistSession(page)
  let upcomingAttempts = 0
  await page.route("http://localhost:8000/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/therapist/workday/today") {
      await route.fulfill({
        json: { started: true, is_active: false, should_prompt_end: false },
      })
      return
    }
    if (path === "/schedule/my-upcoming") {
      upcomingAttempts += 1
      if (upcomingAttempts <= 2) {
        await route.fulfill({ status: 503, json: { detail: "Temporary outage" } })
      } else {
        await route.fulfill({ json: [] })
      }
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/therapist/schedules?view=upcoming")
  await expect(page.getByText("Failed to fetch schedules")).toBeVisible()

  await page.getByRole("button", { name: "Retry" }).click()
  await expect(page.getByText("No upcoming schedules")).toBeVisible()
  expect(upcomingAttempts).toBe(3)
})

test("confirmation dialogs support keyboard focus and Escape recovery", async ({ page, context }) => {
  await installTherapistSession(page)
  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  })
  await context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 })
  await page.route("http://localhost:8000/**", async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/therapist/workday/today") {
      await route.fulfill({
        json: { started: true, is_active: true, should_prompt_end: false },
      })
      return
    }
    if (path === "/schedule/my-today") {
      await route.fulfill({
        json: [{
          id: 7,
          patient_name: "Test Patient",
          doctor_name: "Test Doctor",
          treatment_name: "Test Treatment",
          treatment_date: "2026-08-31",
          in_time: "10:00",
          out_time: "11:00",
          priority: "normal",
          schedule_type: "one_time",
          patient_address: "Test address",
        }],
      })
      return
    }
    if (path === "/treatment-sessions/7") {
      await route.fulfill({
        json: {
          schedule_id: 7,
          session_status: "NOT_STARTED",
          can_punch_in: true,
          can_punch_out: false,
          location_verified: true,
          eligibility_message: "Ready to start",
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/therapist/schedules?view=today")
  const punchInButton = page.getByRole("button", { name: "Punch In" })
  await expect(punchInButton).toBeVisible()
  await punchInButton.click()

  await expect(page.getByRole("dialog", { name: "Punch in to treatment?" })).toBeVisible()
  const backButton = page.getByRole("button", { name: "Back" })
  const confirmButton = page.getByRole("button", { name: "Punch In" }).last()
  await expect(backButton).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(confirmButton).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(backButton).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(punchInButton).toBeFocused()
})

test("location exception dialog explains one-time approval and restores focus", async ({ page, context }) => {
  await installTherapistSession(page)
  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  })
  await context.setGeolocation({ latitude: 13.01, longitude: 77 })
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== "GET") {
      await route.fulfill({ status: 405, json: { detail: "Read-only E2E mock" } })
      return
    }
    if (path === "/therapist/workday/today") {
      await route.fulfill({
        json: { started: true, is_active: true, should_prompt_end: false },
      })
      return
    }
    if (path === "/schedule/my-today") {
      await route.fulfill({
        json: [{
          id: 8,
          patient_name: "Exception Patient",
          doctor_name: "Test Doctor",
          treatment_name: "Test Treatment",
          treatment_date: "2026-09-01",
          in_time: "10:00",
          out_time: "11:00",
          priority: "normal",
          schedule_type: "one_time",
          patient_address: "Test address",
        }],
      })
      return
    }
    if (path === "/treatment-sessions/8") {
      await route.fulfill({
        json: {
          schedule_id: 8,
          session_status: "NOT_STARTED",
          can_punch_in: false,
          can_punch_out: false,
          can_request_location_exception: true,
          location_verified: false,
          eligibility_message: "Outside the patient visit radius.",
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/therapist/schedules?view=today")
  const requestButton = page.getByRole("button", {
    name: "Request location exception",
  })
  await requestButton.click()

  const dialog = page.getByRole("dialog", { name: "Request location exception" })
  await expect(dialog).toContainText("Approval is valid once")
  await expect(page.getByRole("textbox", { name: "Reason for exception" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(requestButton).toBeFocused()
})
