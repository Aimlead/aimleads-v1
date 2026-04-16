import express from 'express';
import { getRuntimeConfig } from '../lib/config.js';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore, getDataStoreRuntime } from '../lib/dataStore.js';
import { bootstrapWorkspaceDemoData } from '../services/bootstrap.js';
import { analyzeLead } from '../services/analyzeService.js';
import { toLeadAnalysisUpdatePayload } from '../services/leadAnalysisPersistence.js';
import { normalizeText } from '../lib/serviceUtils.js';

const router = express.Router();
wrapAsyncRoutes(router);

const DEFAULT_DEV_ICP = {
  name: 'Dev Default ICP',
  description: 'Auto-created ICP for workspace test actions.',
  weights: {
    industrie: {
      primaires: ['SaaS', 'Software', 'Information Technology'],
      secondaires: ['IT Services and IT Consulting', 'Computer and Network Security', 'FinTech'],
      exclusions: ['Hospital', 'Education', 'Public Administration'],
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exacts: ['CTO', 'CIO', 'CISO', 'Head of IT', 'IT Director', 'VP IT', 'DSI'],
      proches: ['Engineering Manager', 'Security Manager', 'Infrastructure Manager'],
      exclusions: ['Intern', 'Assistant'],
      scores: { parfait: 25, partiel: 10, aucun: -25, exclu: -100 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: ['B2B2C'],
      scores: { parfait: 20, partiel: 10, aucun: -20 },
    },
    structure: {
      primaire: { min: 50, max: 5000 },
      secondaire: { min: 20, max: 10000 },
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: ['France', 'Belgium', 'Switzerland'],
      secondaire: ['Germany', 'Spain', 'Italy'],
      scores: { parfait: 10, partiel: 5, aucun: -10 },
    },
    meta: {
      minScore: 0,
      maxScore: 100,
      finalScoreWeights: { icp: 60, ai: 40 },
      icpThresholds: { excellent: 80, strong: 50, medium: 20 },
      finalThresholds: { excellent: 80, strong: 50, medium: 20 },
      thresholds: {
        icp: { excellent: 80, strong: 50, medium: 20 },
        final: { excellent: 80, strong: 50, medium: 20 },
      },
    },
  },
};

const avg = (items, key) => {
  const values = (items || []).map((item) => Number(item?.[key])).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
};

const countBy = (items, getKey) => {
  const counts = {};
  for (const item of items || []) {
    const key = getKey(item) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

const leadKey = (lead) => {
  const company = normalizeText(lead.company_name);
  const website = normalizeText(lead.website_url);
  const email = normalizeText(lead.contact_email);
  const contact = normalizeText(lead.contact_name);
  return [company, website, email, contact].join('|');
};

const requireNonProduction = (_req, res, next) => {
  if (getRuntimeConfig().isProduction) {
    return res.status(403).json({ message: 'Dev tools are disabled in production.' });
  }
  return next();
};

const ensureActiveIcp = async (user) => {
  const existing = await dataStore.getActiveIcpProfile(user);
  if (existing) return existing;

  return dataStore.saveActiveIcpProfile(user, {
    ...DEFAULT_DEV_ICP,
    owner_user_id: user.id,
  });
};

const buildCheckup = async (user) => {
  const profiles = await dataStore.listIcpProfiles(user);
  const activeProfile = (profiles || []).find((profile) => profile.is_active) || profiles?.[0] || null;

  const leads = await dataStore.listLeads(user, '-created_date');
  const analyzedLeads = (leads || []).filter((lead) => Boolean(lead.last_analyzed_at));

  if (typeof dataStore.refreshDiagnostics === 'function') {
    try {
      await dataStore.refreshDiagnostics();
    } catch (error) {
      console.warn('refreshDiagnostics failed', error);
    }
  }

  const diagnostics = typeof dataStore.getDiagnostics === 'function' ? dataStore.getDiagnostics() : null;
  const unsupportedUserColumns = Array.isArray(diagnostics?.unsupported_user_columns)
    ? diagnostics.unsupported_user_columns
    : [];
  const unsupportedLeadColumns = Array.isArray(diagnostics?.unsupported_lead_columns)
    ? diagnostics.unsupported_lead_columns
    : [];

  const warnings = [];
  if (unsupportedUserColumns.includes('supabase_auth_id')) {
    warnings.push('Supabase schema mismatch: users.supabase_auth_id is missing. Run migration 20260318_auth_native_supabase.sql.');
  }
  if (unsupportedLeadColumns.length > 0) {
    warnings.push(`Supabase schema mismatch on leads table: missing column(s) ${unsupportedLeadColumns.join(', ')}.`);
  }

  return {
    runtime_provider: getDataStoreRuntime().activeProvider,
    configured_provider: getRuntimeConfig().dataProvider,
    active_icp: activeProfile
      ? {
          id: activeProfile.id,
          name: activeProfile.name,
        }
      : null,
    schema_diagnostics: diagnostics
      ? {
          provider: diagnostics.provider,
          unsupported_user_columns: unsupportedUserColumns,
          unsupported_lead_columns: unsupportedLeadColumns,
        }
      : null,
    counts: {
      workspace_leads_total: (leads || []).length,
      analyzed_total: analyzedLeads.length,
      source_lists_total: Object.keys(countBy(leads, (lead) => lead.source_list || 'unlisted')).length,
    },
    averages: {
      workspace_icp_score_avg: avg(leads, 'icp_score'),
      workspace_ai_score_avg: avg(leads, 'ai_score'),
      workspace_final_score_avg: avg(leads, 'final_score'),
    },
    profile_usage: countBy(leads, (lead) => lead.icp_profile_name),
    status_distribution: countBy(leads, (lead) => lead.status),
    source_list_distribution: countBy(leads, (lead) => lead.source_list || 'unlisted'),
    warnings,
  };
};

router.use(requireAuth);
router.use(requireNonProduction);

router.post('/load-demo', async (req, res) => {
  const before = await dataStore.listLeads(req.user, '-created_date');
  const beforeCount = Array.isArray(before) ? before.length : 0;

  await bootstrapWorkspaceDemoData(dataStore, req.user);

  const after = await dataStore.listLeads(req.user, '-created_date');
  const afterCount = Array.isArray(after) ? after.length : 0;

  return res.json({
    data: {
      inserted: Math.max(0, afterCount - beforeCount),
      total: afterCount,
      checkup: await buildCheckup(req.user),
    },
  });
});

router.post('/reanalyze', async (req, res) => {
  const sourceTag = normalizeText(req.body?.source_tag || '');
  const activeIcp = await ensureActiveIcp(req.user);

  const allLeads = await dataStore.listLeads(req.user, '-created_date');
  const scoped = sourceTag
    ? (allLeads || []).filter((lead) => normalizeText(lead.source_list) === sourceTag)
    : allLeads || [];

  let analyzed = 0;
  for (const lead of scoped) {
    const result = await analyzeLead({ lead, icpProfile: activeIcp });
    await dataStore.updateLead(req.user, lead.id, toLeadAnalysisUpdatePayload(result));
    analyzed += 1;
  }

  return res.json({
    data: {
      analyzed,
      total_scoped: scoped.length,
      source_tag: sourceTag || null,
      icp_profile_id: activeIcp?.id || null,
      icp_profile_name: activeIcp?.name || null,
      checkup: await buildCheckup(req.user),
    },
  });
});

router.get('/checkup', async (req, res) => {
  return res.json({ data: await buildCheckup(req.user) });
});

export default router;





