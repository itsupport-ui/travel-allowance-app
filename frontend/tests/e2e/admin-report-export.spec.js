import { expect, test } from "@playwright/test"

const installAdminSession = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("token", "e2e-admin-token")
    window.localStorage.setItem("role", "admin")
    window.localStorage.setItem("permissions", JSON.stringify(["dashboards.view"]))
  })
}

const mockAdminReportApi = async (
  page,
  {
    expired = false,
    queued = false,
    earlyClosures = [],
    locationRequests = [],
    manualTravel = [],
    manualDoctorExpenses = [],
    onEarlyClosureDecision = () => {},
    onLocationDecision = () => {},
    onManualTravelDecision = () => {},
    onManualDoctorExpenseDecision = () => {},
    onPreview = () => {},
    onJobPoll = () => {},
  } = {},
) => {
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (request.method() === "GET" && path === "/admin-schedules/form-options") {
      await route.fulfill({
        json: {
          doctors: [{ id: 41, name: "Doctor Forty One" }],
          therapists: [{ id: 17, name: "Therapist Seventeen" }],
        },
      })
      return
    }
    if (
      request.method() === "GET" &&
      ["/reports/exports/history", "/reports/exports/events"].includes(path)
    ) {
      await route.fulfill({ json: [] })
      return
    }
    if (request.method() === "GET" && path === "/reports/operations/health") {
      await route.fulfill({
        json: {
          status: "healthy",
          storage_backend: "s3",
          external_storage_configured: true,
          queued_jobs: 0,
          processing_jobs: 0,
          stale_processing_jobs: 0,
          failed_jobs_last_24h: 0,
          expired_artifacts_pending_cleanup: 0,
          oldest_pending_seconds: null,
          checked_at: "2026-09-04T08:00:00Z",
        },
      })
      return
    }
    if (request.method() === "GET" && path === "/location-exceptions") {
      await route.fulfill({ json: locationRequests })
      return
    }
    if (request.method() === "GET" && path === "/travel/manual-review") {
      await route.fulfill({ json: manualTravel })
      return
    }
    if (
      request.method() === "GET" &&
      path === "/doctor-expenses/manual-review"
    ) {
      await route.fulfill({ json: manualDoctorExpenses })
      return
    }
    if (
      request.method() === "PUT" &&
      /^\/doctor-expenses\/manual-review\/\d+\/decision$/.test(path)
    ) {
      onManualDoctorExpenseDecision(request.postDataJSON())
      await route.fulfill({
        json: {
          ...manualDoctorExpenses[0],
          manual_review_status: request.postDataJSON().decision,
          manual_review_reason: request.postDataJSON().reason,
          manual_review_version:
            (manualDoctorExpenses[0]?.manual_review_version || 1) + 1,
          available_actions: [],
        },
      })
      return
    }
    if (
      request.method() === "PUT" &&
      /^\/travel\/manual-review\/\d+\/decision$/.test(path)
    ) {
      onManualTravelDecision(request.postDataJSON())
      await route.fulfill({
        json: {
          ...manualTravel[0],
          manual_review_status: request.postDataJSON().decision,
          manual_review_reason: request.postDataJSON().reason,
          manual_review_version:
            (manualTravel[0]?.manual_review_version || 1) + 1,
          available_actions: [],
        },
      })
      return
    }
    if (
      request.method() === "GET" &&
      path === "/workday-exceptions/early-closures"
    ) {
      await route.fulfill({ json: earlyClosures })
      return
    }
    if (
      request.method() === "PUT" &&
      /^\/workday-exceptions\/early-closures\/(doctor|therapist)\/\d+\/decision$/.test(path)
    ) {
      onEarlyClosureDecision(request.postDataJSON())
      await route.fulfill({
        json: {
          ...earlyClosures[0],
          review_status: request.postDataJSON().decision,
          review_reason: request.postDataJSON().reason,
          version: (earlyClosures[0]?.version || 1) + 1,
          available_actions: [],
        },
      })
      return
    }
    if (
      request.method() === "PUT" &&
      /^\/location-exceptions\/\d+\/decision$/.test(path)
    ) {
      onLocationDecision(request.postDataJSON())
      await route.fulfill({
        json: {
          ...locationRequests[0],
          ...request.postDataJSON(),
          status: request.postDataJSON().decision,
          version: (locationRequests[0]?.version || 1) + 1,
        },
      })
      return
    }
    if (request.method() === "GET" && path === "/admin-reports/overview") {
      await route.fulfill({
        json: {
          period_label: "All available dates",
          generated_at: "2026-08-31T08:00:00Z",
          trend_period_label: "Recent activity",
          kpis: {},
          trends: [],
          claims_by_status: [],
          top_therapists: [],
          recent_activity: [],
        },
      })
      return
    }
    if (request.method() === "POST" && path === "/reports/preview") {
      onPreview(request.postDataJSON())
      await route.fulfill({
        json: {
          snapshot_id: "snapshot-e2e",
          report_type: "consolidated_claims",
          scope: "organization",
          row_count: 2,
          total_amount: 1250,
          summary: {},
          expires_at: "2026-09-01T08:00:00Z",
        },
      })
      return
    }
    if (request.method() === "POST" && path === "/reports/exports") {
      const { format } = request.postDataJSON()
      if (expired) {
        await route.fulfill({
          json: { id: `job-e2e-${format}`, status: "expired", download_url: null },
        })
        return
      }
      if (queued) {
        await route.fulfill({
          json: { id: `job-e2e-${format}`, status: "queued", download_url: null },
        })
        return
      }
      await route.fulfill({
        json: {
          id: `job-e2e-${format}`,
          status: "completed",
          download_url: `/reports/exports/job-e2e-${format}/download`,
        },
      })
      return
    }
    const statusMatch = path.match(/^\/reports\/exports\/job-e2e-(pdf|xlsx|csv)$/)
    if (request.method() === "GET" && statusMatch) {
      const format = statusMatch[1]
      onJobPoll(format)
      await route.fulfill({
        json: {
          id: `job-e2e-${format}`,
          status: "completed",
          download_url: `/reports/exports/job-e2e-${format}/download`,
        },
      })
      return
    }
    const downloadMatch = path.match(/^\/reports\/exports\/job-e2e-(pdf|xlsx|csv)\/download$/)
    if (request.method() === "GET" && downloadMatch) {
      const format = downloadMatch[1]
      const contentTypes = {
        pdf: "application/pdf",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv",
      }
      await route.fulfill({
        status: 200,
        contentType: contentTypes[format],
        headers: {
          "Content-Disposition": `attachment; filename="organization-claims-e2e.${format}"`,
          "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
          "Access-Control-Expose-Headers": "Content-Disposition",
        },
        body: `e2e ${format} fixture`,
      })
      return
    }

    await route.fulfill({ status: 404, json: { detail: "Unmocked request" } })
  })
}

test("admin previews and downloads the exact organization report snapshot", async ({ page }) => {
  await installAdminSession(page)
  await mockAdminReportApi(page)

  await page.goto("/admin/reports")
  await expect(page.getByRole("heading", { name: "Operational Reports" })).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Export operations health" }),
  ).toContainText("Export operations: healthy")

  const downloadButtons = [
    ["Download PDF", "pdf"],
    ["Download Excel", "xlsx"],
    ["Download CSV", "csv"],
  ]
  for (const [label] of downloadButtons) {
    await expect(page.getByRole("button", { name: label })).toBeDisabled()
  }

  await page.getByRole("button", { name: "Preview export" }).click()
  await expect(page.getByRole("status")).toContainText("2 claims")
  for (const [label, format] of downloadButtons) {
    const button = page.getByRole("button", { name: label })
    await expect(button).toBeEnabled()
    const downloadPromise = page.waitForEvent("download")
    await button.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`organization-claims-e2e.${format}`)
  }
})

test("an expired report remains visible and tells the admin how to recover", async ({ page }) => {
  await installAdminSession(page)
  await mockAdminReportApi(page, { expired: true })

  await page.goto("/admin/reports")
  await page.getByRole("button", { name: "Preview export" }).click()
  await expect(page.getByRole("status")).toContainText("2 claims")

  await page.getByRole("button", { name: "Download PDF" }).click()
  await expect(page.getByRole("alert")).toContainText(
    "This report has expired. Preview it again to continue.",
  )
  await expect(page.getByRole("button", { name: "Preview export" })).toBeEnabled()
})

test("admin export waits for a queued job before downloading", async ({ page }) => {
  await installAdminSession(page)
  let pollCount = 0
  await mockAdminReportApi(page, {
    queued: true,
    onJobPoll: () => { pollCount += 1 },
  })

  await page.goto("/admin/reports")
  await page.getByRole("button", { name: "Preview export" }).click()
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download CSV" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("organization-claims-e2e.csv")
  expect(pollCount).toBe(1)
})

test("admin can scope an organization export to one doctor", async ({ page }) => {
  await installAdminSession(page)
  let previewRequest = null
  await mockAdminReportApi(page, {
    onPreview: (request) => {
      previewRequest = request
    },
  })

  await page.goto("/admin/reports")
  await page.getByLabel("Report staff role").selectOption("doctor")
  await page.getByLabel("Report staff member").selectOption("41")
  await page.getByRole("button", { name: "Preview export" }).click()

  await expect(page.getByRole("status")).toContainText("2 claims")
  expect(previewRequest).toMatchObject({
    doctor_id: 41,
    role: "doctor",
    therapist_id: null,
  })
})

test("admin can preview an objective staff performance summary", async ({ page }) => {
  let previewPayload = null
  await installAdminSession(page)
  await mockAdminReportApi(page, {
    onPreview: (payload) => {
      previewPayload = payload
    },
  })

  await page.goto("/admin/reports")
  await page.getByLabel("Organization report type").selectOption(
    "organization_performance",
  )
  await expect(page.getByLabel("Report status")).toBeDisabled()
  await page.getByRole("button", { name: "Preview export" }).click()

  expect(previewPayload).toMatchObject({
    report_type: "organization_performance",
    status: "all",
  })
  await expect(page.getByRole("status")).toContainText("2 staff members")
})

test("admin can approve a pending location exception with a reason", async ({ page }) => {
  await installAdminSession(page)
  let decisionRequest = null
  await mockAdminReportApi(page, {
    locationRequests: [
      {
        id: 91,
        requested_by: 7,
        requester_name: "Field Doctor",
        staff_role: "doctor",
        target_type: "doctor_visit",
        target_id: 51,
        action: "punch_in",
        business_date: "2026-09-01",
        reason: "GPS signal is blocked inside the apartment building.",
        captured_latitude: 13.01,
        captured_longitude: 77,
        gps_accuracy_m: 80,
        gps_accuracy_threshold_m: 250,
        evidence_max_age_minutes: 15,
        approval_valid_hours: 8,
        max_evidence_movement_m: 250,
        location_policy_id: 1,
        location_policy_version: 1,
        device_timestamp: "2026-09-01T08:00:00Z",
        distance_km: 1.1,
        geofence_radius_m: 250,
        evidence_quality: "good",
        status: "pending",
        reviewed_by: null,
        reviewer_name: null,
        decision_reason: null,
        requested_at: "2026-09-01T08:00:00Z",
        reviewed_at: null,
        used_at: null,
        version: 1,
        available_actions: ["approve", "reject"],
      },
    ],
    onLocationDecision: (request) => {
      decisionRequest = request
    },
  })

  await page.goto("/admin/reports")
  await expect(page.getByText("Field Doctor")).toBeVisible()
  await page.getByRole("textbox", { name: "Review reason" }).fill(
    "Verified visit and indoor GPS obstruction.",
  )
  await page.getByRole("button", { name: "Approve once" }).click()

  await expect.poll(() => decisionRequest).toMatchObject({
    decision: "approved",
    reason: "Verified visit and indoor GPS obstruction.",
    version: 1,
  })
})

test("admin can flag an early workday closure for follow-up", async ({ page }) => {
  await installAdminSession(page)
  let decisionRequest = null
  await mockAdminReportApi(page, {
    earlyClosures: [
      {
        staff_role: "therapist",
        workday_id: 77,
        staff_id: 17,
        staff_name: "Field Therapist",
        business_date: "2026-09-01",
        started_at: "2026-09-01T03:30:00Z",
        ended_at: "2026-09-01T08:00:00Z",
        total_work_minutes: 270,
        completed_activities: 2,
        pending_activities: 1,
        missed_activities: 0,
        staff_reason: "Family emergency required an early departure.",
        review_status: "pending",
        reviewed_by: null,
        reviewer_name: null,
        review_reason: null,
        reviewed_at: null,
        version: 1,
        available_actions: ["acknowledge", "require_follow_up"],
      },
    ],
    onEarlyClosureDecision: (request) => {
      decisionRequest = request
    },
  })

  await page.goto("/admin/reports")
  await expect(
    page.getByRole("heading", { name: "Early workday closure review" }),
  ).toBeVisible()
  await expect(page.getByText("Field Therapist")).toBeVisible()
  await page.getByLabel("Required review note").fill(
    "Supervisor must confirm the remaining schedule reassignment.",
  )
  await page.getByRole("button", { name: "Needs follow-up" }).click()

  await expect.poll(() => decisionRequest).toMatchObject({
    decision: "follow_up_required",
    reason: "Supervisor must confirm the remaining schedule reassignment.",
    version: 1,
  })
})

test("admin can request corrections to manual therapist travel", async ({ page }) => {
  await installAdminSession(page)
  let decisionRequest = null
  await mockAdminReportApi(page, {
    manualTravel: [
      {
        id: 301,
        therapist_id: 17,
        therapist_name: "Field Therapist",
        travel_date: "2026-09-01",
        from_address: "Clinic",
        to_address: "Patient area",
        total_km: 9.25,
        per_km_rate: 8,
        travel_fare: 74,
        patient_visited: true,
        status: "draft",
        claim_id: null,
        patient_name: "Patient",
        transport_mode: "vehicle",
        bill_amount: null,
        invoice_file: null,
        schedule_id: null,
        policy_id: 1,
        calculation_version: "decimal-v1",
        rounding_mode: "ROUND_HALF_UP",
        arrival_latitude: null,
        arrival_longitude: null,
        manual_reason: "Automatic travel was unavailable after a device outage.",
        manual_review_status: "pending",
        manual_review_reason: null,
        manual_revision: 1,
        manual_review_version: 1,
        available_actions: ["approve", "request_changes"],
      },
    ],
    onManualTravelDecision: (request) => {
      decisionRequest = request
    },
  })

  await page.goto("/admin/reports")
  await expect(
    page.getByRole("heading", { name: "Manual travel review" }),
  ).toBeVisible()
  await page.getByLabel("Manual travel review note").fill(
    "Clarify the destination and recalculate the route distance.",
  )
  await page.getByRole("button", { name: "Request changes" }).click()

  await expect.poll(() => decisionRequest).toMatchObject({
    decision: "changes_requested",
    reason: "Clarify the destination and recalculate the route distance.",
    version: 1,
  })
})

test("admin can approve a manual doctor expense with review evidence", async ({ page }) => {
  await installAdminSession(page)
  let decisionRequest = null
  await mockAdminReportApi(page, {
    manualDoctorExpenses: [
      {
        id: 401,
        doctor_id: 41,
        doctor_name: "Field Doctor",
        expense_date: "2026-09-01",
        visit_id: null,
        from_location: "Clinic",
        to_location: "Training venue",
        transport_mode: "cab",
        fare: 250,
        proof_file: "proof.pdf",
        remarks: "Approved training travel",
        status: "draft",
        claim_id: null,
        created_at: "2026-09-01T08:00:00Z",
        expense_category: "authorized_other",
        manual_reason: "The approved training trip was outside a patient visit.",
        manual_review_status: "pending",
        manual_review_reason: null,
        manual_revision: 1,
        manual_review_version: 1,
        available_actions: ["approve", "request_changes"],
      },
    ],
    onManualDoctorExpenseDecision: (request) => {
      decisionRequest = request
    },
  })

  await page.goto("/admin/reports")
  await expect(
    page.getByRole("heading", { name: "Manual doctor expense review" }),
  ).toBeVisible()
  await page.getByLabel("Manual doctor expense review note").fill(
    "Receipt and authorization context are complete.",
  )
  await page
    .getByRole("button", { name: "Approve" })
    .last()
    .click()

  await expect.poll(() => decisionRequest).toMatchObject({
    decision: "approved",
    approved_amount: 250,
    reason: "Receipt and authorization context are complete.",
    version: 1,
  })
})
