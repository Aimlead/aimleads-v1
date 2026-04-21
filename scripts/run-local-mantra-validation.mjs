import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const API_PORT = Number(process.env.VALIDATION_API_PORT || 3011);
const API_BASE = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}/api`;
const INPUT_FILE = path.resolve(ROOT, 'tmp_real_leads.json');
const REPORT_DIR = path.resolve(ROOT, 'reports');
const SOURCE_TAG = 'given_to_sales_onboarding_2024_09_11';

const DEMO_EMAIL = process.env.LOCAL_DEMO_EMAIL || 'demo@aimleads.local';
const DEMO_PASSWORD = process.env.LOCAL_DEMO_PASSWORD || 'demo1234';

const TARGET_ICP_NAME = 'ICP DSI RSSI - Liste securite IT';

const MANTRA_ICP = {
  name: TARGET_ICP_NAME,
  description:
    'Validation profile for DSI/RSSI: 50-5000 users, tech decision-makers, all sectors except excluded industries.',
  owner_user_id: DEMO_EMAIL,
  weights: {
    industrie: {
      primaires: [
        'Software Development',
        'IT Services and IT Consulting',
        'Computer and Network Security',
        'Information Technology',
        'Cybersecurity',
      ],
      secondaires: [
        'Internet Publishing',
        'Telecommunications',
        'Computer Networking',
      ],
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
        'Hôpital',
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
        'directeur des syst?mes',
        'responsable systemes',
        'responsable syst?mes',
        'responsable des systemes',
        'responsable des syst?mes',
        'responsable de la securite',
        'responsable de la s?curit?',
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
    },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeText = (value) => String(value || '').trim().toLowerCase();

const timestamp = () =>
  new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z').replace('T', '_');

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const mean = (values) => {
  const nums = values.map(toNumber).filter((value) => value !== null);
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
};

const countBy = (items, getKey) => {
  const counts = {};
  for (const item of items) {
    const key = getKey(item) || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
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

const leadKey = (lead) => {
  const company = normalizeText(lead.company_name);
  const website = normalizeText(lead.website_url);
  const email = normalizeText(lead.contact_email);
  const contact = normalizeText(lead.contact_name);
  return [company, website, email, contact].join('|');
};

const extractCookie = (response) => {
  const multiple = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (Array.isArray(multiple) && multiple.length > 0) {
    return multiple.map((entry) => entry.split(';')[0]).join('; ');
  }

  const single = response.headers.get('set-cookie');
  if (!single) return '';

  return single
    .split(/,(?=[^;]+=[^;]+)/g)
    .map((entry) => entry.split(';')[0])
    .join('; ');
};

async function requestJson(pathname, { method = 'GET', body, cookie = '' } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
    const message = payload?.message || `Request failed: ${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  const data = payload?.data ?? payload?.user ?? payload;
  return { response, payload, data };
}

async function isApiHealthy() {
  try {
    await requestJson('/health');
    return true;
  } catch {
    return false;
  }
}

async function waitForApi(timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isApiHealthy()) return;
    await sleep(500);
  }

  throw new Error(`API did not become healthy within ${timeoutMs}ms (${API_BASE})`);
}

async function startApiIfNeeded() {
  if (process.env.API_BASE_URL) {
    if (await isApiHealthy()) {
      console.log(`API already running on custom API_BASE_URL (${API_BASE}).`);
      return { child: null, managed: false };
    }

    throw new Error(`Cannot reach API_BASE_URL: ${API_BASE}`);
  }

  console.log(`Starting dedicated local API on port ${API_PORT}...`);
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(API_PORT), API_PORT: String(API_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[api-err] ${chunk}`));

  await waitForApi(35000);

  return { child, managed: true };
}

async function stopApi(child) {
  if (!child) return;

  child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(4000),
  ]);

  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

function buildIcpPayload(existingId) {
  if (!existingId) return { ...MANTRA_ICP };
  return { ...MANTRA_ICP, id: existingId };
}

async function authenticate() {
  try {
    const login = await requestJson('/auth/login', {
      method: 'POST',
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });

    const cookie = extractCookie(login.response);
    if (!cookie) throw new Error('Missing cookie after login');

    return { cookie, userEmail: DEMO_EMAIL, mode: 'login' };
  } catch (error) {
    if (error.status && error.status !== 401 && error.status !== 403) {
      throw error;
    }

    const generatedEmail = 'validation.' + Date.now() + '@aimleads.local';
    const generatedPassword = 'validation1234';

    const register = await requestJson('/auth/register', {
      method: 'POST',
      body: {
        email: generatedEmail,
        password: generatedPassword,
        full_name: 'Validation Runner',
      },
    });

    const cookie = extractCookie(register.response);
    if (!cookie) throw new Error('Missing cookie after register');

    return { cookie, userEmail: generatedEmail, mode: 'register' };
  }
}

function toLeadUpdatePayload(result) {
  return {
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
  };
}

function mapReportLead(lead) {
  return {
    id: lead.id,
    company_name: lead.company_name,
    contact_name: lead.contact_name,
    contact_role: lead.contact_role,
    contact_email: lead.contact_email,
    website_url: lead.website_url,
    industry: lead.industry,
    company_size: lead.company_size,
    country: lead.country,
    source_list: lead.source_list,
    icp_score: lead.icp_score,
    ai_score: lead.ai_score,
    final_score: lead.final_score,
    icp_category: lead.icp_category,
    final_category: lead.final_category,
    status: lead.status,
    recommended_action: lead.recommended_action,
    final_recommended_action: lead.final_recommended_action,
    scoring_weights: lead.scoring_weights,
  };
}

async function run() {
  const { child, managed } = await startApiIfNeeded();

  try {
    await fs.mkdir(REPORT_DIR, { recursive: true });

    const auth = await authenticate();
    const cookie = auth.cookie;

    console.log(`Authenticated with mode: ${auth.mode} (${auth.userEmail})`);

    const profilesRes = await requestJson('/icp', { cookie });
    const profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
    const existingTarget = profiles.find((profile) => profile.name === TARGET_ICP_NAME) || null;

    const savedProfileRes = await requestJson('/icp/active', {
      method: 'PUT',
      cookie,
      body: {
        ...buildIcpPayload(existingTarget?.id),
        owner_user_id: auth.userEmail,
      },
    });

    const activeProfile = savedProfileRes.data;
    console.log(`Active ICP profile: ${activeProfile?.name} (${activeProfile?.id})`);

    const rawInput = JSON.parse(await fs.readFile(INPUT_FILE, 'utf8'));
    const cleanInput = rawInput
      .filter((row) => String(row.company_name || '').trim())
      .map((row) => ({
        company_name: String(row.company_name || '').trim(),
        website_url: String(row.website_url || '').trim(),
        industry: String(row.industry || '').trim(),
        company_size: Number.isFinite(Number(row.company_size)) ? Number(row.company_size) : null,
        country: String(row.country || '').trim(),
        contact_name: String(row.contact_name || '').trim(),
        contact_role: String(row.contact_role || '').trim(),
        contact_email: String(row.contact_email || '').trim(),
        source_list: SOURCE_TAG,
      }));

    const allBeforeRes = await requestJson('/leads', { cookie });
    const allBefore = Array.isArray(allBeforeRes.data) ? allBeforeRes.data : [];
    const existingKeys = new Set(allBefore.map(leadKey));

    const rowsToImport = [];
    for (const row of cleanInput) {
      const key = leadKey(row);
      if (!existingKeys.has(key)) {
        rowsToImport.push(row);
        existingKeys.add(key);
      }
    }

    if (rowsToImport.length > 0) {
      await requestJson('/leads/import', {
        method: 'POST',
        cookie,
        body: { rows: rowsToImport },
      });
    }

    const allAfterImportRes = await requestJson('/leads', { cookie });
    const allAfterImport = Array.isArray(allAfterImportRes.data) ? allAfterImportRes.data : [];

    const taggedLeads = allAfterImport.filter(
      (lead) => normalizeText(lead.source_list) === SOURCE_TAG
    );

    const queue = [...taggedLeads];
    const errors = [];
    const concurrency = Math.min(8, Math.max(1, queue.length));

    const worker = async () => {
      while (queue.length > 0) {
        const lead = queue.shift();
        if (!lead) return;

        try {
          const analysisRes = await requestJson('/analyze', {
            method: 'POST',
            cookie,
            body: {
              lead,
              icp_profile_id: activeProfile.id,
            },
          });

          const result = analysisRes.data;

          await requestJson(`/leads/${lead.id}`, {
            method: 'PATCH',
            cookie,
            body: toLeadUpdatePayload(result),
          });
        } catch (error) {
          errors.push({
            lead_id: lead.id,
            company_name: lead.company_name,
            message: error.message,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const allAfterAnalyzeRes = await requestJson('/leads', { cookie });
    const allAfterAnalyze = Array.isArray(allAfterAnalyzeRes.data) ? allAfterAnalyzeRes.data : [];

    const finalTaggedLeads = allAfterAnalyze.filter(
      (lead) => normalizeText(lead.source_list) === SOURCE_TAG
    );

    const analyzedTaggedLeads = finalTaggedLeads.filter((lead) => lead.last_analyzed_at);

    const reportPayload = {
      generated_at: new Date().toISOString(),
      source: {
        input_file: INPUT_FILE,
        source_tag: SOURCE_TAG,
      },
      icp_profile: {
        id: activeProfile?.id,
        name: activeProfile?.name,
        description: activeProfile?.description,
      },
      counts: {
        input_rows: rawInput.length,
        clean_rows: cleanInput.length,
        imported_rows: rowsToImport.length,
        tagged_rows_total: finalTaggedLeads.length,
        tagged_rows_analyzed: analyzedTaggedLeads.length,
        analyze_errors: errors.length,
      },
      score_averages: {
        icp_score_avg: mean(analyzedTaggedLeads.map((lead) => lead.icp_score)),
        ai_score_avg: mean(analyzedTaggedLeads.map((lead) => lead.ai_score)),
        final_score_avg: mean(analyzedTaggedLeads.map((lead) => lead.final_score)),
      },
      distributions: {
        status: countBy(analyzedTaggedLeads, (lead) => lead.status),
        icp_category: countBy(analyzedTaggedLeads, (lead) => lead.icp_category),
        final_category: countBy(analyzedTaggedLeads, (lead) => lead.final_category),
      },
      top_25_by_final_score: [...analyzedTaggedLeads]
        .sort((a, b) => (toNumber(b.final_score) || 0) - (toNumber(a.final_score) || 0))
        .slice(0, 25)
        .map(mapReportLead),
      excluded_or_blocked_sample: analyzedTaggedLeads
        .filter(
          (lead) =>
            lead.final_category === 'Excluded' ||
            lead.score_details?.roles?.match === 'exclu' ||
            lead.score_details?.industrie?.match === 'exclu'
        )
        .slice(0, 30)
        .map(mapReportLead),
      errors,
    };

    const stamp = timestamp();
    const reportPath = path.resolve(REPORT_DIR, `local-validation-${stamp}.json`);
    const allCsvPath = path.resolve(REPORT_DIR, `local-validation-all-leads-${stamp}.csv`);
    const topCsvPath = path.resolve(REPORT_DIR, `local-validation-top-25-${stamp}.csv`);

    await fs.writeFile(reportPath, JSON.stringify(reportPayload, null, 2), 'utf8');

    const allRows = analyzedTaggedLeads
      .map((lead) => ({
        company_name: lead.company_name,
        contact_name: lead.contact_name,
        contact_role: lead.contact_role,
        contact_email: lead.contact_email,
        website_url: lead.website_url,
        industry: lead.industry,
        company_size: lead.company_size,
        country: lead.country,
        icp_score: lead.icp_score,
        ai_score: lead.ai_score,
        final_score: lead.final_score,
        icp_category: lead.icp_category,
        final_category: lead.final_category,
        status: lead.status,
        final_recommended_action: lead.final_recommended_action,
      }))
      .sort((a, b) => (toNumber(b.final_score) || 0) - (toNumber(a.final_score) || 0));

    const topRows = allRows.slice(0, 25);

    const csvHeaders = [
      'company_name',
      'contact_name',
      'contact_role',
      'contact_email',
      'website_url',
      'industry',
      'company_size',
      'country',
      'icp_score',
      'ai_score',
      'final_score',
      'icp_category',
      'final_category',
      'status',
      'final_recommended_action',
    ];

    await fs.writeFile(allCsvPath, toCsv(allRows, csvHeaders), 'utf8');
    await fs.writeFile(topCsvPath, toCsv(topRows, csvHeaders), 'utf8');

    console.log('\nValidation completed successfully.');
    console.log(`- Source rows (clean): ${cleanInput.length}`);
    console.log(`- Imported new rows: ${rowsToImport.length}`);
    console.log(`- Tagged rows analyzed: ${analyzedTaggedLeads.length}`);
    console.log(`- Analyze errors: ${errors.length}`);
    console.log(`- Report JSON: ${reportPath}`);
    console.log(`- All leads CSV: ${allCsvPath}`);
    console.log(`- Top 25 CSV: ${topCsvPath}`);
  } finally {
    if (managed) {
      await stopApi(child);
    }
  }
}

run().catch((error) => {
  console.error('\nLocal validation failed.');
  console.error(error);
  process.exitCode = 1;
});
