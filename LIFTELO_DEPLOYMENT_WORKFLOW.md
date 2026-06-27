# Liftelo — Development, Deployment & Database Workflow

Author: Mario Butkovic  
Project: Liftelo  
Hosting: Cloudways (Hybrid Stack)  
Frontend: React + Vite  
Backend: Node.js + Express  
Database: MySQL  

---

# PURPOSE OF THIS DOCUMENT

This document defines the official workflow for:

- local development
- staging deployments
- production deployments
- database migrations
- rollback strategy
- frontend/backend build flow
- safe deployment practices

This exists to prevent:

- broken production deployments
- login/session failures
- accidental database overwrites
- broken routing/proxy configs
- frontend/backend desync
- loss of production data

---

# CURRENT INFRASTRUCTURE

## Production

URL:
https://app.liftelo.app

Server:
Cloudways Hybrid Stack

Backend:
Node.js app on:
http://127.0.0.1:3000

Frontend:
Static Vite build served from:
public_html/

API proxy:
.htaccess RewriteRule proxies /api/* → Node backend

---

# CRITICAL PRODUCTION CONFIG

## public_html/.htaccess

```apache
RewriteEngine On
RewriteBase /

# Proxy API requests to Node backend
RewriteRule ^api/(.*)$ http://127.0.0.1:3000/api/$1 [P,L]

# React/Vite SPA fallback
RewriteRule ^index\.html$ - [L]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

---

# DAILY DEVELOPMENT WORKFLOW

Local → feature branch → develop/staging → main/production

Rules:
- Never deploy untested code directly to production
- Always use a feature branch for changes
- Merge to develop/staging first, then promote to main

---

# PRODUCTION DEPLOY CHECKLIST

- Pull latest code to server (Cloudways Git Deployment)
- Run scripts/deploy-production.sh
- Verify PM2 is running
- Verify internal API: `curl -i http://127.0.0.1:3000/api/login`
- Verify public API: `curl -i https://app.liftelo.app/api/login`
- Verify login with superadmin and company admin

---

# ROLLBACK INSTRUCTIONS

Use git revert (never force push):
```bash
git log --oneline -10
git revert <commit_sha>
git push origin main
```

---

# DATABASE MIGRATION SAFETY RULES

- Never overwrite production DB
- Always use migrations for schema changes
- Backup before any schema change

---

# KILO CODE RULES

- Do not edit the server directly unless explicitly requested
- Prefer local changes → git → deploy
- Do not change database schema unless explicitly requested
- Do not hardcode visible UI text; follow i18n rules
