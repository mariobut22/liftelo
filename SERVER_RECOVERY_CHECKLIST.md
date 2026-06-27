# Liftelo Server Recovery Checklist (Cloudways)

This checklist is for recovery after a Cloudways restore or rebuild.
It assumes:
- Frontend is React/Vite built into public_html
- Backend is Node/Express on 127.0.0.1:3000 via PM2
- public_html/.htaccess proxies /api/* to backend

## Quick Diagnosis
| Symptom | Likely Cause | First Check |
| --- | --- | --- |
| SSL warning | Certificate missing/expired | Cloudways SSL reissue |
| app.liftelo.app not opening | DNS/IP mismatch | `dig app.liftelo.app +short` |
| /api/login returns HTML | Proxy rule missing | public_html/.htaccess |
| /api/login returns Apache 500 | mod_proxy missing | Cloudways enable mod_proxy/mod_proxy_http |
| internal 127.0.0.1:3000 API fails | PM2/backend down | `npx pm2 status` |
| login succeeds then returns to login | frontend state/companies race | auth + companies loading logs |

## Important Paths
- public_html root: /home/master/applications/uvwgtbybmm/public_html
- backend path: /home/master/applications/uvwgtbybmm/public_html/backend
- frontend path: /home/master/applications/uvwgtbybmm/public_html/frontend
- logs path: /home/master/applications/uvwgtbybmm/logs
- .htaccess path: /home/master/applications/uvwgtbybmm/public_html/.htaccess

## Emergency Contacts / Ownership
- Cloudways: server state, SSL, mod_proxy/mod_proxy_http, Apache/Nginx
- Namecheap: DNS A records (app, www, optional @)
- GitHub: source code and deployment branch

## 1) DNS and Domain
- Confirm new Cloudways Public IP
- Update Namecheap DNS A records:
  - app -> <NEW_PUBLIC_IP>
  - www -> <NEW_PUBLIC_IP>
  - @ (optional) -> <NEW_PUBLIC_IP>

Verify DNS:
```bash

dig app.liftelo.app +short
```

## 2) Cloudways Domain and SSL
- Re-add app.liftelo.app in Cloudways Domain Management
- Reissue SSL certificate (Let’s Encrypt)
- Confirm HTTPS is valid in browser

## 3) Proxy and .htaccess
- Verify API proxy rule in public_html/.htaccess:
```apache
RewriteEngine On

# Proxy API requests to Node backend
RewriteRule ^api/(.*)$ http://127.0.0.1:3000/api/$1 [P,L]

# React/Vite SPA fallback
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

If public API returns Apache 500 and logs show:
- AH01144: No protocol handler
Then contact Cloudways to enable:
- mod_proxy
- mod_proxy_http

## 4) Backend Dependencies and PM2
If backend/node_modules is missing, reinstall:
```bash
cd /home/master/applications/uvwgtbybmm/public_html/backend
npm install
```

Restart backend:
```bash
npx pm2 restart liftelo || npx pm2 start index.js --name liftelo
npx pm2 save
npx pm2 status
```

## 5) API Health Checks
Internal API (backend should respond with JSON 404 on GET /api/login):
```bash
curl -i http://127.0.0.1:3000/api/login
```

Public API (should also return JSON 404 on GET /api/login):
```bash
curl -i https://app.liftelo.app/api/login
```

Expected response for GET /api/login:
```json
{"message":"Not found"}
```

## 6) Git Deployment and Frontend Build
- Reconfigure Cloudways Git Deployment if missing
- Rebuild frontend if assets look outdated

Use the deploy script after a Git pull or restore:
- scripts/deploy-production.sh

## 7) Application Login Verification
- Verify login with superadmin user
- Verify login with a company admin user

---

# Lessons Learned
- Cloudways restore can change the public IP
- Check DNS before debugging application issues
- PM2 must be online before testing API
- Internal API curl proves backend works
- Public API curl proves Apache proxy works
- AH01144 means mod_proxy/mod_proxy_http are missing

# When to use scripts/deploy-production.sh
Run the script:
- After Cloudways Git Deployment pull
- After restoring the server
- After frontend/backend code changes are pulled to the server

Do not run it:
- For database-only changes

What it does:
- Installs backend/frontend dependencies
- Builds frontend and copies dist to public_html
- Restarts backend with PM2
- Runs basic health checks
