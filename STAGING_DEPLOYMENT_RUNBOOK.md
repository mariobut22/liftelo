# Staging Deployment Runbook

## 1. Environment Overview

Production environment:

- Production app: `LIFTELO`
- Production URL: `app.liftelo.app`
- Production branch: `main`
- Production backend PM2 process: `liftelo`
- Production backend port: `3000`
- Production folder: `/home/1638914.cloudwaysapps.com/uvwgtbybmm/public_html`

Staging environment:

- Staging app: `liftelo-staging`
- Staging URL: `staging.liftelo.app`
- Staging branch: `develop`
- Staging backend PM2 process: `liftelo-staging`
- Staging backend port: `3001`
- Staging folder: `/home/1638914.cloudwaysapps.com/evvscefxqb/public_html`

---

## 2. Staging Git Deployment

- Cloudways staging app uses the same GitHub repository:
  - `git@github.com:mariobut22/liftelo.git`
- Staging branch must be `develop`.
- Deployment path is `public_html/`.
- Production uses `main` and must not be changed during staging deploys.

Operational reminder:

- Staging deploys are isolated to the staging app/folder/processes only.

---

## 3. Staging Backend `.env`

Required keys (no real secrets in docs):

```env
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
PORT=3001
EMAIL_WORKER_ENABLED=false
SESSION_SECRET=
```

Why these values matter:

- `SESSION_SECRET` is required for secure session signing and login/session stability.
- `EMAIL_WORKER_ENABLED=false` disables email worker processing on staging.
- `PORT=3001` keeps staging backend isolated from production (`3000`).

---

## 4. Staging Frontend Build

Run on staging server:

```bash
cd /home/1638914.cloudwaysapps.com/evvscefxqb/public_html/frontend
npm install
npm run build
```

Copy Vite build output to staging web root:

```bash
cd /home/1638914.cloudwaysapps.com/evvscefxqb/public_html
cp -r frontend/dist/* .
```

Notes:

- Original Cloudways `index.php` was renamed to `index.php.cloudways-backup`.
- Do not restore `index.php` unless intentionally reverting to the Cloudways default page.

---

## 5. Staging Backend Start/Restart

Initial start (or first PM2 registration) on staging:

```bash
cd /home/1638914.cloudwaysapps.com/evvscefxqb/public_html/backend
npm install
PORT=3001 EMAIL_WORKER_ENABLED=false npx pm2 start index.js --name liftelo-staging
npx pm2 save
```

Restart after code/env changes:

```bash
npx pm2 restart liftelo-staging --update-env
```

---

## 6. Staging Apache `.htaccess`

Use this staging `public_html/.htaccess` content:

```apache
RewriteEngine On
RewriteBase /

RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

Explanation:

- `/api/*` is proxied to staging backend on `127.0.0.1:3001`.
- SPA fallback routes unknown frontend paths to `index.html`.

---

## 7. Validation Commands

Run these checks after deploy/restart:

```bash
curl http://127.0.0.1:3001/api/login
curl https://staging.liftelo.app/api/login
curl -I https://staging.liftelo.app
npx pm2 list
npx pm2 logs liftelo-staging --lines 50
```

Expected API response body for `/api/login` health-style check:

```json
{"message":"Not found"}
```

---

## 8. Hard Rules

- Never restart production PM2 process during staging work.
- Never deploy `develop` to production.
- Never point staging to production DB.
- Never copy staging DB to production.
- Never commit `.env` files.
- Production PM2 process is `liftelo`.
- Staging PM2 process is `liftelo-staging`.

---

## 9. Known Notes / Technical Debt

- Node version warning appeared during frontend build:
  - server uses Node `20.5.1`
  - Vite recommends Node `20.19+` or `22.12+`
- Frontend bundle size warning exists.
- Backend `npm audit` reported vulnerabilities.
- These are not blocking staging setup, but should be planned for remediation.
