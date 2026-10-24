# Liftelo Staging Infrastructure Plan

## Scope

This plan defines a safe staging environment for Liftelo with:

- Production: `app.liftelo.app` (from `main`)
- Staging: `staging.liftelo.app` (from `develop`)
- Hosting: Cloudways Hybrid Stack
- Backend: Node.js + Express (PM2-managed)
- Frontend: Vite static build
- Database: MySQL

This is infrastructure/process documentation only. No application logic, schema, or deployment script changes are included.

---

## 1) Required Staging Components

Provision and maintain these staging-specific components:

1. **Staging domain/subdomain**
   - `staging.liftelo.app`

2. **Staging web app container (Cloudways)**
   - Separate app from production
   - Own web root and app settings

3. **Staging backend runtime**
   - Node/Express process under PM2
   - Staging-specific PM2 process name

4. **Staging frontend static build target**
   - Separate `public_html` (or equivalent) for staging app

5. **Staging MySQL database**
   - Separate DB name and credentials from production

6. **Staging environment configuration**
   - Separate `.env` values for staging backend
   - Never reuse production secrets directly

7. **Staging SSL certificate**
   - Valid TLS certificate for `staging.liftelo.app`

---

## 2) DNS Setup (Namecheap)

Create/verify DNS for staging:

1. In Namecheap DNS zone for `liftelo.app`, add:
   - Type: `A`
   - Host: `staging`
   - Value: Cloudways server public IP
   - TTL: Automatic (or 5 min during setup)

2. If using Cloudways-managed DNS, point Namecheap nameservers accordingly first.

3. Verify propagation:
   - `dig staging.liftelo.app`
   - Confirm it resolves to the intended Cloudways IP.

---

## 3) Cloudways Staging Application Setup

Create a dedicated staging application in Cloudways:

1. Add new Application (same stack type as production).
2. Set domain:
   - Primary domain: `staging.liftelo.app`
3. Configure Git deployment for staging app:
   - Repository: Liftelo
   - Branch: `develop`
4. Ensure web root is isolated from production.
5. Ensure staging app has independent app credentials and services.

**Important:** Never share production app directories with staging.

---

## 4) Separate Staging Database

Create a dedicated MySQL database/user for staging:

1. Create DB (example): `liftelo_staging`
2. Create DB user (example): `liftelo_staging_user`
3. Grant user privileges only on staging DB.
4. Store credentials in staging backend `.env` only.
5. Never point staging backend to production DB.

---

## 5) Separate Backend `.env` for Staging

Define staging-specific environment file values (example keys):

- `NODE_ENV=staging`
- `PORT=<staging_backend_port>`
- `DB_HOST=<staging_db_host>`
- `DB_PORT=<staging_db_port>`
- `DB_NAME=liftelo_staging`
- `DB_USER=liftelo_staging_user`
- `DB_PASSWORD=<staging_db_password>`
- `JWT_SECRET=<staging_unique_secret>`
- `APP_BASE_URL=https://staging.liftelo.app`
- `API_BASE_URL=https://staging.liftelo.app/api`
- `EMAIL_ENABLED=false` (or equivalent off switch)

Rules:

- Use unique staging secrets (do not copy production secrets unless unavoidable, then rotate).
- Never commit `.env` files to Git.
- Keep `.env.example` sanitized and non-secret.

---

## 6) PM2 Process Naming for Staging

Use explicit PM2 names to avoid confusion:

- Production process name: `liftelo-prod-api`
- Staging process name: `liftelo-staging-api`

Guidelines:

1. Keep separate PM2 process entries per environment.
2. Ensure staging process uses staging `.env`.
3. Verify process list clearly distinguishes prod vs staging.
4. Do not restart production process during staging deploys.

---

## 7) Apache Proxy Rule for Staging `/api`

For staging web app (`staging.liftelo.app`), configure Apache rewrite/proxy analogous to production:

```apache
RewriteEngine On
RewriteBase /

# Proxy API requests to staging Node backend
RewriteRule ^api/(.*)$ http://127.0.0.1:<staging_backend_port>/api/$1 [P,L]

# SPA fallback
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

Requirements:

- Use a **staging-only backend port**.
- Confirm `/api/*` on staging never routes to production backend.

---

## 8) SSL Setup for Staging

1. In Cloudways, issue SSL certificate for `staging.liftelo.app` (Let’s Encrypt preferred).
2. Enforce HTTPS redirect.
3. Verify certificate chain and renewal status.
4. Smoke test:
   - `https://staging.liftelo.app`
   - `https://staging.liftelo.app/api/login` (or equivalent health endpoint)

---

## 9) Safe Database Refresh Policy

Authoritative policy:

1. **Allowed:** Production data snapshot may be copied into staging for realistic testing.
2. **Forbidden:** Staging data must never be merged/synced back into production.
3. After refresh to staging:
   - Sanitize sensitive user data if required by policy.
   - Rotate/disable integrations that could impact real users.
   - Keep email sending disabled in staging (`EMAIL_ENABLED=false`).
4. Record refresh date and source snapshot for auditability.

---

## 10) Manual Staging Deploy Workflow (from `develop`)

Use this release path only:

1. Develop locally from feature branch based on `develop`.
2. Merge feature branch into `develop`.
3. Trigger Cloudways Git deploy for staging app from `develop`.
4. Run backend restart/reload for **staging PM2 process only**.
5. Validate staging:
   - Login/auth
   - Core app pages
   - API responses
   - File uploads (staging storage only)
6. Confirm outbound email remains disabled in staging.
7. If staging passes, prepare promotion PR: `develop -> main`.
8. Production deploy is performed separately from `main` only.

---

## Operational Guardrails

- `main` is production history; protect it from direct edits.
- `develop` is staging/pre-production integration branch.
- Never commit real secrets or `.env` files.
- Never run staging against production DB.
- Never run production deploy from `develop`.
