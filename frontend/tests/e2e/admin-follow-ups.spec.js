import { expect, test } from "@playwright/test"


const installAdminSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["follow_ups.manage"]))
  })
}

test("admin creates and resolves an owned cross-domain follow-up", async ({ page }) => {
  await installAdminSession(page)
  let item = null

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === "GET" && url.pathname === "/operational-follow-ups/assignees") {
      await route.fulfill({ json: [{ id: 7, name: "Operations Lead" }] })
      return
    }
    if (request.method() === "GET" && url.pathname === "/operational-follow-ups") {
      const visible = item && (url.searchParams.get("status") === item.status || url.searchParams.get("status") === "all") ? [item] : []
      await route.fulfill({ json: { items: visible, total: visible.length, limit: 100, offset: 0 } })
      return
    }
    if (request.method() === "POST" && url.pathname === "/operational-follow-ups") {
      const payload = request.postDataJSON()
      item = {
        id: 11,
        ...payload,
        assignee_name: "Operations Lead",
        created_by: 1,
        creator_name: "Administrator",
        created_reason: payload.reason,
        resolution: null,
        resolved_by: null,
        resolver_name: null,
        resolved_at: null,
        status: "in_progress",
        version: 1,
        created_at: "2026-09-04T08:00:00Z",
        updated_at: "2026-09-04T08:00:00Z",
        available_actions: ["reassign", "return_to_open", "resolve", "cancel"],
      }
      await route.fulfill({ status: 201, json: item })
      return
    }
    if (request.method() === "PUT" && url.pathname === "/operational-follow-ups/11") {
      item = { ...item, status: "resolved", resolution: request.postDataJSON().reason, version: 2, available_actions: [] }
      await route.fulfill({ json: item })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/admin/follow-ups?source_domain=attendance&source_entity_type=therapist_workday&source_entity_id=42&title=Review%20early%20closure")
  await expect(page.getByRole("heading", { name: "Operational follow-ups" })).toBeVisible()
  await expect(page.getByLabel("Domain")).toHaveValue("attendance")
  await expect(page.getByLabel("Record type")).toHaveValue("therapist_workday")
  await expect(page.getByLabel("Record ID")).toHaveValue("42")
  await expect(page.getByLabel("Follow-up title")).toHaveValue("Review early closure")
  await page.getByLabel("Due date").fill("2026-09-06")
  await page.getByLabel("Owner").selectOption("7")
  await page.getByLabel("Reason").fill("Confirm the documented operational handover.")
  await page.getByRole("button", { name: "Create follow-up" }).click()

  await page.getByLabel("Queue status").selectOption("in_progress")
  await expect(page.getByText("Review early closure")).toBeVisible()
  await page.getByLabel("Decision reason for Review early closure").fill("The handover evidence was verified and accepted.")
  await page.getByRole("button", { name: "Resolve" }).click()
  await expect(page.getByText("Follow-up marked resolved.")).toBeVisible()
})
