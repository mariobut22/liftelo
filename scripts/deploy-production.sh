#!/usr/bin/env bash
set -e

echo "== Liftelo production deploy =="

echo "-- Verifying working directory"
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo "Error: expected backend/ and frontend/ in current directory."
  exit 1
fi
if [ ! -f ".htaccess" ]; then
  echo "Error: expected .htaccess in public_html root."
  exit 1
fi

echo "-- Installing backend dependencies"
cd backend
npm install

echo "-- Installing frontend dependencies"
cd ../frontend
npm install

echo "-- Building frontend"
npm run build

echo "-- Publishing frontend build to public_html root"
cd ..
rm -rf assets index.html vite.svg
cp -r frontend/dist/* .

echo "-- Restarting backend with PM2"
cd backend
npx pm2 restart liftelo || npx pm2 start index.js --name liftelo
npx pm2 save
npx pm2 status

echo "-- Health checks"
# Expected GET /api/login result: JSON 404 {"message":"Not found"}
curl -i http://127.0.0.1:3000/api/login
curl -i https://app.liftelo.app/api/login

echo "== Done =="
