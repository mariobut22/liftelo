# Liftelo — Project Status
Last updated: June 2026

Author: Mario Butkovic

---

# Project Overview

Liftelo is a SaaS platform for elevator maintenance companies.

Stack:

Frontend:
- React
- TypeScript
- Vite
- Zustand
- React Router
- react-i18next

Backend:
- Node.js
- Express
- MySQL

Hosting:
Cloudways Hybrid Stack

Repository:
GitHub
Branch:
main

---

# Production Architecture

Production URL

https://app.liftelo.app

Frontend

Static Vite build served from:

public_html/

Backend

Express server

http://127.0.0.1:3000

Runtime

PM2

API proxy

Apache .htaccess

RewriteRule

/api/*
↓

127.0.0.1:3000

---

# Cloudways Configuration

Current Public IP

134.122.64.12

DNS

Managed by Namecheap

Important A records

app
www
@
↓

134.122.64.12

SSL

Let's Encrypt

Cloudways Hybrid Stack

Apache proxy modules required

mod_proxy

mod_proxy_http

---

# What Happened

Cloudways server was deleted after unpaid invoice.

Server restored from backup.

Restore caused:

✔ New server IP

✔ DNS mismatch

✔ SSL invalid

✔ Git deployment removed

✔ node_modules missing

✔ backend stopped

✔ Apache proxy modules disabled

---

# Problems Solved

DNS

Updated Namecheap A records

46.101.133.222

↓

134.122.64.12

SSL

Reissued Let's Encrypt certificate

Backend

Executed

npm install

Started backend

PM2

Running:

liftelo

API

Internal

curl http://127.0.0.1:3000/api/login

↓

JSON 404

Public

curl https://app.liftelo.app/api/login

↓

JSON 404

Apache

Cloudways enabled

mod_proxy

mod_proxy_http

Login

Fixed frontend auth issues.

Resolved:

Superadmin redirect

Company loading race condition

Session hydration

---

# Current State

Production

Working

Login

Working

Backend

Working

PM2

Online

Frontend

Working

Some minor visual issues remain.

---

# Documentation Created

I18N_ARCHITECTURE.md

I18N_SYSTEM_OVERVIEW.md

LIFTELO_DEPLOYMENT_WORKFLOW.md

SERVER_RECOVERY_CHECKLIST.md

scripts/deploy-production.sh

---

# Current Development Rules

Never edit production directly.

Always:

Local

↓

Git

↓

Production deploy

Deployment script:

scripts/deploy-production.sh

Production backend is managed by PM2.

---

# Next Major Goal

Create complete staging environment.

Architecture

Production

app.liftelo.app

Production DB

↓

Staging

staging.liftelo.app

Staging DB

---

# Planned Staging Workflow

Local development

↓

develop branch

↓

Deploy to staging

↓

Test

↓

Merge

↓

main

↓

Deploy production

---

# Database Strategy

Production database

Never overwritten.

Schema changes

Migration only.

Staging database

Periodic copy of production.

Never sync staging back into production.

Disable email sending on staging.

---

# Future Tasks

Create staging Cloudways application

Create staging database

Create staging subdomain

Configure Git deployment for staging

Create refresh-staging-db.sh

Automate deployment

Improve frontend visual polish

Continue Liftelo feature development

---

# Notes for Future ChatGPT Sessions

Assume all previous login, session, PM2, Cloudways proxy, DNS and SSL issues are solved.

Current focus is:

Designing a professional staging workflow.

Future recommendations should follow production-safe SaaS deployment practices.

Never recommend editing production directly unless specifically requested.

Always preserve existing deployment workflow.

Prefer Git-based deployments.

Prefer PM2 for backend runtime.

Assume current production server is healthy.

# Changelog

2026-06-26

- Restored Cloudways server
- Updated DNS
- Fixed SSL
- Restored PM2
- Fixed Apache mod_proxy
- Login working again