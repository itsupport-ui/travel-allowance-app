# Full Project Git Upload Runbook

## Goal
Upload the full project source to GitHub while preserving current ignore rules and avoiding accidental upload of generated files or secrets.

## Repository Context
- Local repo path: `D:\travel-allowance-app`
- Remote: `origin` -> `https://github.com/itsupport-ui/travel-allowance-app.git`
- Target branch: `main`
- Current working branch (implementation branch): `full-project-upload`

## 1) Open PowerShell At Repo Root
```powershell
Set-Location D:\travel-allowance-app
```

## 2) Pre-Flight Checks
Run these commands before staging.

```powershell
git branch --show-current
git status -sb
git remote -v
git fetch origin
git rev-list --left-right --count origin/main...HEAD
```

Interpretation for divergence output (`left right`):
- `0 N`: local branch is ahead only
- `N 0`: local branch is behind only
- `N M`: branches diverged, integration required before push

## 3) Verify Ignore And Sensitive Scope
The upload keeps `.gitignore` exclusions.

```powershell
git check-ignore -v node_modules/**
git check-ignore -v backend/uploads/**
git check-ignore -v *.log
git check-ignore -v .env
```

Review tracked env files (if tracked, `.gitignore` does not automatically remove them):

```powershell
git ls-files | Select-String -Pattern "(^|/)\.env($|\.)"
```

If any tracked env file contains secrets and should stop being tracked:

```powershell
git rm --cached path/to/env-file
```

Then add a matching ignore entry if missing.

## 4) Stage Entire Project
```powershell
git add -A
git status --short
git diff --cached --stat
```

Optional quick scan for sensitive keywords in staged files:

```powershell
git diff --cached | Select-String -Pattern "API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY"
```

## 5) Commit
Use a clear commit message that reflects project-wide upload.

```powershell
git commit -m "chore: full project upload and git runbook"
```

If there is nothing to commit, continue to branch integration and push.

## 6) Integrate Remote Main Changes
If divergence check showed `N M`, integrate first.

```powershell
git fetch origin
git checkout full-project-upload
git merge origin/main
```

If merge conflicts occur:
1. Open conflicted files.
2. Resolve conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
3. Stage resolved files.
4. Complete merge.

```powershell
git add -A
git commit
```

## 7) Move Changes To Local Main
```powershell
git checkout main
git pull --ff-only origin main
git merge full-project-upload
```

If this merge creates conflicts, resolve them, then:

```powershell
git add -A
git commit
```

## 8) Push To GitHub Main
```powershell
git push origin main
```

## 9) Post-Push Verification
```powershell
git checkout main
git status --short
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline --decorate
```

Expected:
- Working tree is clean.
- Local `HEAD` equals `origin/main`.
- Latest commit message matches upload commit/merge flow.

## 10) Common Issues
### Permission denied while scanning caches
Example: `.pytest_cache` permission issue during status.

Workarounds:
1. Close processes that lock files.
2. Exclude cache folders from scans where needed.
3. Retry `git status`.

### Push rejected (non-fast-forward)
Cause: remote received new commits.

Fix:
```powershell
git fetch origin
git checkout main
git pull --ff-only origin main
git merge full-project-upload
git push origin main
```

### Large/binary asset concerns
If large binaries must be versioned over time, prefer Git LFS instead of normal Git storage.

## 11) What This Upload Includes
Included:
- Backend source and migrations
- Frontend source
- Mobile source
- Project configuration and documentation

Excluded by ignore policy:
- Dependency folders (for example `node_modules`)
- Build artifacts (`dist`, `build`)
- Runtime uploads (`backend/uploads`)
- Generic env files (`.env`)
- Logs and cache outputs
