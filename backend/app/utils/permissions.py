ALL_PERMISSIONS = "*"


ROLE_PERMISSIONS = {
    "admin": {
        "consultations.manage",
        "doctor_visits.manage",
        "treatment_plans.approve",
        "schedules.create",
        "dashboards.view",
        "claims.view",
        "claims.approve",
        "claims.reject",
    },
    "doctor": {
        "consultations.own",
        "doctor_visits.own",
        "treatment_plans.create",
        "doctor_expenses.manage",
        "doctor_claims.submit",
    },
    "therapist": {
        "schedules.own",
        "travel.manage",
        "therapist_claims.submit",
    },
}


PERMISSION_IMPLICATIONS = {
    "consultations.manage": {
        "consultations.create",
    },
    "doctor_visits.manage": {
        "doctor_visits.create",
    },
    "claims.approve": {
        "claims.view",
    },
    "claims.reject": {
        "claims.view",
    },
}


def get_role_permissions(role: str) -> set[str]:
    permissions = set(ROLE_PERMISSIONS.get(role, set()))
    expanded_permissions = set(permissions)

    for permission in permissions:
        expanded_permissions.update(
            PERMISSION_IMPLICATIONS.get(permission, set())
        )

    return expanded_permissions


def role_has_permission(role: str, permission: str) -> bool:
    permissions = get_role_permissions(role)
    return (
        ALL_PERMISSIONS in permissions
        or permission in permissions
    )
