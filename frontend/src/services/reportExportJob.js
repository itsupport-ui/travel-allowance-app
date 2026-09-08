const wait = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export const waitForReportExportJob = async (
  api,
  initialJob,
  config,
  { attempts = 30, intervalMs = 1000 } = {},
) => {
  let job = initialJob
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    if (job.status === "completed" && job.download_url) return job
    if (job.status === "expired") {
      throw new Error("This report has expired. Preview it again to continue.")
    }
    if (job.status === "failed") {
      throw new Error("Report generation failed. Retry or preview a smaller range.")
    }
    if (!["queued", "processing"].includes(job.status)) {
      throw new Error("Report generation returned an unsupported status.")
    }
    if (attempt === attempts) break
    await wait(intervalMs)
    const response = await api.get(`/reports/exports/${job.id}`, config)
    job = response.data
  }
  throw new Error("The report is still processing. Retry this export shortly; the same job will be reused.")
}
