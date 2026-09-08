import ast
from pathlib import Path


VERSIONS_DIR = Path(__file__).parents[1] / "alembic" / "versions"


def _assigned_string(tree: ast.Module, name: str) -> str | None:
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == name and isinstance(node.value, ast.Constant):
                return node.value.value
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
                if isinstance(node.value, ast.Constant):
                    return node.value.value
    return None


def test_descriptive_revision_ids_fit_the_widened_alembic_version_column():
    revisions = []
    for path in VERSIONS_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        revision = _assigned_string(tree, "revision")
        if revision:
            revisions.append(revision)

    widening_path = VERSIONS_DIR / "0019_manual_doctor_expense_review.py"
    widening_source = widening_path.read_text(encoding="utf-8")
    widening_tree = ast.parse(widening_source)
    capacity = _assigned_string(widening_tree, "ALEMBIC_VERSION_CAPACITY")
    if capacity is None:
        for node in widening_tree.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name)
                and target.id == "ALEMBIC_VERSION_CAPACITY"
                for target in node.targets
            ):
                capacity = ast.literal_eval(node.value)
                break

    assert isinstance(capacity, int)
    assert max(map(len, revisions)) <= capacity
    assert '"alembic_version"' in widening_source
    assert '"version_num"' in widening_source
    assert "type_=sa.String(length=ALEMBIC_VERSION_CAPACITY)" in widening_source


def test_consultation_updated_at_forward_migration_installs_database_default():
    migration = (
        VERSIONS_DIR / "0027_consultation_updated_at_default.py"
    ).read_text(encoding="utf-8")

    assert '"doctor_consultations"' in migration
    assert '"updated_at"' in migration
    assert "server_default=sa.func.now()" in migration
    assert "nullable=False" in migration
