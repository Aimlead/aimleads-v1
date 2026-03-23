import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getRuntimeConfig } from '../lib/config.js';
import { requireAuth, wrapAsyncRoutes } from '../lib/middleware.js';
import { dataStore, getDataStoreRuntime } from '../lib/dataStore.js';
import { sanitizeWebsite } from '../lib/utils.js';
import { bootstrapWorkspaceDemoData } from '../services/bootstrap.js';
import { analyzeLead } from '../services/analyzeService.js';

const router = express.Router();
wrapAsyncRoutes(router);

const SOURCE_TAG = 'given_to_sales_onboarding_2024_09_11';
const MANTRA_ICP_NAME = 'Mantra ICP - Local Validation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const MANTRA_FILE = path.resolve(ROOT, 'tmp_real_leads.json');

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

const MANTRA_ICP = {
  name: MANTRA_ICP_NAME,
  description:
    'Validation profile for Mantra: 50-5000 users, tech decision-makers, all sectors except excluded industries.',
  weights: {
    industrie: {
      primaires: [
        'Software Development',
        'IT Services and IT Consulting',
        'Computer and Network Security',
        'Information Technology',
        'Cybersecurity',
      ],
      secondaires: ['Internet Publishing', 'Telecommunications', 'Computer Networking'],
      exclusions: [
        'Hospital',
        'Hospitals and Health Care',
        'Health, Wellness and Fitness',
        'Education',
        'Higher Education',
        'Primary and Secondary Education',
        'Public Administration',
        'Government Administration',
        'Administration publique',
        'Hopital',
      ],
      scores: { parfait: 15, partiel: 6, aucun: 0, exclu: -100 },
    },
    roles: {
      exacts: [
        'cto',
        'cio',
        'ciso',
        'chief technology',
        'chief information',
        'chief digital',
        'vp it',
        'head of it',
        'it director',
        'dsi',
        'directeur informatique',
        'responsable informatique',
        'responsable infrastructures',
        'directeur des systemes',
        'responsable systemes',
        'responsable des systemes',
        'responsable de la securite',
        'rssi',
        'it security director',
        'infrastructure manager',
        'system administrator',
        'administrateur systeme',
      ],
      proches: [
        'it manager',
        'infra manager',
        'operations manager',
        'security manager',
        'directeur technique',
        'it project manager',
        'project manager it',
        'chef de projet it',
        'chef de projet informatique',
        'lead engineering manager',
        'architecte si',
        'it risk officer',
        'lead it',
        'architecte systeme',
      ],
      exclusions: ['intern', 'assistant', 'stagiaire', 'junior', 'alternant'],
      scores: { parfait: 40, partiel: 20, exclu: -100, aucun: -35 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: ['B2B2C'],
      scores: { parfait: 10, partiel: 4, aucun: 0 },
    },
    structure: {
      primaire: { min: 50, max: 5000 },
      secondaire: { min: 30, max: 10000 },
      scores: { parfait: 30, partiel: 15, aucun: -35 },
    },
    geo: {
      primaire: [],
      secondaire: [],
      scores: { parfait: 0, partiel: 0, aucun: 0 },
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

const normalizeText = (value) => String(value || '').trim().toLowerCase();

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

const toLeadPayload = (row) => ({
  company_name: String(row.company_name || row['company name'] || row.name || '').trim(),
  website_url: sanitizeWebsite(row.website_url || row.website || row.url || ''),
  industry: String(row.industry || '').trim(),
  company_size: Number.isFinite(Number(row.company_size)) ? Number(row.company_size) : null,
  country: String(row.country || '').trim(),
  contact_name: String(row.contact_name || row.contact || '').trim(),
  contact_role: String(row.contact_role || row.role || row.title || '').trim(),
  contact_email: String(row.contact_email || row.email || '').trim(),
  source_list: SOURCE_TAG,
});

const toLeadAnalysisUpdatePayload = (result) => ({
  status: result.final_status || result.status,
  icp_score: result.icp_score,
  icp_raw_score: result.icp_raw_score,
  icp_category: result.category,
  icp_priority: result.priority,
  recommended_action: result.recommended_action,
  icp_profile_id: result.icp_profile_id,
  icp_profile_name: result.icp_profile_name,
  analysis_version: result.analysis_version,
  ai_score: result.ai_score,
  ai_confidence: result.ai_confidence,
  ai_signals: result.ai_signals,
  ai_summary: result.ai_summary,
  scoring_weights: result.scoring_weights,
  final_score: result.final_score,
  final_category: result.final_category,
  final_priority: result.final_priority,
  final_recommended_action: result.final_recommended_action,
  final_status: result.final_status,
  signals: result.signals,
  score_details: result.score_details,
  analysis_summary: result.analysis_summary,
  generated_icebreakers: result.generated_icebreakers,
  generated_icebreaker: result.generated_icebreakers?.email,
  last_analyzed_at: new Date().toISOString(),
});

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

const ensureMantraIcp = async (user) => {
  const profiles = await dataStore.listIcpProfiles(user);
  const existing = (profiles || []).find((profile) => normalizeText(profile.name) === normalizeText(MANTRA_ICP_NAME));

  const payload = existing
    ? {
        ...MANTRA_ICP,
        id: existing.id,
        owner_user_id: user.id,
      }
    : {
        ...MANTRA_ICP,
        owner_user_id: user.id,
      };

  return dataStore.saveActiveIcpProfile(user, payload);
};

const buildCheckup = async (user) => {
  const profiles = await dataStore.listIcpProfiles(user);
  const activeProfile = (profiles || []).find((profile) => profile.is_active) || profiles?.[0] || null;

  const leads = await dataStore.listLeads(user, '-created_date');
  const mantraLeads = (leads || []).filter((lead) => normalizeText(lead.source_list) === SOURCE_TAG);
  const mantraAnalyzed = mantraLeads.filter((lead) => Boolean(lead.last_analyzed_at));

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
  if (mantraLeads.length > 0 && normalizeText(activeProfile?.name) !== normalizeText(MANTRA_ICP_NAME)) {
    warnings.push('Active ICP is not Mantra ICP. Scores may look inconsistent for Mantra dataset.');
  }
  if (mantraLeads.length > 0 && mantraAnalyzed.length < mantraLeads.length) {
    warnings.push('Some Mantra leads are not analyzed yet.');
  }
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
          is_mantra: normalizeText(activeProfile.name) === normalizeText(MANTRA_ICP_NAME),
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
      mantra_tagged_total: mantraLeads.length,
      mantra_analyzed_total: mantraAnalyzed.length,
    },
    averages: {
      workspace_final_score_avg: avg(leads, 'final_score'),
      mantra_icp_score_avg: avg(mantraLeads, 'icp_score'),
      mantra_ai_score_avg: avg(mantraLeads, 'ai_score'),
      mantra_final_score_avg: avg(mantraLeads, 'final_score'),
    },
    profile_usage_on_mantra: countBy(mantraLeads, (lead) => lead.icp_profile_name),
    status_distribution_on_mantra: countBy(mantraLeads, (lead) => lead.status),
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

router.post('/load-mantra', async (req, res) => {
  let rows = [];

  try {
    const raw = await fs.readFile(MANTRA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return res.status(404).json({ message: 'Mantra dataset file not found (tmp_real_leads.json).' });
  }

  const cleanInput = rows.map(toLeadPayload).filter((lead) => Boolean(lead.company_name));

  const existingLeads = await dataStore.listLeads(req.user, '-created_date');
  const existingKeys = new Set((existingLeads || []).map(leadKey));

  const toImport = [];
  for (const row of cleanInput) {
    const key = leadKey(row);
    if (!existingKeys.has(key)) {
      toImport.push({
        ...row,
        created_date: new Date().toISOString(),
        status: 'To Analyze',
        follow_up_status: 'To Contact',
      });
      existingKeys.add(key);
    }
  }

  if (toImport.length > 0) {
    await dataStore.createLeadsBulk(req.user, toImport);
  }

  const mantraIcp = await ensureMantraIcp(req.user);

  const allLeads = await dataStore.listLeads(req.user, '-created_date');
  const mantraLeads = (allLeads || []).filter((lead) => normalizeText(lead.source_list) === SOURCE_TAG);

  let analyzed = 0;
  for (const lead of mantraLeads) {
    const result = analyzeLead({ lead, icpProfile: mantraIcp });
    await dataStore.updateLead(req.user, lead.id, toLeadAnalysisUpdatePayload(result));
    analyzed += 1;
  }

  return res.json({
    data: {
      imported: toImport.length,
      analyzed,
      total_input: cleanInput.length,
      total_tagged: mantraLeads.length,
      source_tag: SOURCE_TAG,
      icp_profile_id: mantraIcp?.id || null,
      icp_profile_name: mantraIcp?.name || null,
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
    const result = analyzeLead({ lead, icpProfile: activeIcp });
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






