# Liftelo Developer Handbook

This is a practical guide for daily development, deployment, and recovery.

## Architecture Summary
- Frontend: React + Vite static build
- Backend: Node.js + Express on 127.0.0.1:3000
- Database: MySQL
- Hosting: Cloudways Hybrid Stack
- API proxy: public_html/.htaccess proxies /api/* → backend

## Local Development
- Frontend dev server: http://localhost:5173
- Backend server: http://localhost:3000
- Login UI: /login
- API base: /api

## Git Workflow
- Work on feature branches
- Merge to develop/staging first
- Promote to main for production
- Never deploy untested code to production

## Staging and Production
- Staging: validate UI, API, and auth
- Production: deploy via Cloudways Git Deployment + deploy script

## Cloudways Deployment Model
- Frontend build served from public_html root
- Backend runs via PM2 on 127.0.0.1:3000
- .htaccess proxies /api/* to backend

## PM2 Runtime
- Process name: liftelo
- Start/restart:
  - npx pm2 restart liftelo || npx pm2 start index.js --name liftelo
  - npx pm2 save
  - npx pm2 status

## API Proxy (.htaccess)
```apache
RewriteEngine On
RewriteRule ^api/(.*)$ http://127.0.0.1:3000/api/$1 [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## Database Migration Principles
- Never overwrite production DB
- Use migrations for all schema changes
- Always back up before applying migrations

## Recovery Principles
- Confirm DNS before debugging app
- Verify PM2 before testing public API
- Internal API curl proves backend health
- Public API curl proves proxy health
- AH01144 indicates missing mod_proxy/mod_proxy_http

## Working With Kilo Code Safely
- Prefer local edits → git → deploy
- Do not edit server directly unless requested
- Do not change DB schema unless requested
- Follow i18n rules for UI text

## Pre-Deploy Checklist
- Tests or smoke checks run locally
- Git status clean and pushed
- Cloudways Git Deployment ready
- Scripts/deploy-production.sh ready to run

## Post-Deploy Smoke Test
- `curl -i http://127.0.0.1:3000/api/login` returns JSON 404
- `curl -i https://app.liftelo.app/api/login` returns JSON 404
- Login as superadmin
- Login as company admin
