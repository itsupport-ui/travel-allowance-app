export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const phonePattern = /^[+]?[\d\s()-]{7,24}$/

export const isValidEmail = (value) => emailPattern.test(value.trim())
export const isValidPhone = (value) =>
  !value.trim() || phonePattern.test(value.trim())

export const validatePassword = (value, required = true) => {
  if (!value && !required) return ""
  if (value.length < 8) return "Password must contain at least 8 characters."
  return ""
}

export const isEndAfterStart = (start, end) =>
  Boolean(start && end && end > start)
