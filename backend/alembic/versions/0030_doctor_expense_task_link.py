"""Link doctor expenses to doctor tasks.

Revision ID: 0030_doctor_expense_task_link
Revises: 0029_doctor_tasks_places
Create Date: 2026-10-18 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0030_doctor_expense_task_link"
down_revision: Union[str, None] = "0029_doctor_tasks_places"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("doctor_expenses") as batch:
        batch.add_column(sa.Column("task_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_doctor_expenses_task_id",
            "doctor_tasks",
            ["task_id"],
            ["id"],
        )
        batch.create_unique_constraint(
            "uq_doctor_expenses_task_id",
            ["task_id"],
        )
        batch.create_index("ix_doctor_expenses_task_id", ["task_id"])


def downgrade() -> None:
    # Task expenses would become manual expenses without their route link;
    # remove the link only, keeping the expense rows for audit.
    with op.batch_alter_table("doctor_expenses") as batch:
        batch.drop_index("ix_doctor_expenses_task_id")
        batch.drop_constraint("uq_doctor_expenses_task_id", type_="unique")
        batch.drop_constraint("fk_doctor_expenses_task_id", type_="foreignkey")
        batch.drop_column("task_id")
