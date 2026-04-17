import express from 'express';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { requireCredits, logTokenUsage } from '../lib/credits.js';
import { dataStore } from '../lib/dataStore.js';
import { sanitizeWebsite } from '../lib/utils.js';
import { schemas, validateBody } from '../lib/validation.js';
import { analyzeLead } from '../services/analyzeService.js';
import { extractSignalsFromFindings } from '../services/externalSignalExtractor.js';
import { discoverInternetSignals } from '../services/internetSignalDiscoveryService.js';
import { writeAuditLog } from '../lib/auditLog.js';
import { createUserRateLimit } from '../lib/rateLimit.js';
import { generateOutreachSequence, sequenceGeneratorAvailable } from '../services/sequenceService.js';
import { findEmailForLead } from '../services/hunterService.js';
import { fetchCompanyNewsFindings } from '../services/newsService.js';
import { researchCompanyOnWeb } from '../services/claudeWebResearchService.js';
import { toLeadAnalysisUpdatePayload } from '../services/leadAnalysisPersistence.js';
import { getCrmIntegration, syncLeadToCrm } from '../services/crmService.js';
import { normalizeLeadForResponse } from '../lib/leadNormalization.js';
import { getUserWorkspaceId } from '../lib/scope.js';
import { logger } from '../lib/observability.js';
import { runAiOperation } from '../services/aiRunService.js';
import { ANALYSIS_PROMPT_VERSION, getIcpSummary } from '../services/llmService.js';
import { SEQUENCE_PROMPT_VERSION } from '../services/sequenceService.js';
import { addBreadcrumb } from '../lib/sentry.js';
import { isFeatureFlagEnabled } from '../lib/featureFlags.js';
import { enqueueJob } from '../lib/queue.js';

// Per-user limits for expensive LLM operations
const sequenceLimiter = createUserRateLimit({
  namespace: 'sequence_user',
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many sequence generation requests, please wait.',
});

const scoreIcpLimiter = createUserRateLimit({
  namespace: 'score_icp_user',
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Too many Score ICP requests, please wait.',
});

const reanalyzeLimiter = createUserRateLimit({
  namespace: 'reanalyze_user',
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many reanalyze requests, please wait.',
});

const discoverLimiter = createUserRateLimit({
  namespace: 'discover_user',
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many signal discovery requests, please wait.',
});

const importLimiter = createUserRateLimit({
  namespace: 'import_user',
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many import requests, please wait 1 minute.',
});

const externalSignalsLimiter = createUserRateLimit({
  namespace: 'external_signals_user',
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Too many external signal requests, please wait.',
});

const router = express.Router();
wrapAsyncRoutes(router);

const toLeadPayload = (row) => ({
  company_name: row.company_name || row['company name'] || row.name,
  website_url: sanitizeWebsite(row.website_url || row.website || row.url || ''),
  industry: row.industry || '',
  company_size: row.company_size ? Number.parseInt(row.company_size, 10) : null,
  country: row.country || '',
  contact_name: row.contact_name || row.contact || '',
  contact_role: row.contact_role || row.role || row.title || '',
  contact_email: row.contact_email || row.email || '',
  source_list: row.source_list || row.source || '',
});

const normalizeSignalPayload = (item, lead) => {
  if (!item) return null;

  if (typeof item === 'string') {
    const key = item.trim();
    if (!key) return null;
    return {
      key,
      confidence: 80,
      found_at: new Date().toISOString(),
    };
  }

  if (typeof item !== 'object') return null;

  const key = String(item.key || item.signal || item.code || '').trim();
  if (!key) {
    const extracted = extractSignalsFromFindings({ findings: [item], lead });
    return extracted[0] || null;
  }

  const confidence = Number(item.confidence);
  const normalizedConfidence = Number.isFinite(confidence)
    ? confidence <= 1
      ? confidence * 100
      : confidence
    : 80;

  return {
    key,
    evidence: String(item.evidence || item.url || item.source_url || '').trim(),
    confidence: Math.max(0, Math.min(100, Math.round(normalizedConfidence))),
    source_type: String(item.source_type || item.sourceType || '').trim() || undefined,
    found_at: String(item.found_at || item.foundAt || item.published_at || '').trim() || new Date().toISOString(),
  };
};

const mergeInternetSignals = (currentSignals, incomingSignals, lead) => {
  const normalizedCurrent = Array.isArray(currentSignals)
    ? currentSignals.map((item) => normalizeSignalPayload(item, lead)).filter(Boolean)
    : [];
  const normalizedIncoming = Array.isArray(incomingSignals)
    ? incomingSignals.map((item) => normalizeSignalPayload(item, lead)).filter(Boolean)
    : [];

  const seen = new Set();
  const merged = [];

  for (const signal of [...normalizedCurrent, ...normalizedIncoming]) {
    const dedupeKey = `${String(signal.key || '').toLowerCase()}|${String(signal.evidence || '').toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(signal);
  }

  return merged;
};

const sanitizeSpreadsheetCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /^[\t\r ]*[=+\-@]/.test(str) ? `'${str}` : str;
};

const applyAnalysisIfPossible = async ({ user, leadId, lead, internetSignals, shouldReanalyze = true, skipLlm = false }) => {
  if (!shouldReanalyze) {
    return {
      lead,
      analysis: null,
      reanalyzed: false,
    };
  }

  const activeIcp = await dataStore.getActiveIcpProfile(user);
  if (!activeIcp) {
    return {
      lead,
      analysis: null,
      reanalyzed: false,
    };
  }

  const analysis = await analyzeLead({
    lead: { ...lead, internet_signals: internetSignals },
    icpProfile: activeIcp,
    skipLlm,
  });

  const updatedLead = await dataStore.updateLead(user, leadId, {
    internet_signals: internetSignals,
    ...toLeadAnalysisUpdatePayload(analysis),
  });

  return {
    lead: updatedLead,
    analysis,
    reanalyzed: true,
  };
};

const shouldRunAsyncLeadJob = async (req) => {
  if (req.body?.async !== true) return false;
  return isFeatureFlagEnabled(getUserWorkspaceId(req.user), 'async_jobs');
};

const runReanalyzeOperation = async ({ req, lead, skipLlm }) => {
  const activeIcp = await dataStore.getActiveIcpProfile(req.user);
  if (!activeIcp) {
    const error = new Error('No active ICP profile found');
    error.status = 400;
    throw error;
  }

  const analysis = await runAiOperation({
    user: req.user,
    leadId: lead.id,
    action: 'reanalyze',
    provider: skipLlm ? 'internal' : 'anthropic',
    promptVersion: ANALYSIS_PROMPT_VERSION,
    requestPayload: {
      lead_id: lead.id,
      company_name: lead.company_name || null,
      icp_profile_id: activeIcp.id || null,
      skip_llm: skipLlm,
      internet_signal_count: Array.isArray(lead.internet_signals) ? lead.internet_signals.length : 0,
    },
    execute: () => analyzeLead({
      lead: { ...lead, internet_signals: lead.internet_signals || [] },
      icpProfile: activeIcp,
      skipLlm,
    }),
  });

  if (analysis._token_usage) logTokenUsage(req, 'reanalyze_llm', analysis._token_usage);

  const updatedLead = await dataStore.updateLead(req.user, lead.id, {
    internet_signals: lead.internet_signals || [],
    ...toLeadAnalysisUpdatePayload(analysis),
  });

  return {
    lead: normalizeLeadForResponse(updatedLead),
    analysis,
    signals_count: Array.isArray(lead.internet_signals) ? lead.internet_signals.length : 0,
    mode: skipLlm ? 'deterministic_reanalyze' : 'ai_reanalyze',
  };
};

const runDiscoverSignalsOperation = async ({
  req,
  lead,
  normalizedSignals,
  extractedSignals,
  incomingFindingsInput,
  nextIntentSignals,
  replace,
  shouldReanalyze,
  requestedMaxPages,
}) => {
  const [discovered, hunterResult, newsFindings, webResearch] = await runAiOperation({
    user: req.user,
    leadId: lead.id,
    action: 'discover_signals',
    provider: 'mixed',
    promptVersion: 'discover-signals-v1',
    requestPayload: {
      lead_id: lead.id,
      company_name: lead.company_name || null,
      website_url: lead.website_url || null,
      max_pages: Number.isFinite(requestedMaxPages) ? requestedMaxPages : null,
      reanalyze: shouldReanalyze,
    },
    execute: async () => {
      const [nextDiscovered, nextHunterResult, nextNewsFindings, nextWebResearch] = await Promise.all([
        discoverInternetSignals({
          lead,
          maxPages: Number.isFinite(requestedMaxPages) ? requestedMaxPages : undefined,
        }),
        findEmailForLead(lead),
        fetchCompanyNewsFindings(lead),
        researchCompanyOnWeb(lead),
      ]);

      return {
        discovered: nextDiscovered,
        hunterResult: nextHunterResult,
        newsFindings: nextNewsFindings,
        webResearch: nextWebResearch,
        mode: shouldReanalyze ? 'discover_and_reanalyze' : 'discover_only',
      };
    },
  }).then((result) => [result.discovered, result.hunterResult, result.newsFindings, result.webResearch]);

  const newsSignals = extractSignalsFromFindings({ findings: newsFindings, lead });

  const leadEmailPatch = hunterResult?.email && !lead.contact_email
    ? { contact_email: hunterResult.email }
    : {};

  const hunterSignals = hunterResult?.email && !lead.contact_email
    ? [{
        key: 'email_found',
        evidence: `Email professionnel trouvé via Hunter.io : ${hunterResult.email}`,
        confidence: Math.min(0.97, (hunterResult.score ?? 70) / 100),
        source_type: 'hunter_io',
        found_at: new Date().toISOString(),
      }]
    : [];

  const incomingSignals = [
    ...normalizedSignals,
    ...extractedSignals,
    ...(discovered.signals || []),
    ...newsSignals,
    ...hunterSignals,
    ...(webResearch.signals || []),
  ];

  const nextSignals = replace
    ? mergeInternetSignals([], incomingSignals, lead)
    : mergeInternetSignals(lead.internet_signals, incomingSignals, lead);

  let updatedLead = await dataStore.updateLead(req.user, lead.id, {
    ...leadEmailPatch,
    ...(nextIntentSignals ? { intent_signals: nextIntentSignals } : {}),
    internet_signals: nextSignals,
    auto_signal_metadata: {
      last_discovery_at: new Date().toISOString(),
      pages_scanned: discovered.pages_scanned || 0,
      findings_count: (discovered.findings || []).length + incomingFindingsInput.length + newsFindings.length + (webResearch.findings || []).length,
      discovered_signals: (discovered.signals || []).length,
      news_signals: newsSignals.length,
      web_research_signals: (webResearch.signals || []).length,
      hunter_email: hunterResult?.email || null,
      warnings: discovered.warnings || [],
    },
  });

  const { lead: analyzedLead, analysis, reanalyzed } = await applyAnalysisIfPossible({
    user: req.user,
    leadId: lead.id,
    lead: { ...lead, ...updatedLead, ...(nextIntentSignals ? { intent_signals: nextIntentSignals } : {}) },
    internetSignals: nextSignals,
    shouldReanalyze,
  });

  if (analysis?._token_usage) logTokenUsage(req, 'analyze', analysis._token_usage);
  updatedLead = analyzedLead;

  const providerStatus = {
    website: (discovered.signals || []).length > 0 ? 'ok' : 'no_results',
    hunter: !process.env.HUNTER_API_KEY ? 'skipped' : (hunterResult?.email ? 'ok' : 'no_results'),
    news: !process.env.NEWS_API_KEY ? 'skipped' : (newsFindings.length > 0 ? 'ok' : 'no_results'),
    web_research: !process.env.ANTHROPIC_API_KEY
      ? 'skipped'
      : ((webResearch.signals || []).length > 0 || (webResearch.findings || []).length > 0 ? 'ok' : 'no_results'),
  };

  return {
    lead: normalizeLeadForResponse(updatedLead),
    analysis,
    signals_count: nextSignals.length,
    discovered_signals: (discovered.signals || []).length,
    findings_count: (discovered.findings || []).length + incomingFindingsInput.length + newsFindings.length,
    ingested_signals: normalizedSignals.length,
    extracted_from_findings: extractedSignals.length,
    news_signals: newsSignals.length,
    web_research_signals: (webResearch.signals || []).length,
    hunter_email: hunterResult?.email || null,
    pages_scanned: discovered.pages_scanned || 0,
    warnings: discovered.warnings || [],
    reanalyzed,
    provider_status: providerStatus,
  };
};

const runSequenceOperation = async ({ req, lead }) => {
  if (!sequenceGeneratorAvailable) {
    const error = new Error('Sequence generation is not available (no LLM key configured).');
    error.status = 503;
    throw error;
  }

  const icpProfile = await dataStore.getActiveIcpProfile(req.user);
  if (!icpProfile) {
    const error = new Error('No active ICP profile found');
    error.status = 400;
    throw error;
  }

  const analysisContext = {
    final_score: lead.final_score,
    icp_category: lead.icp_category,
    fit_reasoning: lead.fit_reasoning,
    buying_signals: lead.buying_signals,
    key_insights: lead.key_insights,
    icebreaker_email: lead.icebreaker_email,
  };

  const result = await runAiOperation({
    user: req.user,
    leadId: lead.id,
    action: 'sequence',
    provider: 'anthropic',
    promptVersion: SEQUENCE_PROMPT_VERSION,
    requestPayload: {
      lead_id: lead.id,
      company_name: lead.company_name || null,
      icp_profile_id: icpProfile.id || null,
      final_score: lead.final_score ?? null,
    },
    execute: () => generateOutreachSequence(lead, icpProfile, analysisContext),
  });

  if (!result) {
    const error = new Error('Sequence generation failed. Please try again.');
    error.status = 502;
    throw error;
  }

  if (result._usage) logTokenUsage(req, 'sequence', result._usage);
  return result;
};

router.use(requireAuth);

router.get('/', async (req, res) => {
  const sort = req.query.sort || '-created_date';
  const all = await dataStore.listLeads(req.user, sort);
  const normalized = (all || []).map(normalizeLeadForResponse);

  const limit = req.query.limit ? Math.max(1, Math.min(1000, Number.parseInt(req.query.limit, 10))) : null;
  const page = req.query.page ? Math.max(1, Number.parseInt(req.query.page, 10)) : 1;
  const offset = req.query.offset !== undefined ? Math.max(0, Number.parseInt(req.query.offset, 10)) : limit ? (page - 1) * limit : 0;

  if (limit) {
    const paginated = normalized.slice(offset, offset + limit);
    return res.json({
      data: paginated,
      meta: {
        total: normalized.length,
        limit,
        offset,
        page,
        pages: Math.ceil(normalized.length / limit),
      },
    });
  }

  return res.json({ data: normalized });
});

router.post('/filter', validateBody(schemas.whereSchema), async (req, res) => {
  const where = req.validatedBody.where || {};
  const filtered = await dataStore.filterLeads(req.user, where);
  return res.json({ data: (filtered || []).map(normalizeLeadForResponse) });
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();

  if (!q) {
    return res.status(400).json({ message: 'Query parameter "q" is required' });
  }

  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

  const all = await dataStore.listLeads(req.user, '-created_date');

  const SEARCHABLE = ['company_name', 'website_url', 'industry', 'country', 'contact_name', 'contact_role', 'contact_email', 'source_list', 'notes', 'status', 'icp_category'];

  const results = (all || []).filter((lead) =>
    SEARCHABLE.some((field) => String(lead[field] || '').toLowerCase().includes(q))
  );

  const paginated = results.slice(offset, offset + limit);

  return res.json({
    data: paginated.map(normalizeLeadForResponse),
    meta: { query: q, total: results.length, limit, offset, has_more: offset + limit < results.length },
  });
});

router.post('/import', importLimiter, validateBody(schemas.leadImportSchema), async (req, res) => {
  const rows = Array.isArray(req.validatedBody.rows) ? req.validatedBody.rows : [];

  const created = rows
    .map((row) => ({
      created_at: new Date().toISOString(),
      status: 'To Analyze',
      follow_up_status: 'To Contact',
      ...toLeadPayload(row),
    }))
    .filter((lead) => Boolean(lead.company_name));

  const inserted = await dataStore.createLeadsBulk(req.user, created);
  return res.status(201).json({ data: (inserted || []).map(normalizeLeadForResponse) });
});

router.post('/', validateBody(schemas.leadCreateSchema), async (req, res) => {
  const payload = req.validatedBody || {};

  const lead = await dataStore.createLead(req.user, {
    status: payload.status || 'To Analyze',
    follow_up_status: payload.follow_up_status || 'To Contact',
    ...payload,
    ...toLeadPayload(payload),
  });

  writeAuditLog({
    user: req.user,
    action: 'create',
    resourceType: 'lead',
    resourceId: lead.id,
    changes: { company_name: lead.company_name },
  });

  return res.status(201).json({ data: normalizeLeadForResponse(lead) });
});

router.get('/export', async (req, res) => {
  const all = await dataStore.listLeads(req.user, '-created_date');
  const leads = (all || []).map(normalizeLeadForResponse);

  const CSV_FIELDS = [
    'id', 'company_name', 'website_url', 'industry', 'company_size', 'country',
    'contact_name', 'contact_role', 'contact_email', 'source_list',
    'status', 'follow_up_status', 'icp_score', 'ai_score', 'final_score',
    'icp_category', 'final_category', 'final_status', 'final_recommended_action',
    'notes', 'created_at', 'last_analyzed_at',
  ];

  const escape = (val) => {
    const str = sanitizeSpreadsheetCell(val).replace(/"/g, '""');
    return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
  };

  const header = CSV_FIELDS.join(',');
  const rows = leads.map((lead) => CSV_FIELDS.map((f) => escape(lead[f])).join(','));
  const csv = [header, ...rows].join('\n');

  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
  await writeAuditLog({
    user: req.user,
    action: 'export',
    resourceType: 'lead_export',
    resourceId: filename,
    changes: {
      exported_count: leads.length,
      fields: CSV_FIELDS.length,
    },
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
});

router.get('/:leadId', async (req, res) => {
  const lead = await dataStore.getLeadById(req.user, req.params.leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  return res.json({ data: normalizeLeadForResponse(lead) });
});

router.post('/:leadId/external-signals', externalSignalsLimiter, validateBody(schemas.externalSignalsSchema), async (req, res) => {
  const lead = await dataStore.getLeadById(req.user, req.params.leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  const incomingSignalsInput = req.validatedBody.signals;
  const incomingFindingsInput = req.validatedBody.findings;

  const normalizedSignals = incomingSignalsInput
    .map((item) => normalizeSignalPayload(item, lead))
    .filter(Boolean);
  const extractedSignals = extractSignalsFromFindings({
    findings: incomingFindingsInput,
    lead,
  });

  const incomingSignals = [...normalizedSignals, ...extractedSignals];

  const replace = req.validatedBody.replace;
  const shouldReanalyze = req.validatedBody.reanalyze !== false;

  const nextSignals = replace
    ? mergeInternetSignals([], incomingSignals, lead)
    : mergeInternetSignals(lead.internet_signals, incomingSignals, lead);

  let updatedLead = await dataStore.updateLead(req.user, lead.id, {
    internet_signals: nextSignals,
  });

  const { lead: analyzedLead, analysis, reanalyzed } = await applyAnalysisIfPossible({
    user: req.user,
    leadId: lead.id,
    lead: { ...lead, ...updatedLead },
    internetSignals: nextSignals,
    shouldReanalyze,
  });

  if (analysis?._token_usage) logTokenUsage(req, 'analyze', analysis._token_usage);
  updatedLead = analyzedLead;

  return res.json({
    data: {
      lead: normalizeLeadForResponse(updatedLead),
      analysis,
      signals_count: nextSignals.length,
      ingested_signals: normalizedSignals.length,
      extracted_from_findings: extractedSignals.length,
      reanalyzed,
    },
  });
});

// ─── Score ICP — deterministic scoring + Haiku summary (1 credit) ────────────
router.post('/:leadId/score-icp', scoreIcpLimiter, requireCredits('score_icp'), async (req, res) => {
  const lead = await dataStore.getLeadById(req.user, req.params.leadId);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });

  const activeIcp = await dataStore.getActiveIcpProfile(req.user);
  if (!activeIcp) return res.status(400).json({ message: 'No active ICP profile found' });

  // Deterministic scoring only (no LLM in analyzeLead)
  const analysis = await analyzeLead({ lead, icpProfile: activeIcp, skipLlm: true });

  // Lightweight Haiku call for a 2-sentence summary + 3 improvement tips
  const icpSummaryResult = await getIcpSummary(lead, activeIcp, analysis.icp_score, analysis.category);

  // Persist ICP score fields + summary to lead
  const scorePayload = toLeadAnalysisUpdatePayload(analysis);
  const icpSummary = icpSummaryResult.summary
    ? `${icpSummaryResult.summary}${icpSummaryResult.improvement_tips?.length ? `\n\nPistes d'amélioration:\n${icpSummaryResult.improvement_tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : ''}`
    : null;

  const updatedLead = await dataStore.updateLead(req.user, lead.id, {
    ...scorePayload,
    ...(icpSummary ? { icp_summary: icpSummary } : {}),
  });

  return res.json({
    data: {
      lead: updatedLead,
      icp_score: analysis.icp_score,
      icp_category: analysis.category,
      icp_priority: analysis.priority,
      recommended_action: analysis.recommended_action,
      summary: icpSummaryResult.summary,
      improvement_tips: icpSummaryResult.improvement_tips,
    },
  });
});

router.post('/:leadId/reanalyze', reanalyzeLimiter, requireCredits('reanalyze_llm'), async (req, res) => {
  addBreadcrumb({
    category: 'ai',
    message: 'ai.reanalyze.requested',
    data: {
      user_id: req.user?.id || null,
      workspace_id: req.user?.workspace_id || null,
      lead_id: req.params.leadId,
      skip_llm: Boolean(req.body?.skip_llm || req.body?.skipLlm),
    },
  });
  const lead = await dataStore.getLeadById(req.user, req.params.leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  const skipLlm = Boolean(req.body?.skip_llm || req.body?.skipLlm);
  if (await shouldRunAsyncLeadJob(req)) {
    const job = enqueueJob({
      name: 'Lead reanalysis',
      action: 'reanalyze',
      workspaceId: getUserWorkspaceId(req.user),
      userId: req.user.id,
      leadId: lead.id,
      initialMessage: 'Queued for reanalysis',
      runningMessage: 'Reanalyzing lead',
      execute: async ({ setProgress }) => {
        setProgress(35, 'Reloading lead context');
        const result = await runReanalyzeOperation({ req, lead, skipLlm });
        setProgress(100, 'Reanalysis completed');
        return { data: result };
      },
    });

    return res.status(202).json({
      data: {
        jobId: job.id,
        status: job.status,
      },
    });
  }

  const result = await runReanalyzeOperation({ req, lead, skipLlm });
  return res.json({ data: result });
});
router.post('/:leadId/discover-signals', discoverLimiter, requireCredits('discover_signals'), async (req, res) => {
  addBreadcrumb({
    category: 'ai',
    message: 'ai.discover_signals.requested',
    data: {
      user_id: req.user?.id || null,
      workspace_id: req.user?.workspace_id || null,
      lead_id: req.params.leadId,
      replace: Boolean(req.body?.replace),
      reanalyze: req.body?.reanalyze !== false,
    },
  });
  const lead = await dataStore.getLeadById(req.user, req.params.leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  const incomingSignalsInput = Array.isArray(req.body?.signals) ? req.body.signals : [];
  const incomingFindingsInput = Array.isArray(req.body?.findings) ? req.body.findings : [];
  const nextIntentSignals =
    req.body?.intent_signals && typeof req.body.intent_signals === 'object'
      ? req.body.intent_signals
      : lead.intent_signals;
  const replace = Boolean(req.body?.replace);
  const shouldReanalyze = req.body?.reanalyze !== false;
  const requestedMaxPages = Number(req.body?.max_pages || req.body?.maxPages);

  const normalizedSignals = incomingSignalsInput
    .map((item) => normalizeSignalPayload(item, lead))
    .filter(Boolean);
  const extractedSignals = extractSignalsFromFindings({
    findings: incomingFindingsInput,
    lead,
  });

  if (await shouldRunAsyncLeadJob(req)) {
    const job = enqueueJob({
      name: 'Signal discovery',
      action: 'discover_signals',
      workspaceId: getUserWorkspaceId(req.user),
      userId: req.user.id,
      leadId: lead.id,
      initialMessage: 'Queued for signal discovery',
      runningMessage: 'Discovering signals',
      execute: async ({ setProgress }) => {
        setProgress(30, 'Scanning external providers');
        const result = await runDiscoverSignalsOperation({
          req,
          lead,
          normalizedSignals,
          extractedSignals,
          incomingFindingsInput,
          nextIntentSignals,
          replace,
          shouldReanalyze,
          requestedMaxPages,
        });
        setProgress(100, 'Signal discovery completed');
        return { data: result };
      },
    });

    return res.status(202).json({
      data: {
        jobId: job.id,
        status: job.status,
      },
    });
  }

  const result = await runDiscoverSignalsOperation({
    req,
    lead,
    normalizedSignals,
    extractedSignals,
    incomingFindingsInput,
    nextIntentSignals,
    replace,
    shouldReanalyze,
    requestedMaxPages,
  });

  return res.json({ data: result });
});

router.patch('/:leadId', validateBody(schemas.leadPatchSchema), async (req, res) => {
  const updates = req.validatedBody || {};
  const safeUpdates = {
    ...updates,
  };

  if (updates.website_url !== undefined) {
    safeUpdates.website_url = sanitizeWebsite(updates.website_url);
  }

  const updatedLead = await dataStore.updateLead(req.user, req.params.leadId, safeUpdates);

  if (!updatedLead) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  writeAuditLog({
    user: req.user,
    action: 'update',
    resourceType: 'lead',
    resourceId: req.params.leadId,
    changes: safeUpdates,
  });

  // Auto-sync to any active CRM when a lead becomes "Qualified"
  if (safeUpdates.status === 'Qualified' && updatedLead.status === 'Qualified') {
    const workspaceId = getUserWorkspaceId(req.user);
    const leadSnapshot = { ...updatedLead };
    setImmediate(async () => {
      for (const crmType of ['hubspot', 'salesforce']) {
        try {
          const integration = await getCrmIntegration(workspaceId, crmType);
          if (integration?.is_active) {
            await syncLeadToCrm(workspaceId, leadSnapshot, crmType);
          }
        } catch (err) {
          // fire-and-forget: log but never block the response
          logger.warn('crm_auto_sync_failed', { crm_type: crmType, lead_id: leadSnapshot.id, error: err.message });
        }
      }
    });
  }

  return res.json({ data: normalizeLeadForResponse(updatedLead) });
});

router.delete('/:leadId', async (req, res) => {
  const deleted = await dataStore.deleteLead(req.user, req.params.leadId);

  if (!deleted) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  writeAuditLog({
    user: req.user,
    action: 'delete',
    resourceType: 'lead',
    resourceId: deleted.id,
    changes: { company_name: deleted.company_name, final_score: deleted.final_score },
  });

  return res.status(200).json({ data: { id: deleted.id, deleted: true } });
});

router.post('/bulk-delete', validateBody(schemas.bulkDeleteSchema), async (req, res) => {
  const ids = req.validatedBody.ids;

  const results = await Promise.allSettled(ids.map((id) => dataStore.deleteLead(req.user, String(id))));

  const deleted = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value.id);

  const failed = ids.filter((id) => !deleted.includes(id));

  for (const id of deleted) {
    writeAuditLog({
      user: req.user,
      action: 'delete',
      resourceType: 'lead',
      resourceId: id,
      changes: { bulk: true },
    });
  }

  return res.json({
    data: { deleted_count: deleted.length, failed_count: failed.length, deleted_ids: deleted },
  });
});

// ─── AI: Generate multi-touch outreach sequence ───────────────────────────────

router.post('/:leadId/sequence', sequenceLimiter, requireCredits('sequence'), async (req, res) => {
  addBreadcrumb({
    category: 'ai',
    message: 'ai.sequence.requested',
    data: {
      user_id: req.user?.id || null,
      workspace_id: req.user?.workspace_id || null,
      lead_id: req.params.leadId,
    },
  });
  if (!sequenceGeneratorAvailable) {
    return res.status(503).json({ message: 'Sequence generation is not available (no LLM key configured).' });
  }

  const lead = await dataStore.getLeadById(req.user, req.params.leadId);
  if (!lead) return res.status(404).json({ message: 'Lead not found' });

  if (await shouldRunAsyncLeadJob(req)) {
    const job = enqueueJob({
      name: 'Outreach sequence',
      action: 'sequence',
      workspaceId: getUserWorkspaceId(req.user),
      userId: req.user.id,
      leadId: lead.id,
      initialMessage: 'Queued for sequence generation',
      runningMessage: 'Generating sequence',
      execute: async ({ setProgress }) => {
        setProgress(35, 'Building outreach context');
        const result = await runSequenceOperation({ req, lead });
        setProgress(100, 'Sequence completed');
        return { data: result };
      },
    });

    return res.status(202).json({
      data: {
        jobId: job.id,
        status: job.status,
      },
    });
  }

  const result = await runSequenceOperation({ req, lead });
  return res.json({ data: result });
});

export default router;
