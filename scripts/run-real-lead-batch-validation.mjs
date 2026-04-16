import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { toLeadAnalysisUpdatePayload } from '../server/services/leadAnalysisPersistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_INPUT_FILE = path.resolve(ROOT, 'tmp_real_leads.json');
const REPORT_DIR = path.resolve(ROOT, 'reports');
const API_PORT = Number(process.env.VALIDATION_API_PORT || 3013);
const API_BASE = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}/api`;
const DEMO_EMAIL = process.env.LOCAL_DEMO_EMAIL || 'demo@aimleads.local';
const DEMO_PASSWORD = process.env.LOCAL_DEMO_PASSWORD || 'demo1234';
const USE_DEMO_AUTH = ['1', 'true', 'yes', 'on'].includes(String(process.env.VALIDATION_USE_DEMO || '').trim().toLowerCase());

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const timestamp = () =>
  new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z').replace('T', '_');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const INPUT_FILE = path.resolve(ROOT, String(args.input || DEFAULT_INPUT_FILE));
const BATCH_LIMIT = Math.max(1, Math.min(15, Number(args.limit || 15)));
const BATCH_SOURCE_TAG = String(args.sourceTag || `real_lead_batch_${timestamp()}`);
const ICP_ID = String(args.icpId || '').trim();
const ICP_NAME = String(args.icpName || '').trim();
const ICP_FILE = String(args.icpFile || '').trim()
  ? path.resolve(ROOT, String(args.icpFile || '').trim())
  : '';

const DEFAULT_VALIDATION_ICP = {
  name: 'Validation ICP - B2B SaaS Growth',
  description: 'Fallback ICP created automatically for real lead batch validation.',
  weights: {
    industrie: {
      primaires: ['Software Development', 'SaaS', 'Sales Technology', 'Marketing Technology', 'B2B SaaS'],
      secondaires: ['Information Technology', 'Computer Software', 'Enterprise Software', 'FinTech', 'HRTech'],
      exclusions: ['Staffing and Recruiting', 'Consumer Services', 'Government Administration'],
      weight: 100,
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exclusions: ['Intern', 'Assistant', 'Coordinator'],
      exacts: ['CRO', 'VP Sales', 'VP Revenue Operations', 'Director of Sales Operations'],
      proches: ['Head of Sales', 'Revenue Operations', 'Sales Operations', 'VP Growth'],
      weight: 100,
      scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: ['B2B2C'],
      weight: 100,
      scores: { parfait: 25, partiel: 10, aucun: -40 },
    },
    structure: {
      primaire: { min: 50, max: 500 },
      secondaire: { min: 30, max: 1000 },
      weight: 100,
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: ['France', 'United Kingdom', 'Germany', 'Netherlands', 'United States'],
      secondaire: ['Europe', 'Canada', 'Ireland', 'Spain'],
      weight: 100,
      scores: { parfait: 15, partiel: 5, aucun: -10 },
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

const escapeCsv = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const toCsv = (rows, headers) => {
  const headerLine = headers.map(escapeCsv).join(',');
  const lines = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','));
  return [headerLine, ...lines].join('\n');
};

const mean = (values) => {
  const nums = values.map(toNumber).filter((value) => value !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const normalizeLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readScoreDetails = (lead) =>
  lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};

const sumScoreDetailPoints = (details) =>
  Object.values(details).reduce((sum, entry) => {
    const points = toNumber(entry?.points);
    return points === null ? sum : sum + points;
  }, 0);

const getBaseIcpScore = (lead) => {
  const direct = toNumber(lead?.icp_score);
  if (direct !== null) return direct;

  const raw = toNumber(lead?.icp_raw_score);
  if (raw !== null) return raw;

  const scoreDetails = readScoreDetails(lead);
  return Object.keys(scoreDetails).length > 0 ? sumScoreDetailPoints(scoreDetails) : null;
};

const classifyInternetSignal = (signal) => {
  const key = normalizeText(signal?.key);
  if (['bankruptcy', 'closed', 'shutdown', 'layoff', 'churn'].some((token) => key.includes(token))) {
    return 'negative';
  }
  if (['missing', 'unknown'].some((token) => key.includes(token))) {
    return 'neutral';
  }
  return 'positive';
};

const signalsFromIntentSignals = (lead) => {
  const payload =
    lead?.intent_signals && typeof lead.intent_signals === 'object'
      ? lead.intent_signals
      : {};

  const groups = [
    { key: 'pre_call', type: 'positive' },
    { key: 'post_contact', type: 'positive' },
    { key: 'negative', type: 'negative' },
  ];

  return groups.flatMap(({ key, type }) =>
    (Array.isArray(payload[key]) ? payload[key] : []).map((label) => ({
      type,
      label: normalizeLabel(label),
      source: 'intent',
      evidence: key,
    }))
  );
};

const signalsFromInternetSignals = (lead) =>
  (Array.isArray(lead?.internet_signals) ? lead.internet_signals : []).map((signal) => ({
    type: classifyInternetSignal(signal),
    label: normalizeLabel(signal?.label || signal?.key || signal?.evidence),
    source: signal?.source_type || 'internet',
    evidence: signal?.evidence || signal?.key,
  }));

const getLeadSignals = (lead) => {
  const legacySignals = Array.isArray(lead?.signals) ? lead.signals : [];
  if (legacySignals.length > 0) return legacySignals;
  return [...signalsFromIntentSignals(lead), ...signalsFromInternetSignals(lead)];
};

const loadJsonFile = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const countBy = (items, getKey) => {
  const counts = {};
  for (const item of items) {
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

const normalizeBucket = (value) => {
  const bucket = normalizeText(value);
  if (bucket === 'strong' || bucket === 'medium' || bucket === 'low') return bucket;
  return '';
};

const currentCookies = {};

const updateCookiesFromResponse = (response) => {
  const multiple = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const headerValues = multiple.length > 0
    ? multiple
    : (() => {
        const single = response.headers.get('set-cookie');
        return single ? single.split(/,(?=[^;]+=[^;]+)/g) : [];
      })();

  for (const raw of headerValues) {
    const [pair] = String(raw || '').split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name) continue;
    currentCookies[name] = value;
  }
};

const getCookieHeader = () =>
  Object.entries(currentCookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const requestJson = async (pathname, { method = 'GET', body } = {}) => {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const cookieHeader = getCookieHeader();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) {
    const csrfToken = currentCookies.aimleads_csrf;
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE}${pathname}`, {
    method: normalizedMethod,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  updateCookiesFromResponse(response);

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload?.data ?? payload?.user ?? payload;
};

const isApiHealthy = async () => {
  try {
    await requestJson('/health');
    return true;
  } catch {
    return false;
  }
};

const waitForApi = async (timeoutMs = 30_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isApiHealthy()) return;
    await sleep(500);
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms (${API_BASE})`);
};

const startApiIfNeeded = async () => {
  if (process.env.API_BASE_URL) {
    if (await isApiHealthy()) return { child: null, managed: false };
    throw new Error(`Cannot reach API_BASE_URL: ${API_BASE}`);
  }

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      API_PORT: String(API_PORT),
      SESSION_SECRET: process.env.SESSION_SECRET || 'validation-runner-dev-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[api-err] ${chunk}`));

  await waitForApi(35_000);
  return { child, managed: true };
};

const stopApi = async (child) => {
  if (!child) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(4_000),
  ]);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
};

const authenticate = async () => {
  if (USE_DEMO_AUTH) {
    await requestJson('/auth/login', {
      method: 'POST',
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    return { mode: 'login_demo', email: DEMO_EMAIL };
  }

  const email = `validation.${Date.now()}@aimleads.local`;
  await requestJson('/auth/register', {
    method: 'POST',
    body: {
      email,
      password: 'Validation1234',
      full_name: 'Validation Runner',
    },
  });
  return { mode: 'register_fresh', email };
};

const cleanLeadInput = (row) => ({
  company_name: String(row.company_name || row['company name'] || row.name || '').trim(),
  website_url: String(row.website_url || row.website || row.url || '').replace(/^https?:\/\//, '').trim(),
  industry: String(row.industry || '').trim(),
  company_size: Number.isFinite(Number(row.company_size)) ? Number(row.company_size) : null,
  country: String(row.country || '').trim(),
  contact_name: String(row.contact_name || row.contact || '').trim(),
  contact_role: String(row.contact_role || row.role || row.title || '').trim(),
  contact_email: String(row.contact_email || row.email || '').trim(),
  source_list: BATCH_SOURCE_TAG,
});

const normalizeLeadInputRow = (row, index) => ({
  lead: cleanLeadInput(row),
  metadata: {
    bucket: normalizeBucket(row.bucket),
    source_reference: String(row.source_reference || '').trim(),
    previous_icp_category: String(row.previous_icp_category || '').trim(),
    previous_final_category: String(row.previous_final_category || '').trim(),
    previous_final_score: toNumber(row.previous_final_score),
    notes: String(row.notes || '').trim(),
    original_index: index,
  },
});

const selectBalancedBatch = (entries, limit) => {
  if (entries.length <= limit) return entries;

  const bucketOrder = ['strong', 'medium', 'low'];
  const bucketed = new Map(bucketOrder.map((bucket) => [bucket, []]));
  const unbucketed = [];

  for (const entry of entries) {
    if (entry.metadata.bucket && bucketed.has(entry.metadata.bucket)) {
      bucketed.get(entry.metadata.bucket).push(entry);
      continue;
    }
    unbucketed.push(entry);
  }

  const withKnownBuckets = bucketOrder.reduce((count, bucket) => count + bucketed.get(bucket).length, 0);
  if (withKnownBuckets === 0) {
    return entries.slice(0, limit);
  }

  const targetPerBucket = Math.floor(limit / bucketOrder.length);
  const picked = [];
  const usedKeys = new Set();

  const pushEntry = (entry) => {
    const key = leadKey(entry.lead);
    if (usedKeys.has(key)) return;
    picked.push(entry);
    usedKeys.add(key);
  };

  for (const bucket of bucketOrder) {
    for (const entry of bucketed.get(bucket).slice(0, targetPerBucket)) {
      if (picked.length >= limit) break;
      pushEntry(entry);
    }
  }

  if (picked.length < limit) {
    const remainder = [...bucketOrder.flatMap((bucket) => bucketed.get(bucket).slice(targetPerBucket)), ...unbucketed];
    for (const entry of remainder) {
      if (picked.length >= limit) break;
      pushEntry(entry);
    }
  }

  return picked.slice(0, limit);
};

const normalizeIcpPayload = (payload) => ({
  name: String(payload?.name || '').trim(),
  description: String(payload?.description || '').trim(),
  weights: payload?.weights || {},
});

const resolveActiveIcp = async () => {
  const listProfiles = async () => {
    const payload = await requestJson('/icp');
    return Array.isArray(payload) ? payload : [];
  };

  if (ICP_FILE) {
    const icpFromFile = normalizeIcpPayload(await loadJsonFile(ICP_FILE));
    if (!icpFromFile.name || !icpFromFile.weights || typeof icpFromFile.weights !== 'object') {
      throw new Error(`ICP file must provide at least name and weights: ${ICP_FILE}`);
    }

    const profiles = await listProfiles();
    const existing =
      (profiles || []).find((entry) => normalizeText(entry?.name) === normalizeText(icpFromFile.name)) || null;

    if (existing) {
      return {
        ...existing,
        resolution_mode: 'explicit_file_existing',
        source_file: ICP_FILE,
      };
    }

    const created = await requestJson('/icp', {
      method: 'POST',
      body: icpFromFile,
    });

    return {
      ...created,
      resolution_mode: 'explicit_file_created',
      source_file: ICP_FILE,
    };
  }

  if (ICP_ID) {
    const profiles = await listProfiles();
    const profile = (profiles || []).find((entry) => String(entry?.id || '').trim() === ICP_ID);
    if (!profile) {
      throw new Error(`No ICP found for id ${ICP_ID}`);
    }
    return { ...profile, resolution_mode: 'explicit_id' };
  }

  if (ICP_NAME) {
    const profiles = await listProfiles();
    const profile =
      (profiles || []).find((entry) => normalizeText(entry?.name) === normalizeText(ICP_NAME)) || null;
    if (!profile) {
      throw new Error(`No ICP found for name "${ICP_NAME}"`);
    }
    return { ...profile, resolution_mode: 'explicit_name' };
  }

  const active = await requestJson('/icp/active');
  if (!active?.id) {
    const profiles = await listProfiles();
    if (profiles[0]?.id) {
      return { ...profiles[0], resolution_mode: 'first_existing_profile' };
    }

    const created = await requestJson('/icp', {
      method: 'POST',
      body: DEFAULT_VALIDATION_ICP,
    });

    return { ...created, resolution_mode: 'created_fallback_profile' };
  }
  return { ...active, resolution_mode: 'active_profile' };
};

const getTopSignalLabels = (lead) =>
  getLeadSignals(lead)
    .map((signal) => String(signal?.label || signal?.content || '').trim())
    .filter(Boolean)
    .filter((label) => !/^signal:/i.test(label))
    .filter((label) => !/^pending-enrichment$/i.test(label))
    .filter((label) => !/^add-web-signals$/i.test(label))
    .filter((label) => !/^No verified intent signals yet/i.test(label))
    .filter((label) => !/^No internet evidence linked yet/i.test(label))
    .filter((label) => !/^No AI signals detected$/i.test(label))
    .filter((label) => !/^No AI signal data yet$/i.test(label))
    .filter((label) => !/^No signals yet$/i.test(label))
    .filter((label) => label.length > 2)
    .filter((label, index, array) => array.findIndex((item) => normalizeText(item) === normalizeText(label)) === index)
    .slice(0, 2);

const makeScorecardRow = (lead, metadata = {}) => {
  const [topSignal1 = '', topSignal2 = ''] = getTopSignalLabels(lead);
  const baseScore = getBaseIcpScore(lead);
  const finalScore = toNumber(lead.final_score);
  const aiBoost = baseScore !== null && finalScore !== null ? finalScore - baseScore : '';

  return {
    lead_id: lead.id || '',
    bucket: metadata.bucket || '',
    company_name: lead.company_name || '',
    contact_role: lead.contact_role || '',
    source_reference: metadata.source_reference || '',
    previous_final_category: metadata.previous_final_category || '',
    previous_final_score: metadata.previous_final_score ?? '',
    base_icp_score: baseScore ?? '',
    ai_boost: aiBoost,
    final_score: finalScore ?? '',
    final_category: lead.final_category || '',
    suggested_action: lead.final_recommended_action || lead.recommended_action || '',
    top_signal_1: topSignal1,
    top_signal_2: topSignal2,
    score_direction_yes_no: '',
    sdr_would_use_yes_no: '',
    score_credibility_1_to_5: '',
    signal_usefulness_1_to_5: '',
    icebreaker_usefulness_1_to_5: '',
    overall_actionability_1_to_5: '',
    main_friction: '',
    what_felt_wrong_or_missing: '',
    notes: metadata.notes || '',
  };
};

const SCORECARD_HEADERS = [
  'lead_id',
  'bucket',
  'company_name',
  'contact_role',
  'source_reference',
  'previous_final_category',
  'previous_final_score',
  'base_icp_score',
  'ai_boost',
  'final_score',
  'final_category',
  'suggested_action',
  'top_signal_1',
  'top_signal_2',
  'score_direction_yes_no',
  'sdr_would_use_yes_no',
  'score_credibility_1_to_5',
  'signal_usefulness_1_to_5',
  'icebreaker_usefulness_1_to_5',
  'overall_actionability_1_to_5',
  'main_friction',
  'what_felt_wrong_or_missing',
  'notes',
];

const summarizeProxyReadiness = (leads) => {
  const analyzed = leads.length;
  const scored = leads.filter((lead) => toNumber(lead.final_score) !== null).length;
  const withSignals = leads.filter((lead) => getTopSignalLabels(lead).length > 0).length;
  const withIcebreaker = leads.filter((lead) => Boolean(
    lead.generated_icebreaker || lead.generated_icebreakers?.email
  )).length;

  const ratio = (value) => (analyzed > 0 ? Math.round((value / analyzed) * 1000) / 10 : 0);

  return {
    analyzed,
    scored,
    withSignals,
    withIcebreaker,
    scored_pct: ratio(scored),
    signals_pct: ratio(withSignals),
    icebreaker_pct: ratio(withIcebreaker),
  };
};

const run = async () => {
  const { child, managed } = await startApiIfNeeded();

  try {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    const auth = await authenticate();
    const activeIcp = await resolveActiveIcp();

    const rawInput = await loadJsonFile(INPUT_FILE);
    const normalizedEntries = rawInput
      .map(normalizeLeadInputRow)
      .filter((entry) => Boolean(entry.lead.company_name));
    const selectedEntries = selectBalancedBatch(normalizedEntries, BATCH_LIMIT);
    const cleanInput = selectedEntries.map((entry) => entry.lead);
    const metadataByKey = new Map(selectedEntries.map((entry) => [leadKey(entry.lead), entry.metadata]));

    if (cleanInput.length === 0) {
      throw new Error(`No valid leads found in ${INPUT_FILE}`);
    }

    const existingLeads = await requestJson('/leads');
    const existingKeys = new Set(
      (existingLeads || [])
        .filter((lead) => normalizeText(lead.source_list) === normalizeText(BATCH_SOURCE_TAG))
        .map(leadKey)
    );
    const rowsToImport = [];

    for (const row of cleanInput) {
      const key = leadKey(row);
      if (!existingKeys.has(key)) {
        rowsToImport.push(row);
        existingKeys.add(key);
      }
    }

    let importedLeads = [];
    if (rowsToImport.length > 0) {
      importedLeads = await requestJson('/leads/import', {
        method: 'POST',
        body: { rows: rowsToImport },
      });
    }

    const allLeads = await requestJson('/leads');
    const scopedLeads = (allLeads || []).filter((lead) => normalizeText(lead.source_list) === normalizeText(BATCH_SOURCE_TAG));
    const leadsToAnalyze = scopedLeads.length > 0
      ? scopedLeads
      : (Array.isArray(importedLeads) ? importedLeads : []).filter(
          (lead) => normalizeText(lead.source_list) === normalizeText(BATCH_SOURCE_TAG)
        );

    if (leadsToAnalyze.length === 0) {
      throw new Error(`Imported leads were not recoverable for source tag ${BATCH_SOURCE_TAG}`);
    }

    const errors = [];
    for (const lead of leadsToAnalyze) {
      try {
        const result = await requestJson('/analyze', {
          method: 'POST',
          body: {
            lead,
            icp_profile_id: activeIcp.id,
          },
        });

        await requestJson(`/leads/${lead.id}`, {
          method: 'PATCH',
          body: toLeadAnalysisUpdatePayload(result),
        });
      } catch (error) {
        errors.push({
          lead_id: lead.id,
          company_name: lead.company_name,
          message: error.message,
        });
      }
    }

    const analyzedIds = new Set(leadsToAnalyze.map((lead) => String(lead.id || '')));
    const finalLeads = ((await requestJson('/leads')) || [])
      .filter((lead) =>
        normalizeText(lead.source_list) === normalizeText(BATCH_SOURCE_TAG) ||
        analyzedIds.has(String(lead.id || ''))
      )
      .slice()
      .sort((left, right) => (toNumber(right.final_score) || 0) - (toNumber(left.final_score) || 0));

    const scorecardRows = finalLeads.map((lead) => makeScorecardRow(lead, metadataByKey.get(leadKey(lead)) || {}));
    const proxyReadiness = summarizeProxyReadiness(finalLeads);

    const reportPayload = {
      generated_at: new Date().toISOString(),
      auth_mode: auth.mode,
      auth_email: auth.email,
      api_base: API_BASE,
      input_file: INPUT_FILE,
      icp_file: ICP_FILE || null,
      source_tag: BATCH_SOURCE_TAG,
      batch_limit: BATCH_LIMIT,
      icp_profile: {
        id: activeIcp.id,
        name: activeIcp.name,
        resolution_mode: activeIcp.resolution_mode || 'unknown',
      },
      counts: {
        input_rows: rawInput.length,
        selected_rows: selectedEntries.length,
        clean_rows_used: cleanInput.length,
        imported_rows: rowsToImport.length,
        analyzed_rows: finalLeads.length,
        analyze_errors: errors.length,
      },
      averages: {
        icp_score_avg: mean(finalLeads.map((lead) => getBaseIcpScore(lead))),
        final_score_avg: mean(finalLeads.map((lead) => lead.final_score)),
      },
      distributions: {
        input_bucket: countBy(selectedEntries, (entry) => entry.metadata.bucket || 'unbucketed'),
        final_bucket: countBy(finalLeads, (lead) => metadataByKey.get(leadKey(lead))?.bucket || 'unbucketed'),
        final_category: countBy(finalLeads, (lead) => lead.final_category),
        final_recommended_action: countBy(finalLeads, (lead) => lead.final_recommended_action),
      },
      proxy_readiness: proxyReadiness,
      errors,
      top_leads: finalLeads.slice(0, 10).map((lead) => ({
        bucket: metadataByKey.get(leadKey(lead))?.bucket || '',
        company_name: lead.company_name,
        contact_role: lead.contact_role,
        icp_score: getBaseIcpScore(lead),
        final_score: lead.final_score,
        final_category: lead.final_category,
        final_recommended_action: lead.final_recommended_action,
        top_signals: getTopSignalLabels(lead),
        has_icebreaker: Boolean(lead.generated_icebreaker || lead.generated_icebreakers?.email),
      })),
    };

    const stamp = timestamp();
    const jsonPath = path.resolve(REPORT_DIR, `real-lead-batch-${stamp}.json`);
    const csvPath = path.resolve(REPORT_DIR, `real-lead-batch-scorecard-${stamp}.csv`);

    await fs.writeFile(jsonPath, JSON.stringify(reportPayload, null, 2), 'utf8');
    await fs.writeFile(csvPath, toCsv(scorecardRows, SCORECARD_HEADERS), 'utf8');

    console.log('\nReal lead batch validation completed.');
    console.log(`- Active ICP: ${activeIcp.name} (${activeIcp.id})`);
    console.log(`- Leads analyzed: ${finalLeads.length}`);
    console.log(`- Errors: ${errors.length}`);
    console.log(`- Proxy scored coverage: ${proxyReadiness.scored_pct}%`);
    console.log(`- Proxy signal coverage: ${proxyReadiness.signals_pct}%`);
    console.log(`- Proxy icebreaker coverage: ${proxyReadiness.icebreaker_pct}%`);
    console.log(`- JSON report: ${jsonPath}`);
    console.log(`- Scorecard CSV: ${csvPath}`);
  } finally {
    if (managed) {
      await stopApi(child);
    }
  }
};

run().catch((error) => {
  console.error('\nReal lead batch validation failed.');
  console.error(error);
  process.exitCode = 1;
});
