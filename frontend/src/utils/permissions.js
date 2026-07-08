export const getStoredPermissions = () => {
  try {
    const permissions = JSON.parse(
      localStorage.getItem("permissions") || "[]"
    )
    return Array.isArray(permissions) ? permissions : []
  } catch {
    return []
  }
}


export const hasPermission = (permission) => {
  const permissions = getStoredPermissions()
  return (
    permissions.includes("*") ||
    permissions.includes(permission)
  )
}


export const hasAnyPermission = (permissions) =>
  permissions.some((permission) => hasPermission(permission))
