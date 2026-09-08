import { expect, test } from "@playwright/test"


test("an expired API session is cleared with actionable login feedback", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("auth-session-seeded")) return
    window.sessionStorage.setItem("auth-session-seeded", "true")
    window.localStorage.setItem("token", "expired-e2e-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["dashboards.view"]))
  })
  await page.route("http://localhost:8000/**", async (route) => {
    await route.fulfill({ status: 401, json: { detail: "Could not validate credentials" } })
  })

  await page.goto("/admin")

  await expect(page).toHaveURL(/\/?reason=session_expired$/)
  await expect(page.getByText("Your session expired. Sign in again to continue securely.")).toBeVisible()
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull()
})
