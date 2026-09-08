import { expect, test } from "@playwright/test"


test("therapist previews one snapshot and downloads all supported formats", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-therapist-token")
    window.localStorage.setItem("role", "therapist")
    window.localStorage.setItem("permissions", JSON.stringify(["therapist_claims.submit"]))
  })
  const exportRequests = []
  let historyLoads = 0

  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === "GET" && url.pathname === "/claims/my") {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "GET" && url.pathname === "/therapist/workday/today") {
      await route.fulfill({ json: { is_active: false, should_prompt_end: false } })
      return
    }
    if (request.method() === "GET" && url.pathname === "/reports/exports/history") {
      historyLoads += 1
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "POST" && url.pathname === "/reports/preview") {
      await route.fulfill({
        json: {
          snapshot_id: "field-snapshot-1",
          report_type: "my_claims",
          row_count: 2,
          total_amount: 350,
          status_counts: { pending: 1, approved: 1, rejected: 0 },
          summary: {},
          warnings: [],
          expires_at: "2099-09-05T12:00:00Z",
        },
      })
      return
    }
    if (request.method() === "POST" && url.pathname === "/reports/exports") {
      const payload = request.postDataJSON()
      exportRequests.push(payload)
      await route.fulfill({
        json: {
          id: exportRequests.length,
          status: "completed",
          download_url: `/reports/exports/${exportRequests.length}/download`,
        },
      })
      return
    }
    if (request.method() === "GET" && /\/reports\/exports\/\d+\/download/.test(url.pathname)) {
      const format = exportRequests.at(-1)?.format ?? "pdf"
      await route.fulfill({
        body: "privacy-safe-report",
        contentType: format === "pdf" ? "application/pdf" : "application/octet-stream",
        headers: { "Content-Disposition": `attachment; filename="my-claims.${format}"` },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/claims")
  await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible()
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.getByText("2 claims")).toBeVisible()

  for (const [index, format] of ["PDF", "XLSX", "CSV"].entries()) {
    await page.getByRole("button", { name: `Download ${format}` }).click()
    await expect.poll(() => exportRequests.length).toBe(index + 1)
    await expect(page.getByText(`${format} report downloaded`)).toBeVisible()
  }
  await expect.poll(() => exportRequests.map((item) => item.format)).toEqual(["pdf", "xlsx", "csv"])
  expect(exportRequests.every((item) => item.snapshot_id === "field-snapshot-1")).toBeTruthy()
  expect(historyLoads).toBeGreaterThanOrEqual(1)
})

test("doctor can generate a self-scoped operational summary", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-doctor-token")
    window.localStorage.setItem("role", "doctor")
    window.localStorage.setItem("permissions", JSON.stringify(["doctor_claims.submit"]))
  })
  let previewPayload = null
  let exportPayload = null
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === "GET" && ["/doctor-expenses/today", "/doctor-claims/my"].includes(url.pathname)) {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "GET" && url.pathname === "/doctor-claims/preview") {
      await route.fulfill({ json: { business_date: "2026-09-05", state: "empty", eligible_record_count: 0, total_amount: 0, blocking_reasons: [], available_actions: [] } })
      return
    }
    if (request.method() === "GET" && url.pathname === "/doctor/workday/today") {
      await route.fulfill({ json: { is_active: false, should_prompt_end: false } })
      return
    }
    if (request.method() === "GET" && url.pathname === "/reports/exports/history") {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "POST" && url.pathname === "/reports/preview") {
      previewPayload = request.postDataJSON()
      await route.fulfill({ json: { snapshot_id: "doctor-performance-1", report_type: "my_performance", row_count: 1, total_amount: 225, status_counts: {}, summary: { total_workdays: 3, total_work_minutes: 900, completed_clinical_activities: 6, total_distance_km: 18 }, warnings: [], expires_at: "2099-09-05T12:00:00Z" } })
      return
    }
    if (request.method() === "POST" && url.pathname === "/reports/exports") {
      exportPayload = request.postDataJSON()
      await route.fulfill({ json: { id: 81, status: "completed", download_url: "/reports/exports/81/download" } })
      return
    }
    if (request.method() === "GET" && url.pathname === "/reports/exports/81/download") {
      await route.fulfill({ body: "doctor-summary", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers: { "Content-Disposition": "attachment; filename=doctor-operational-summary.xlsx" } })
      return
    }
    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })

  await page.goto("/doctor/claims")
  await page.getByLabel("Report").selectOption("my_performance")
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await expect(page.getByText("1 staff summary")).toBeVisible()
  await page.getByRole("button", { name: "Download XLSX" }).click()
  await expect(page.getByText("XLSX report downloaded")).toBeVisible()
  expect(previewPayload).toMatchObject({ report_type: "my_performance", status: "all" })
  expect(exportPayload).toMatchObject({ snapshot_id: "doctor-performance-1", format: "xlsx" })
})
