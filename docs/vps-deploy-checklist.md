# VPS Deploy Checklist (Front + API on same server)

This checklist is for deploying the full app on one VPS (no n8n required).

## 1) Local preflight before deploy

Run these locally and ensure all pass:

1. `npm install`
2. `npm run build`
3. Start API: `npm run start:api`
4. Start frontend dev: `npm run dev`
5. Login flow works
6. Analyze flow works
7. ICP save + re-analyze works

## 2) VPS prerequisites

Install on VPS:

- Node.js LTS (20+)
- npm
- Nginx
- PM2

Example:

```bash
sudo apt update
sudo apt install -y nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 3) Deploy app files

On VPS:

```bash
mkdir -p /var/www/aimleads
cd /var/www/aimleads
# clone or upload project
npm install
npm run build
```

## 4) Environment variables

Create `.env` in project root:

```env
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api
API_PORT=3001
SESSION_SECRET=change-me-strong-secret
CORS_ORIGIN=https://your-domain.com
```

## 5) Run API with PM2

```bash
cd /var/www/aimleads
pm2 start server/index.js --name aimleads-api
pm2 save
pm2 startup
```

Check API:

```bash
curl http://127.0.0.1:3001/api/health
```

## 6) Serve frontend + proxy API via Nginx

Create `/etc/nginx/sites-available/aimleads`:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/aimleads/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/aimleads /etc/nginx/sites-enabled/aimleads
sudo nginx -t
sudo systemctl reload nginx
```

## 7) Enable HTTPS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 8) Post-deploy smoke tests

1. Open app URL and login
2. Run one lead analysis
3. Confirm fields update (`icp_score`, `ai_score`, `final_score`)
4. Save ICP profile, re-analyze same lead, confirm score change
5. Restart PM2 (`pm2 restart aimleads-api`) and verify app still works

## 9) Ops basics

Useful commands:

```bash
pm2 status
pm2 logs aimleads-api
pm2 restart aimleads-api
sudo systemctl status nginx
```

Data file currently used:

- `server/data/db.json`

Back it up regularly if you stay on JSON storage.
