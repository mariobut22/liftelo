# Liftelo CI/CD Setup (GitHub Actions)

This setup removes manual frontend builds on the server and standardizes deployments.

- Push to `develop` -> auto deploy to `staging.liftelo.app`
- Push to `main` -> auto deploy to `app.liftelo.app`

## What is automated

For each deployment pipeline:

1. Build frontend in GitHub runner (Node `20.19.0`)
2. Sync backend source to server app folder (without `.env` files)
3. Publish built frontend `dist` into app `public_html`
4. Run backend dependency install (`npm install --omit=dev`)
5. Restart PM2 process (`liftelo-staging` or `liftelo`)
6. Run basic health checks

Workflow file: `.github/workflows/deploy.yml`

## Step 1 — Generate SSH key for GitHub Actions

Run locally (one-time):

```bash
ssh-keygen -t ed25519 -C "github-actions-liftelo" -f ~/.ssh/liftelo_actions -N ""
```

This creates:

- private key: `~/.ssh/liftelo_actions`
- public key: `~/.ssh/liftelo_actions.pub`

## Step 2 — Add public key to Cloudways server

In Cloudways panel:

1. Go to **Server** -> **Master Credentials** -> **SSH Public Keys**
2. Add a new key (name: `github-actions-liftelo`)
3. Paste contents of `~/.ssh/liftelo_actions.pub`

This grants GitHub Actions SSH access as your server user.

## Step 3 — Add GitHub repository secrets

GitHub -> Repo -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**

Add these 6 staging/prod secrets (host may be the same for both):

- `STAGING_SSH_HOST` (example: `134.122.64.12`)
- `STAGING_SSH_USER` (example: `master_zfqzqmwmvp`)
- `STAGING_SSH_KEY` (paste contents of `~/.ssh/liftelo_actions`)

- `PROD_SSH_HOST` (example: `134.122.64.12`)
- `PROD_SSH_USER` (example: `master_zfqzqmwmvp`)
- `PROD_SSH_KEY` (same private key contents)

## Step 4 — Commit and push workflow

```bash
git add .github/workflows/deploy.yml CI_DEPLOY_SETUP.md
git commit -m "ci: add automated staging and production deploy workflow"
git push origin develop
```

## Step 5 — Validate staging deployment

After pushing to `develop`:

1. Open GitHub -> **Actions** -> `Deploy Liftelo`
2. Wait until `deploy_staging` finishes successfully
3. Verify:
   - `https://staging.liftelo.app`
   - login flow
   - core routes

## Step 6 — Promote to production

When staging is verified:

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

Then GitHub Action runs `deploy_production` automatically.

## Notes / Safety

- `.env` and `.env.production` are never overwritten by CI.
- PM2 process names are fixed:
  - staging: `liftelo-staging`
  - production: `liftelo`
- If deployment fails, check GitHub Actions logs first (build, SSH, rsync, PM2 step).
- Manual fallback remains available via SSH and existing runbooks.
