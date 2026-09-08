import { expect, test } from "@playwright/test"


const therapist = {
  id: 12,
  username: "Field Therapist",
  email: "field@example.com",
  role: "therapist",
  is_active: true,
}

const readiness = (state) => ({
  staff_role: "therapist",
  staff_id: therapist.id,
  current_state: "active",
  readiness_state: state,
  business_date: "2026-09-02",
  captured_at: "2026-09-02T06:00:00Z",
  condition_fingerprint: "safe-fingerprint",
  hard_blockers:
    state === "hard_blocked"
      ? [
          {
            code: "ACTIVE_WORKDAY",
            count: 1,
            message: "End the active workday before deactivating this profile.",
          },
        ]
      : [],
  operational_impacts:
    state === "override_required"
      ? [
          {
            code: "FUTURE_ASSIGNMENTS",
            count: 3,
            message: "Future appointments or schedules must be reviewed and reassigned.",
          },
        ]
      : [],
  available_actions:
    state === "hard_blocked"
      ? ["end_active_workday", "refresh_readiness"]
      : ["request_override", "resolve_impacts"],
  next_action:
    state === "hard_blocked" ? "end_active_workday" : "request_override",
})

const override = (status, version = 1) => ({
  id: 71,
  rule_code: "STAFF_DEACTIVATION_WITH_OPEN_IMPACTS",
  subject_role: "therapist",
  subject_id: therapist.id,
  requested_by: 1,
  request_reason: "Handover owner has been assigned for future appointments.",
  evidence_refs: [],
  captured_conditions: {},
  condition_fingerprint: "safe-fingerprint",
  before_state: { staff_status: "active" },
  after_state: null,
  status,
  decided_by: status === "approved" ? 1 : null,
  decision_reason: status === "approved" ? "Handover reviewed." : null,
  decided_at: status === "approved" ? "2026-09-02T06:05:00Z" : null,
  expires_at: "2026-09-03T06:00:00Z",
  consumed_by: null,
  consumed_at: null,
  version,
  created_at: "2026-09-02T06:00:00Z",
  available_actions: status === "approved" ? ["use_for_deactivation"] : ["approve", "reject"],
})

const installAdminSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem(
      "permissions",
      JSON.stringify(["staff_overrides.request", "staff_overrides.decide"]),
    )
  })
}

const installDirectoryRoutes = async (page, state, onUpdate = () => {}) => {
  let currentOverride = null
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === "GET" && url.pathname === "/therapists/manage") {
      await route.fulfill({ json: [therapist] })
      return
    }
    if (request.method() === "GET" && url.pathname === "/doctors/manage") {
      await route.fulfill({ json: [] })
      return
    }
    if (
      request.method() === "GET" &&
      url.pathname === `/staff/deactivation-readiness/therapist/${therapist.id}`
    ) {
      await route.fulfill({ json: readiness(state) })
      return
    }
    if (request.method() === "GET" && url.pathname === "/staff/deactivation-overrides") {
      await route.fulfill({ json: currentOverride ? [currentOverride] : [] })
      return
    }
    if (request.method() === "POST" && url.pathname === "/staff/deactivation-overrides") {
      currentOverride = override("pending")
      await route.fulfill({ json: currentOverride })
      return
    }
    if (
      request.method() === "PUT" &&
      url.pathname === `/staff/deactivation-overrides/${override("pending").id}/decision`
    ) {
      currentOverride = override("approved", 2)
      await route.fulfill({ json: currentOverride })
      return
    }
    if (
      request.method() === "PUT" &&
      url.pathname === `/therapists/${therapist.id}`
    ) {
      onUpdate(request.postDataJSON())
      await route.fulfill({
        json: { ...therapist, is_active: false },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })
}

test("active field work hard-blocks staff deactivation", async ({ page }) => {
  await installAdminSession(page)
  await installDirectoryRoutes(page, "hard_blocked")

  await page.goto("/admin/staff")
  await page.getByRole("button", { name: "View / Edit" }).click()
  await page.getByLabel("Active profile").uncheck()

  await expect(page.getByText("Status: hard blocked")).toBeVisible()
  await expect(page.getByText("ACTIVE WORKDAY · 1")).toBeVisible()
  await expect(page.getByRole("button", { name: "Save profile" })).toBeDisabled()
})

test("admin documents, approves, and consumes a one-time staff override", async ({ page }) => {
  await installAdminSession(page)
  let updatePayload = null
  await installDirectoryRoutes(
    page,
    "override_required",
    (payload) => { updatePayload = payload },
  )

  await page.goto("/admin/staff")
  await page.getByRole("button", { name: "View / Edit" }).click()
  await page.getByLabel("Active profile").uncheck()

  await expect(page.getByText("FUTURE ASSIGNMENTS · 3")).toBeVisible()
  await page.getByLabel("Deactivation and handover reason").fill(
    "Handover owner has been assigned for future appointments.",
  )
  await page.getByRole("button", { name: "Request documented override" }).click()
  await expect(page.getByText("Override #71: pending")).toBeVisible()
  await page.getByLabel("Reviewer note").fill("Handover evidence reviewed and accepted.")
  await page.getByRole("button", { name: "Approve override" }).click()
  await expect(page.getByText("Override #71: approved")).toBeVisible()

  await page.getByRole("button", { name: "Save profile" }).click()
  await expect.poll(() => updatePayload).toMatchObject({
    deactivation_reason: "Handover owner has been assigned for future appointments.",
    is_active: false,
    override_request_id: 71,
  })
})
