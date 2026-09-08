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

## Private report artifacts

- Migration `0025_report_artifact_storage` adds immutable storage locators while preserving existing database-backed artifacts.
- Set `REPORT_ARTIFACT_STORAGE=s3` to place newly completed queued exports in a private S3-compatible bucket. Small synchronous exports remain database-backed.
- Configure the bucket, prefix, region, and optional endpoint using the variables documented in `.env.example`.
- Grant only object read/write/delete access under the configured prefix. Do not make the bucket public; downloads continue through the role-authorized API.
- The retention task deletes the external object before removing its database locator. Treat storage deletion failures as operational alerts rather than discarding the locator.

## Operational follow-ups

- Migration `0026_operational_follow_ups` adds the shared cross-domain assignment and resolution queue.
- Deploy it before exposing the web or Android follow-up workspace.
- Follow-up history is also written to the immutable operational audit log; migration rollback removes only the queue table and does not rewrite audit history.
