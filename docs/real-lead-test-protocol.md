# AimLead real-lead test protocol

## Goal

Validate that AimLead is useful on real leads, not just internally coherent.

We want to measure:

- scoring credibility
- signal usefulness
- output usefulness for a founder or SDR
- visible friction in the workflow

## Test setup

- Use 12 to 15 real leads from 3 buckets:
  - 4 to 5 obvious strong fits
  - 4 to 5 medium or ambiguous fits
  - 4 to 5 weak or adjacent fits
- Keep one active ICP fixed for the whole batch.
- Test from the current UI, not from raw API payloads.
- Record observations immediately after each lead to avoid hindsight bias.

## Per-lead checklist

For each lead, record:

1. Company name
2. Contact role
3. Base ICP score
4. AI boost
5. Final score
6. Suggested action
7. Top 2 visible signals
8. Whether the score direction feels correct
9. Whether an SDR would actually use the output
10. Main friction or confusion

## Per-lead scorecard

Use this exact scorecard for every lead so the batch is comparable:

| Field | What to record |
| --- | --- |
| Lead ID | internal id or company/contact pair |
| Bucket | strong fit / medium fit / low fit |
| ICP base score | score before AI reinforcement |
| AI boost | reinforcement added on top of the base score |
| Final score | score shown after scoring + signals |
| Final category | Excellent / Strong Fit / Medium Fit / Low Fit / Excluded |
| Suggested action | contact_now / contact_soon / nurture / deprioritize |
| Best 2 signals | the 2 signals that most influenced your judgment |
| Score credibility | 1 to 5 |
| Signal usefulness | 1 to 5 |
| Icebreaker usefulness | 1 to 5 |
| Overall actionability | 1 to 5 |
| Score direction correct? | yes / no |
| SDR would use it? | yes / no |
| Main friction | one short sentence or none |
| What felt wrong or missing | one short sentence |

## Quick entry template

Copy this block once per tested lead:

```md
### Lead
- Lead ID:
- Bucket:
- Company / Contact:
- ICP base score:
- Final score:
- AI boost:
- Final category:
- Suggested action:
- Best 2 signals:
- Score credibility (1-5):
- Signal usefulness (1-5):
- Icebreaker usefulness (1-5):
- Overall actionability (1-5):
- Score direction correct:
- SDR would use it:
- Friction observed:
- What felt wrong or missing:
```

## Scoring rubric

Use this 1 to 5 rubric for each lead:

- Score credibility
  - 1 = clearly wrong
  - 3 = plausible but debatable
  - 5 = clearly credible
- Signal relevance
  - 1 = mostly noise
  - 3 = mixed
  - 5 = commercially useful
- Icebreaker usefulness
  - 1 = unusable
  - 3 = needs edits
  - 5 = ready to send with light edits
- Overall actionability
  - 1 = not actionable
  - 3 = partially actionable
  - 5 = ready to use

## Success criteria

AimLead is ready for broader testing if:

- at least 70% of leads score 4 or 5 on score credibility
- at least 70% score 4 or 5 on signal relevance
- at least 70% score 4 or 5 on icebreaker usefulness
- at least 70% score 4 or 5 on overall actionability
- only repeated issues seen at least twice are considered real problems

## Batch decision at the end

At the end of the batch, summarize only these 5 items:

1. Which leads felt clearly over-scored
2. Which leads felt clearly under-scored
3. Which signals were genuinely useful for prioritization
4. Which outputs were good enough to use without heavy rewriting
5. Which UX friction repeated at least twice

If a problem appears only once, log it and do not change the product yet.

If the same problem appears 3+ times, create a fix ticket in one of these buckets:

- scoring calibration
- signal quality
- copy/output quality
- workflow UX
- data quality / identity resolution

## Failure patterns to watch

- weak-fit leads boosted too aggressively
- strong-fit leads under-scored
- signals that are true but commercially useless
- outputs that feel analytical but not actionable
- outreach copy that sounds generic or overclaims context
- UI that makes it hard to understand why a lead is ranked where it is

## What to do after the batch

- Review patterns after each batch of 5 leads.
- Group issues by pattern, not by individual lead.
- Only change the scoring prompt if a pattern repeats across multiple leads.
- Only change the UI if the same confusion appears in multiple sessions.
- Keep a short before/after log of any scoring or UX changes made after the batch.
