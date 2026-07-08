"""Add duplicate prevention constraints

Revision ID: 0002_duplicate_constraints
Revises: 0001_initial_schema
Create Date: 2026-07-06 00:10:00

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_duplicate_constraints"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = _inspector()
    return any(
        column["name"] == column_name
        for column in inspector.get_columns(table_name)
    )


def _fk_exists(
    table_name: str,
    referred_table: str,
    constrained_columns: tuple[str, ...],
) -> bool:
    inspector = _inspector()
    for foreign_key in inspector.get_foreign_keys(table_name):
        if (
            foreign_key.get("referred_table") == referred_table
            and tuple(foreign_key.get("constrained_columns") or ())
            == constrained_columns
        ):
            return True
    return False


def _unique_exists(
    table_name: str,
    columns: tuple[str, ...],
) -> bool:
    inspector = _inspector()
    for unique_constraint in inspector.get_unique_constraints(table_name):
        if tuple(unique_constraint.get("column_names") or ()) == columns:
            return True
    for index in inspector.get_indexes(table_name):
        if (
            index.get("unique")
            and tuple(index.get("column_names") or ()) == columns
        ):
            return True
    return False


def _constraint_named(
    table_name: str,
    constraint_name: str,
) -> bool:
    inspector = _inspector()
    return any(
        unique_constraint.get("name") == constraint_name
        for unique_constraint in inspector.get_unique_constraints(table_name)
    )


def _foreign_key_named(
    table_name: str,
    foreign_key_name: str,
) -> bool:
    inspector = _inspector()
    return any(
        foreign_key.get("name") == foreign_key_name
        for foreign_key in inspector.get_foreign_keys(table_name)
    )


def _assert_no_duplicates(
    table_name: str,
    columns: tuple[str, ...],
    nullable_columns: tuple[str, ...] = (),
) -> None:
    bind = op.get_bind()
    group_columns = ", ".join(columns)

    where_clauses = [
        f"{column} IS NOT NULL"
        for column in nullable_columns
    ]
    where_sql = (
        f"WHERE {' AND '.join(where_clauses)}"
        if where_clauses
        else ""
    )

    duplicate = bind.execute(
        sa.text(
            f"""
            SELECT {group_columns}, COUNT(*) AS row_count
            FROM {table_name}
            {where_sql}
            GROUP BY {group_columns}
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()

    if duplicate is not None:
        raise RuntimeError(
            "Cannot apply uniqueness constraint on "
            f"{table_name}({', '.join(columns)}): "
            "duplicate rows exist."
        )


def upgrade() -> None:
    if not _column_exists("doctor_visits", "consultation_id"):
        op.add_column(
            "doctor_visits",
            sa.Column("consultation_id", sa.Integer(), nullable=True),
        )

    op.execute(
        sa.text(
            """
            UPDATE doctor_visits
            SET consultation_id = (
                SELECT MIN(doctor_consultations.id)
                FROM doctor_consultations
                WHERE doctor_consultations.doctor_visit_id = doctor_visits.id
            )
            WHERE consultation_id IS NULL
              AND EXISTS (
                  SELECT 1
                  FROM doctor_consultations
                  WHERE doctor_consultations.doctor_visit_id = doctor_visits.id
              )
            """
        )
    )

    if not _fk_exists(
        "doctor_visits",
        "doctor_consultations",
        ("consultation_id",),
    ):
        op.create_foreign_key(
            "fk_doctor_visits_consultation_id",
            "doctor_visits",
            "doctor_consultations",
            ["consultation_id"],
            ["id"],
        )

    _assert_no_duplicates(
        "doctor_visits",
        ("consultation_id",),
        nullable_columns=("consultation_id",),
    )
    if not _unique_exists(
        "doctor_visits",
        ("consultation_id",),
    ):
        op.create_unique_constraint(
            "uq_doctor_visits_consultation_id",
            "doctor_visits",
            ["consultation_id"],
        )

    _assert_no_duplicates(
        "doctor_consultations",
        ("doctor_visit_id",),
        nullable_columns=("doctor_visit_id",),
    )
    if not _unique_exists(
        "doctor_consultations",
        ("doctor_visit_id",),
    ):
        op.create_unique_constraint(
            "uq_doctor_consultations_doctor_visit_id_enforced",
            "doctor_consultations",
            ["doctor_visit_id"],
        )

    _assert_no_duplicates(
        "treatment_plans",
        ("doctor_visit_id",),
    )
    if not _unique_exists(
        "treatment_plans",
        ("doctor_visit_id",),
    ):
        op.create_unique_constraint(
            "uq_treatment_plans_doctor_visit_id",
            "treatment_plans",
            ["doctor_visit_id"],
        )

    _assert_no_duplicates(
        "doctor_claims",
        ("doctor_id", "claim_date"),
    )
    if not _unique_exists(
        "doctor_claims",
        ("doctor_id", "claim_date"),
    ):
        op.create_unique_constraint(
            "uq_doctor_claims_doctor_date_enforced",
            "doctor_claims",
            ["doctor_id", "claim_date"],
        )

    _assert_no_duplicates(
        "claims",
        ("therapist_id", "claim_date"),
    )
    if not _unique_exists(
        "claims",
        ("therapist_id", "claim_date"),
    ):
        op.create_unique_constraint(
            "uq_claims_therapist_date",
            "claims",
            ["therapist_id", "claim_date"],
        )


def downgrade() -> None:
    if _constraint_named("claims", "uq_claims_therapist_date"):
        op.drop_constraint(
            "uq_claims_therapist_date",
            "claims",
            type_="unique",
        )

    if _constraint_named(
        "doctor_claims",
        "uq_doctor_claims_doctor_date_enforced",
    ):
        op.drop_constraint(
            "uq_doctor_claims_doctor_date_enforced",
            "doctor_claims",
            type_="unique",
        )

    if _constraint_named(
        "treatment_plans",
        "uq_treatment_plans_doctor_visit_id",
    ):
        op.drop_constraint(
            "uq_treatment_plans_doctor_visit_id",
            "treatment_plans",
            type_="unique",
        )

    if _constraint_named(
        "doctor_consultations",
        "uq_doctor_consultations_doctor_visit_id_enforced",
    ):
        op.drop_constraint(
            "uq_doctor_consultations_doctor_visit_id_enforced",
            "doctor_consultations",
            type_="unique",
        )

    if _constraint_named(
        "doctor_visits",
        "uq_doctor_visits_consultation_id",
    ):
        op.drop_constraint(
            "uq_doctor_visits_consultation_id",
            "doctor_visits",
            type_="unique",
        )

    if _foreign_key_named(
        "doctor_visits",
        "fk_doctor_visits_consultation_id",
    ):
        op.drop_constraint(
            "fk_doctor_visits_consultation_id",
            "doctor_visits",
            type_="foreignkey",
        )

    if _column_exists("doctor_visits", "consultation_id"):
        op.drop_column("doctor_visits", "consultation_id")
