# Render backend deployment

The backend is a Python/FastAPI service. It must not be deployed from the
repository root as a Node service; the root `package.json` does not contain a
server and intentionally has no `start` script.

## Existing Render service

Configure these values under **Settings > Build & Deploy**:

- **Runtime:** Python
- **Branch:** `deployment-audit-implementation-2026-09-08`
- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Pre-Deploy Command:** `alembic upgrade head`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path:** `/health`

Set `DATABASE_URL`, `JWT_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`, and `CORS_ORIGINS`
as private environment variables. `CORS_ORIGINS` must contain the deployed web
application origin. Do not include credentials in the repository.

After saving the settings, use **Manual Deploy > Clear build cache & deploy**.

## New Blueprint service

The repository-level `render.yaml` contains the same configuration. Create a
Render Blueprint from this repository and branch, provide the environment
variables marked as unsynced, and deploy it. The pre-deploy migration runs once
before the new application version starts.

## Verification

After deployment:

1. Open `https://<service-host>/health` and confirm `{"status":"ok"}`.
2. Open `https://<service-host>/docs` and confirm the API documentation loads.
3. Sign in with a disposable account and execute only a read-only endpoint.
4. Confirm the web and mobile API base URLs point to the new service host.
