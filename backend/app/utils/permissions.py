ALL_PERMISSIONS = "*"


# Predefined role -> permission templates. Roles do not carry ad-hoc,
# per-user permission overrides in this system; every account is assigned
# one of these templates.
ROLE_PERMISSIONS = {
    # Full system ownership: privileged account management, financial and
    # security configuration, and complete audit access, in addition to
    # every operational permission below.
    "admin": {
        ALL_PERMISSIONS,
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
        "doctors.directory.view",
    },
    # Consultation intake and follow-up only. No access to clinical notes,
    # visits, treatment plans, schedules, attendance, travel, expenses,
    # claims, staff management, settings, or audit data.
    "telecaller": {
        "doctors.directory.view",
        "consultations.manage",
        "follow_ups.manage",
    },
    # Manages clinical staff, treatment-plan reviews, schedules,
    # attendance/location exceptions, and operational reports and
    # settings. Therapist and doctor claims are reviewed by the
    # administrator account only, not by this role. No access to
    # privileged accounts, authentication policy, reimbursement rates,
    # storage/retention configuration, security settings, or the full
    # audit log.
    "clinical_head": {
        "dashboards.view",
        "staff.manage",
        "doctors.directory.view",
        "treatment_plans.approve",
        "schedules.create",
        "follow_ups.manage",
        "staff_overrides.request",
        "staff_overrides.decide",
        "consultations.manage",
        "doctor_visits.manage",
        "settings.operational.manage",
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
