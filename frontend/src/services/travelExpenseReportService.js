import api from "./api"
import { authConfig } from "./http"

const buildParams = ({ personType, personId, month, fromDate, toDate }) => {
  const params = {}
  if (personType) params.person_type = personType
  if (personId) params.person_id = personId
  if (month) {
    params.month = month
  } else {
    if (fromDate) params.start_date = fromDate
    if (toDate) params.end_date = toDate
  }
  return params
}

export const getTravelExpenseReport = async (filters) => {
  const response = await api.get(
    "/reports/travel-expense",
    authConfig(buildParams(filters)),
  )
  return response.data
}

const downloadTravelExpenseReport = async (filters, format) => {
  const response = await api.get(
    `/reports/travel-expense/${format}`,
    {
      ...authConfig(buildParams(filters)),
      responseType: "blob",
    },
  )
  const disposition = response.headers["content-disposition"] || ""
  const filename =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
    `travel-expense-report.${format === "excel" ? "xlsx" : format}`
  return { blob: response.data, filename }
}

export const downloadTravelExpensePdf = (filters) =>
  downloadTravelExpenseReport(filters, "pdf")

export const downloadTravelExpenseExcel = (filters) =>
  downloadTravelExpenseReport(filters, "excel")

export const downloadTravelExpenseCsv = (filters) =>
  downloadTravelExpenseReport(filters, "csv")

export const saveBlobAsFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
