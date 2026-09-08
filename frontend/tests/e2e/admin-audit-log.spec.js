import { expect, test } from "@playwright/test"


const installAdminSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["audit.view"]))
  })
}

const auditEvent = (overrides = {}) => ({
  id: 1,
  domain: "attendance",
  entity_type: "therapist_workday",
  entity_id: "81",
  action: "ended",
  outcome: "success",
  actor_id: 17,
  actor_name: "Field Therapist",
  actor_role: "therapist",
  business_date: "2026-09-01",
  from_state: "active",
  to_state: "ended_early",
  reason_code: "early_closure",
  reason: "Family emergency required an early departure.",
  related_entity_type: "therapist",
  related_entity_id: "17",
  correlation_id: null,
  details: { pending_count: 1 },
  occurred_at: "2026-09-01T08:00:00Z",
  ...overrides,
})

test("admin filters the privacy-safe operational audit log", async ({ page }) => {
  await installAdminSession(page)
  const requestedQueries = []

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === "GET" && url.pathname === "/audit-events/") {
      requestedQueries.push(Object.fromEntries(url.searchParams))
      const financialOnly = url.searchParams.get("domain") === "financial"
      const items = financialOnly
        ? [auditEvent({
            id: 2,
            action: "approved",
            actor_name: "Claims Reviewer",
            actor_role: "admin",
            domain: "financial",
            entity_id: "42",
            entity_type: "doctor_claim",
            from_state: "pending",
            reason: null,
            reason_code: null,
            to_state: "approved",
          })]
        : [auditEvent()]
      await route.fulfill({
        json: { items, limit: 50, offset: 0, total: items.length },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/admin/audit-log")
  await expect(page.getByRole("heading", { name: "Operational audit log" })).toBeVisible()
  await expect(page.getByText("Field Therapist")).toBeVisible()
  await expect(page.getByText("Structured audit fields exclude patient identity")).toBeVisible()
  await expect(
    page.getByLabel("Audit domain").locator('option[value="administration"]'),
  ).toHaveText("Staff administration")
  await expect(
    page.getByLabel("Audit domain").locator('option[value="configuration"]'),
  ).toHaveText("Configuration")
  await expect(
    page.getByLabel("Audit domain").locator('option[value="notification"]'),
  ).toHaveText("Notifications")

  await page.getByLabel("Audit domain").selectOption("financial")
  await page.getByLabel("Audit action").fill("approved")
  await page.getByRole("button", { name: "Apply filters" }).click()

  await expect(page.getByText("Claims Reviewer")).toBeVisible()
  await expect(page.getByText("Doctor Claim #42")).toBeVisible()
  await expect.poll(() => requestedQueries.at(-1)).toMatchObject({
    action: "approved",
    domain: "financial",
    limit: "50",
    offset: "0",
  })
})
