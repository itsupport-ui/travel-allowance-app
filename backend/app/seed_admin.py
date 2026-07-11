"""Manual entry point for the shared administrator seed service."""

import logging

from app.services.admin_seed import ensure_admin_user


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    return 0 if ensure_admin_user() else 1


if __name__ == "__main__":
    raise SystemExit(main())
