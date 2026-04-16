# ICP + AI Scoring Logic

This app uses a two-step scoring model:

1. `icp_score` (deterministic fit with active ICP profile)
2. `final_score` (ICP base reinforced by intent signals)

The backend is authoritative (`POST /api/analyze`). Unsaved ICP edits in UI are not used.

## 1) ICP raw score model

Raw score starts at `0` and sums these sections:

- `industrie`: `parfait +30`, `partiel +15`, `aucun -30`, `exclu -100`
- `roles`: `parfait +25`, `partiel +10`, `aucun -25`, `exclu -100`
- `typeClient`: `parfait +25`, `partiel +10`, `aucun -40`
- `structure`: `parfait +15`, `partiel +10`, `aucun -20`
- `geo`: `parfait +15`, `partiel +5`, `aucun -10`

Hard exclusions:

- if industry matches `weights.industrie.exclusions`, lead is excluded (`-100`)
- if role matches `weights.roles.exclusions`, lead is excluded (`-100`)

Raw score is clamped to `[-100, +110]`.

## 2) ICP normalized score (`icp_score`)

- if `raw <= -100`: `0`
- if `raw >= 0`: `round((raw / 110) * 100)`
- else: `max(0, round(20 + raw / 5))`

## 3) Category mapping

For ICP and final category:

- `80-100`: `Excellent`
- `50-79`: `Strong Fit`
- `20-49`: `Medium Fit`
- `1-19`: `Low Fit`
- `0`: `Excluded`

## 4) AI intent signal score (`ai_score`)

`ai_score` is a confidence-weighted intent signal score from:

- manual SDR signals (`pre_call`, `post_contact`, `negative`)
- internet signals (`internet_signals`) with:
  - source reliability (`official_company_site`, `trusted_news`, ...)
  - confidence
  - recency decay

Important behavior:

- no intent signals => low baseline AI score (`12`) and **no boost** on ICP
- hard-stop negatives (`closed_or_dead`, `liquidation_or_bankruptcy`) force a strong negative impact
- AI is meant to reinforce or de-prioritize, not replace ICP fit

## 5) Final prioritization score (`final_score`)

Final score is computed as:

`final_score = clamp(icp_score + ai_boost, 0, 100)`

Where:

- `ai_boost` is derived from AI signal score and capped (`-35` to `+30`)
- if no intent signals, `ai_boost = 0`
- if ICP hard exclusion applies, final score is forced to `0`

The old weighted blend (`60/40`) is no longer used for score computation.

## 6) Final action mapping

Based on urgency/negative blockers + final score:

- `Contact in 24h`
- `Contact within 48h`
- `Contact within 5 days`
- `Nurture sequence`
- `Reject lead` / `Block lead`

Also returned:

- `final_category`
- `final_priority`
- `final_recommended_action`
- `final_status`

## 7) External signals ingestion

Endpoint:

`POST /api/leads/:leadId/external-signals`

Supports:

- canonical `signals` payload (already mapped keys)
- raw `findings` payload (title/snippet/url/date) automatically extracted with keyword rules (`keyword_rules_v1`)

This allows n8n or a backend job to send raw web findings and let AimLeads map them into scoring keys.

## 8) API behavior

`POST /api/analyze` profile selection order:

1. provided `icp_profile_id`
2. active profile (`is_active=true`)
3. first profile fallback

Main fields returned:

- ICP: `icp_raw_score`, `icp_score`, `category`, `priority`, `recommended_action`
- profile/version: `icp_profile_id`, `icp_profile_name`, `analysis_version`
- AI: `ai_score`, `ai_confidence`, `ai_signals`, `ai_summary`
- Final: `final_score`, `final_category`, `final_priority`, `final_recommended_action`, `final_status`
- details: `signals`, `score_details`, `analysis_summary`

## 9) Source files

- Backend engines:
  - `server/services/analyzeService.js`
  - `server/services/aiSignalService.js`
  - `server/services/externalSignalExtractor.js`
- Front fallback engines:
  - `src/components/utils/mockAnalysis.jsx`
  - `src/services/analysis/aiSignalService.js`
- Routes:
  - `server/routes/analyze.js`
  - `server/routes/leads.js`
