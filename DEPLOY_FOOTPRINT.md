# Liftelo Deploy Footprint

## 2026-10-25 - Staging auth fix (normal login + Google foundation)

### Symptom
- Staging normal login (`POST /api/login`) returned `500 {"error":"Greška na serveru."}` after recent auth/SSO foundation rollout.

### Root Cause
- Backend login/session context logic expected newly introduced schema objects from recent commits.
- Staging database was missing latest migrations:
  - `users.last_active_company_id`
  - `user_identities` table

### Actions Applied (staging)
- Applied DB migrations on staging:
  - `backend/migrations/20261025_add_users_last_active_company.sql`
  - `backend/migrations/20261025_add_user_identities.sql`
- Verified schema objects exist after migration.
- Restarted staging backend process (`pm2`) to load latest runtime and env.

### OAuth/Env Context
- Google OAuth env was configured on staging backend `.env`:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI=https://staging.liftelo.app/api/auth/google/callback`
  - `APP_URL=https://staging.liftelo.app`

### Outcome
- Normal email/password login works again on staging.
- Google-login foundation endpoints remain enabled for staged testing.

### Note
- Since client secret was shared during setup, rotate Google OAuth client secret after stabilization and update server env accordingly.
