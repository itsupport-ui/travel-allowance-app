import api from "./api"
import { waitForReportExportJob } from "./reportExportJob"

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` })

export const previewMyClaimsReport = async (
  token,
  filters,
  reportType = "my_claims",
) => {
  const response = await api.post(
    "/reports/preview",
    {
      report_type: reportType,
      from_date: filters.fromDate || null,
      to_date: filters.toDate || null,
      status: filters.status || "all",
    },
    { headers: authHeaders(token) }
  )
  return response.data
}

export const downloadMyClaimsReport = async (token, filters, format) => {
  let endpoint = "/reports/my-claims/export"
  if (filters.snapshotId) {
    const job = await api.post(
      "/reports/exports",
      {
        snapshot_id: filters.snapshotId,
        format,
        idempotency_key: `${filters.snapshotId}:${format}`,
      },
      { headers: authHeaders(token) },
    )
    const readyJob = await waitForReportExportJob(
      api,
      job.data,
      { headers: authHeaders(token) },
    )
    endpoint = readyJob.download_url
  }
  const response = await api.get(endpoint, {
    headers: authHeaders(token),
    params: {
      from_date: filters.fromDate || undefined,
      to_date: filters.toDate || undefined,
      status: filters.status || "all",
      format,
      snapshot_id: undefined,
    },
    responseType: "blob",
  })
  const disposition = response.headers["content-disposition"] || ""
  const filename =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
    `my-claims.${format}`
  return {
    blob: response.data,
    filename,
    snapshotId: response.headers["x-report-snapshot-id"] || null,
  }
}

export const getReportExportHistory = async (
  token,
  scope = "mine",
  limit = 6
) => {
  const response = await api.get("/reports/exports/history", {
    headers: authHeaders(token),
    params: { scope, limit },
  })
  return response.data
}

export const getReportExportEvents = async (
  token,
  scope = "mine",
  limit = 20,
) => {
  const response = await api.get("/reports/exports/events", {
    headers: authHeaders(token),
    params: { scope, limit },
  })
  return response.data
}

export const getReportOperationsHealth = async (token) => {
  const response = await api.get("/reports/operations/health", {
    headers: authHeaders(token),
  })
  return response.data
}
