import json

from app.database import SessionLocal
from app.services.report_retention_service import (
    cleanup_expired_report_artifacts,
)


def main() -> None:
    with SessionLocal() as db:
        result = cleanup_expired_report_artifacts(db)
    print(
        json.dumps(
            {
                "cutoff": result.cutoff.isoformat(),
                "deleted_jobs": result.deleted_jobs,
                "deleted_snapshots": result.deleted_snapshots,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
