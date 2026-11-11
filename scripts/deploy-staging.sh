#!/usr/bin/env bash
set -euo pipefail

STAGING_DOMAIN="${STAGING_DOMAIN:-staging.liftelo.app}"
PM2_NAME="${PM2_NAME:-liftelo-staging}"
API_PORT="${API_PORT:-3001}"

echo "== Liftelo staging deploy =="

echo "-- Verifying working directory"
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo "Error: expected backend/ and frontend/ in current directory."
  exit 1
fi

echo "-- Pulling latest develop"
git fetch origin develop
git checkout develop
git pull --ff-only origin develop

echo "-- Installing backend dependencies"
cd backend
npm install

echo "-- Installing frontend dependencies"
cd ../frontend
npm install

echo "-- Building frontend"
npm run build

echo "-- Publishing frontend build"
cd ..
rm -rf assets index.html vite.svg
cp -r frontend/dist/* .

echo "-- Restarting backend with PM2"
cd backend
npx pm2 restart "$PM2_NAME" || PORT="$API_PORT" npx pm2 start index.js --name "$PM2_NAME"
npx pm2 save
npx pm2 status

echo "-- Health checks"
curl -i "http://127.0.0.1:${API_PORT}/api/login"
curl -i "https://${STAGING_DOMAIN}/api/login"
curl -i "https://${STAGING_DOMAIN}/api/billing/plans"

echo "== Done =="
