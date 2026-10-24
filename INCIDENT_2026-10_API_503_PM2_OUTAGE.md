# Incident Report: API 503 due to PM2 Backend Outage

Date: 2026-10-22 to 2026-10-23
System: Liftelo production and staging on Cloudways

## Summary

Production frontend was available, but API requests failed with HTTP 503.
Root cause was a stopped Node/PM2 backend process, so Apache proxy to localhost backend could not connect.

## Symptoms

- `https://app.liftelo.app/` returned `200`
- `https://app.liftelo.app/api/login` returned `503`
- Browser console showed API errors for `/api/login`
- 503 response body was Apache HTML error page

## Evidence Collected

- No Node process running:
  - `ps aux | grep node | grep -v grep` returned no active backend process
- No listener on backend ports:
  - `ss -ltn` showed no listener on `3000`
- Apache backend/proxy errors in app logs:
  - `AH00957: attempt to connect to 127.0.0.1:3000 failed`
  - `AH01114: failed to make connection to backend: 127.0.0.1`

This confirms proxy mapping existed, but upstream backend was down.

## Root Cause

Backend process managed by PM2 was not running after hosting suspension/reactivation.
Apache/Nginx were up and serving frontend static files, but `/api/*` upstream at `127.0.0.1:3000` was unavailable.

## Fix Applied by Cloudways Support

1. Restarted Node backend process in PM2 for production
2. Restored staging PM2 process as well
3. Verified production backend on port `3000`
4. Verified staging backend on port `3001`
5. Confirmed `/api` requests now reach backend

## Hardening Applied

Cloudways configured watchdog cron to auto-restart processes if ports stop listening.

- Cron expression:
  - `*/2 * * * * /bin/bash /home/master/pm2-watchdog.sh`
- Check interval:
  - every 2 minutes
- Monitored ports:
  - production `3000`
  - staging `3001`
- Scope:
  - configured under production application's cron list

Note: there can still be up to ~2 minutes of outage after reboot/suspension until cron runs.

## Post-Fix Verification

Production checks:

- `curl -s -o /dev/null -w "%{http_code}\n" https://app.liftelo.app/` -> `200`
- `curl -s -o /dev/null -w "%{http_code}\n" https://app.liftelo.app/api/login/check` -> `401`
- `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.liftelo.app/api/login -H "Content-Type: application/json" -d '{"email":"x","password":"x"}'` -> `401`

Staging checks:

- `curl -s -o /dev/null -w "%{http_code}\n" https://staging.liftelo.app/` -> `200`
- `curl -s -o /dev/null -w "%{http_code}\n" https://staging.liftelo.app/api/login/check` -> `401`

These are expected results for unauthenticated checks and invalid credentials.

## Follow-Up Actions

1. Keep watchdog cron entry in place (do not remove accidentally).
2. Document and periodically review `/home/master/pm2-watchdog.sh`.
3. Complete staging DB migrations (support reported missing tables in staging).
4. Consider stronger boot persistence if Cloudways plan/setup later allows full PM2 startup on reboot.

## Quick Triage Commands for Future Incidents

Use these first when `/api/*` returns 503:

```bash
curl -i https://app.liftelo.app/api/login
ps aux | grep node | grep -v grep
ss -ltn | grep ':3000\|:3001'
tail -n 120 /home/1638914.cloudwaysapps.com/*/logs/*error.log
```

If frontend is `200` and `/api` is `503` with Apache proxy errors, check PM2/runtime state immediately.

---

## Phase 2 (2026-10-24): Staging Login Follow-Up

After the PM2 outage was fixed, staging still had login issues unrelated to server availability.

### Additional Symptoms

- Browser login on `staging.liftelo.app` returned `500` with `Error: Not allowed by CORS`
- Some frontend requests were sent to `/api/api/login` and returned `404 {"message":"Not found"}`
- Superadmin login could appear successful and then bounce back to `/login`

### Root Causes (Follow-Up)

1. **CORS whitelist incomplete for staging**
   - backend allowed origins did not include full staging domain variants.

2. **Frontend API path duplication**
   - `API_BASE_URL` was `/api` and many calls already used `/api/...` paths.
   - Result: requests like `/api/api/login`.

3. **Superadmin session payload mismatch**
   - login session user object was missing fields needed by frontend auth/routing hydration for stable superadmin flow.

4. **Staging data drift**
   - staging DB credentials/data were not aligned initially, requiring DB refresh and user password reset.

### Fixes Applied

1. **Staging DB refresh from production**
   - Performed production -> staging dump/import using `mysqldump` + `mysql`.
   - Used `--no-tablespaces` due Cloudways DB privilege limits.
   - Restarted staging process after import.

2. **CORS staging origins added**
   - Allowed:
     - `https://staging.liftelo.app`
     - `https://www.staging.liftelo.app`
     - `http://staging.liftelo.app`

3. **Frontend API URL normalization**
   - Added URL builder in `frontend/src/services/api.ts` to prevent duplicate `/api` prefix.

4. **Backend login session enrichment**
   - Updated `backend/routes/login.js` session user payload to include:
     - normalized role for superadmin
     - `global_role`
     - `company_id`
     - `language`
     - `is_active`

### Related Code Footprint

- `frontend/src/services/api.ts`
- `backend/index.js`
- `backend/routes/login.js`

### Validation Results

- API login endpoint on staging returns `200` with success payload for valid credentials.
- Staging process remains online in PM2 (`liftelo-staging`).
- CORS no longer blocks staging origin after whitelist update.

### Notes

- Console errors from browser extensions (`background.js`, `FrameDoesNotExistError`) are external and not Liftelo backend/frontend logic errors.
- Any temporary staging password set during incident response should be rotated immediately after access is restored.
