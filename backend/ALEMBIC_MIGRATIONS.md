# Database Migrations (Alembic)

## Commands

Run from the backend folder:

```bash
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
alembic downgrade -1
```

## Notes

- Production schema management should use Alembic migrations only.
- Keep `AUTO_CREATE_SCHEMA=false` in production environments.
- `AUTO_CREATE_SCHEMA=true` is optional for local development/tests only.
- Set `DATABASE_URL` before running Alembic.
- Legacy `postgres://` URLs are normalized to `postgresql://`.

## Deployment

1. Deploy application code containing latest Alembic migrations.
2. Run `alembic upgrade head` against the target database.
3. Start/roll application instances after migration succeeds.
4. Verify API health and key read/write flows.
5. Keep backup/restore procedure ready before schema migrations.
