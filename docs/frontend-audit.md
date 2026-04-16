# Frontend Audit and Refactor Plan

## 1) Architecture Audit

### Initial state observed
- Routing was generated from `pages.config.js` using page names as URL paths (for example `/Dashboard`, `/Reports`).
- Auth and user-loading logic was duplicated inside multiple pages.
- Data access was coupled directly to provider-specific calls from UI components and pages.
- Desktop layout (`Sidebar` + `Header`) was duplicated in each private page.
- Tailwind dynamic classes such as `bg-${color}-100` were used and are not reliable in production build extraction.

### Risks
- Hard dependency on external backend credentials blocked frontend progress.
- Duplicate auth/data logic increased bug surface and onboarding cost.
- Route naming strategy was not scalable for public URLs and deep links.

## 2) Missing / Incomplete Pages

### Incomplete before refactor
- `LeadDetail` existed but route strategy was not normalized around URL params.
- `Settings` had only one actionable section and no backend-ready placeholders.
- No explicit app-shell route separation (public vs private) and no guardable nested route structure.

### Current status after refactor
- Private routes are explicit and normalized: `/dashboard`, `/reports`, `/icp`, `/settings`, `/leads/:leadId`.
- `Settings` now includes backend-ready placeholders for Integrations and Team/Permissions.
- `LeadDetail` supports route param loading and fallback from navigation state.

## 3) Components Identified / Created

### Created
- `src/components/layout/AppShell.jsx`
  - Centralized private layout wrapper.
  - Handles desktop sidebar + mobile sheet navigation.

### Updated for scalability
- `Sidebar`, `Header` now reusable in a shell architecture.
- Lead-related components now consume data through unified client abstraction.

## 4) Imports, Errors, Inconsistencies Fixed

- Removed obsolete routing files: `src/pages.config.js`, `src/Layout.jsx`.
- Replaced direct provider-specific calls in pages/components with a single `dataClient` layer.
- Fixed hard-coded route generation and route naming inconsistencies.
- Replaced fragile dynamic Tailwind class patterns with static class mappings.
- Normalized status/category constants in `src/constants/leads.js`.

## 5) Clean and Scalable Structure (Current)

- `src/constants/`
  - `routes.js`
  - `leads.js`
- `src/services/`
  - `dataClient.js` (API + mock fallback orchestrator)
  - `analysis/analyzeLead.js`
  - `mock/mockDb.js`
- `src/components/layout/`
  - `AppShell.jsx`, `Header.jsx`, `Sidebar.jsx`
- `src/pages/`
  - Public: `Home`, `Pricing`
  - Private: `Dashboard`, `Reports`, `ICP`, `Settings`, `LeadDetail`

## 6) Backend Dependency Strategy (Implemented)

- Added fallback-first architecture:
  - If API is unavailable or unstable, app switches to local mock store.
  - Mock data is persisted in `localStorage` and supports CRUD for leads + ICP config.
- Frontend development can continue with no backend available.
- Data layer remains backend-ready: replacing fallback with real endpoints does not require rewriting page-level UI.

## Immediate Next Phase (Backend Build)

When starting backend, we can keep this frontend unchanged and implement adapters for:
- Auth endpoint/session flow.
- Leads CRUD and bulk import endpoint.
- ICP profile CRUD endpoint.
- Lead analysis endpoint (replace current analyzer wrapper).
