import {
  Navigate
}
from "react-router-dom"

function ProtectedRoute({
  children,
  allowedRole,
  allowedRoles,
  allowedPermission,
  allowedPermissions,
}) {

  const token =
    localStorage.getItem(
      "token"
    )

  const role =
    localStorage.getItem(
      "role"
    )

  if (!token) {

    return (
      <Navigate
        to="/"
      />
    )
  }

    const roleAllowed =
      !allowedRole || role === allowedRole
    const rolesAllowed =
      !allowedRoles ||
      allowedRoles.includes(role)

    let storedPermissions = []
    try {
      storedPermissions = JSON.parse(
        localStorage.getItem("permissions") || "[]"
      )
    } catch {
      storedPermissions = []
    }
    const hasPermission = (permission) =>
      storedPermissions.includes("*") ||
      storedPermissions.includes(permission)
    const permissionAllowed =
      !allowedPermission || hasPermission(allowedPermission)
    const permissionsAllowed =
      !allowedPermissions ||
      allowedPermissions.some(hasPermission)

    if (
      !roleAllowed ||
      !rolesAllowed ||
      !permissionAllowed ||
      !permissionsAllowed
    ) {
      return (
        <Navigate
          to="/"
        />
      )
    }

  return children
}

export default ProtectedRoute
