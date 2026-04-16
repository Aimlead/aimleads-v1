# Backend Architecture (Current)

## Runtime

- Node.js + Express (`server/app.js`, `server/index.js`)
- API namespace: `/api/*`
- Local persistence: `server/data/db.json`
- Session model: signed httpOnly cookie (`aimleads_session`)

## Modules

- `server/lib/db.js`: JSON DB read/write helpers
- `server/lib/auth.js`: password hashing + token signing/verification
- `server/lib/middleware.js`: optional/required auth middleware
- `server/services/analyzeService.js`: ICP scoring engine
- `server/services/bootstrap.js`: seed + demo account bootstrap

## Routes

- Auth:
  - `GET /api/auth/me`
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
- Leads:
  - `GET /api/leads`
  - `POST /api/leads`
  - `POST /api/leads/import`
  - `POST /api/leads/filter`
  - `GET /api/leads/:leadId`
  - `PATCH /api/leads/:leadId`
- ICP:
  - `GET /api/icp`
  - `POST /api/icp/filter`
  - `GET /api/icp/active`
  - `PUT /api/icp/active`
- Analysis:
  - `POST /api/analyze`
- Health:
  - `GET /api/health`

## Front Integration

- Front data layer: `src/services/dataClient.js`
- Default mode: `VITE_DATA_MODE=api`
- Fallback mode: local mock (`mockDb`) when API unavailable

## Vercel

- Function entrypoint: `api/index.js`
- Deploy config: `vercel.json`
