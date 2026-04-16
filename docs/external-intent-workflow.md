# External Intent Signals Workflow (n8n or backend job)

## Goal
Use external buying signals to reinforce ICP scoring and output an actionable priority.

## Endpoint
`POST /api/leads/:leadId/external-signals`

## Mode A: send canonical signals (already mapped)

```json
{
  "replace": false,
  "reanalyze": true,
  "signals": [
    {
      "key": "active_rfp",
      "evidence": "https://company.com/procurement/rfp-2026",
      "confidence": 92,
      "source_type": "official_company_site",
      "found_at": "2026-03-17T19:30:00.000Z"
    },
    {
      "key": "recent_funding",
      "evidence": "https://technews.com/company-raised-series-a",
      "confidence": 85,
      "source_type": "trusted_news",
      "found_at": "2026-03-10T10:00:00.000Z"
    }
  ]
}
```

## Mode B: send raw web findings (auto-extracted)

```json
{
  "replace": false,
  "reanalyze": true,
  "findings": [
    {
      "title": "Gamma Fintech launches RFP for sales automation",
      "snippet": "The company opened a procurement process this week.",
      "url": "https://gammafintech.ai/news/rfp-automation",
      "published_at": "2026-03-12"
    },
    {
      "title": "Gamma Fintech raises Series B",
      "snippet": "The funding will be used to scale go-to-market operations.",
      "url": "https://technews.example/gamma-series-b",
      "published_at": "2026-03-05"
    }
  ]
}
```

The backend maps findings to canonical keys with `keyword_rules_v1`, infers source type, computes confidence, stores `internet_signals`, then re-analyzes if enabled.

## Response

```json
{
  "data": {
    "lead": { "id": "..." },
    "analysis": { "final_score": 78, "final_recommended_action": "Contact within 48h" },
    "signals_count": 6,
    "ingested_signals": 2,
    "extracted_from_findings": 4,
    "reanalyzed": true
  }
}
```

## Suggested n8n pipeline

1. Trigger: new lead or update.
2. Fetch evidence:
   - company site updates
   - news search
   - job posts
   - LinkedIn/company events
3. Extract findings:
   - keep title/snippet/url/date/source
4. Send to AimLeads `/external-signals` (Mode B is enough).
5. Write back:
   - `final_score`
   - `final_recommended_action`
   - urgency bucket for SDR queue.

## Priority behavior (implemented)

- no intent signals: AI does not distort ICP (`ai_boost = 0`)
- strong positive evidence: boosts score and can trigger `Contact in 24h`
- hard negatives (`closed_or_dead`, `liquidation_or_bankruptcy`): strong de-prioritization
- ICP exclusions always win (`final = 0`)
