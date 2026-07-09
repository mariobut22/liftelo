# Liftelo Staging Database and Deployment Procedure

## 1. Environment Overview

- Production app: `app.liftelo.app`
- Production DB: `uvwgtbybmm`
- Staging app: `staging.liftelo.app`
- Staging DB: `evvscefxqb`
- `main` branch = production
- `develop` branch = staging

This procedure defines how staging is refreshed, deployed, and promoted safely without impacting production.

---

## 2. Staging Database Policy

- Production database is the source of truth.
- Staging database may be refreshed from production.
- Staging must never sync data back to production.
- Refresh staging before major testing cycles or release validation.
- Do not refresh staging casually without a clear operational reason.

---

## 3. Safe Refresh Procedure (Production -> Staging)

Use this process when staging data must be aligned with production reality.

1. Create a production database dump.
2. Import that dump into the staging database (`evvscefxqb`).
3. Verify staging backend/app configuration points only to staging DB credentials.
4. Disable outbound email and real notifications on staging before opening testing.
5. Optionally sanitize sensitive user/customer data when required by policy.
6. Record the refresh date, source, and operator in release notes or operations log.

Operational notes:

- Perform refreshes during a planned maintenance/testing window.
- Re-validate login and core workflows after refresh.
- Treat production dump files as sensitive artifacts.

---

## 4. Staging Deployment Policy

- Deploy staging only from `develop`.
- Deploy production only from `main`.
- Never deploy `develop` to production.
- Never test unfinished code on production.

Branch intent:

- `develop` is the integration/testing branch for pre-production validation.
- `main` is protected production history and release source.

---

## 5. Manual Staging Deploy Checklist

Run this checklist in order:

1. Confirm local `git status` is clean.
2. Push latest changes to `develop`.
3. Deploy `develop` to the Cloudways staging application (`staging.liftelo.app`).
4. Run frontend build if required by deployment flow.
5. Install backend dependencies if required.
6. Restart only the staging PM2 process.
7. Test login flow.
8. Test core pages/workflows.
9. Test an `/api` response endpoint.
10. Confirm staging is using staging DB (`evvscefxqb`).
11. Confirm email sending and real notifications are disabled.

---

## 6. Production Promotion Checklist

Promote only after staging validation is complete:

1. Staging tested successfully.
2. No critical errors remain.
3. Merge `develop` into `main`.
4. Deploy `main` to production (`app.liftelo.app`).
5. Restart only the production PM2 process.
6. Verify login and primary business workflows in production.

---

## 7. Hard Rules (Non-Negotiable)

- Never edit production directly.
- Never commit `.env` files.
- Never point staging to production DB.
- Never copy staging DB to production.
- Never restart production PM2 during a staging deploy.
- Always use separate PM2 process names for staging and production.

---

## Recommended PM2 Naming Standard

Use explicit process names to avoid operational mistakes:

- Production API: `liftelo-prod-api`
- Staging API: `liftelo-staging-api`

Apply this consistently in PM2 process definitions and restart commands.
