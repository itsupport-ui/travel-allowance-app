export const authConfig = (params) => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  },
  ...(params ? { params } : {}),
})

export const getErrorMessage = (error, fallback = "Something went wrong") => {
  const detail = error?.response?.data?.detail

  if (typeof detail === "string") {
    return detail
  }

  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg
  }

  return error?.message || fallback
}
