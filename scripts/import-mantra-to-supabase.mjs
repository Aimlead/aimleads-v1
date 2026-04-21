import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const LOCAL_DB_PATH = path.resolve(ROOT, 'server/data/db.json');

const SOURCE_TAG = 'given_to_sales_onboarding_2024_09_11';
const TARGET_ICP_NAME = 'ICP DSI RSSI - Liste sécurité IT';

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

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const generateId = (prefix) => `${prefix}_${crypto.randomUUID()}`;

const buildClientConfig = (env = process.env) => {
  const dbUrl = String(env.SUPABASE_DB_URL || '').trim();
  if (dbUrl) {
    const match = dbUrl.match(/^postgres(?:ql)?:\/\/(?<user>[^:]+):(?<pass>.+)@(?<host>[^:]+):(?<port>\d+)\/(?<db>[^\s]+)$/);
    if (!match?.groups) {
      throw new Error('Could not parse SUPABASE_DB_URL for import.');
    }

    return {
      host: match.groups.host,
      port: Number(match.groups.port),
      database: match.groups.db,
      user: match.groups.user,
      password: match.groups.pass,
      ssl: { rejectUnauthorized: false },
    };
  }

  const password = String(env.SUPABASE_DB_PASSWORD || '').trim();
  if (!password) {
    throw new Error('SUPABASE_DB_URL or SUPABASE_DB_PASSWORD is required for import.');
  }

  return {
    host: String(env.SUPABASE_DB_HOST || '').trim(),
    port: Number(env.SUPABASE_DB_PORT || 5432),
    database: String(env.SUPABASE_DB_NAME || 'postgres').trim(),
    user: String(env.SUPABASE_DB_USER || 'postgres').trim(),
    password,
    ssl: { rejectUnauthorized: false },
  };
};

const loadLocalTargetList = async () => {
  const raw = JSON.parse(await fs.readFile(LOCAL_DB_PATH, 'utf8'));
  const icp = (raw.icpProfiles || []).find((profile) => normalizeText(profile?.name) === normalizeText(TARGET_ICP_NAME));
  if (!icp) {
    throw new Error(`Could not find "${TARGET_ICP_NAME}" in local db.json.`);
  }

  const leads = (raw.leads || []).filter((lead) => normalizeText(lead?.source_list) === normalizeText(SOURCE_TAG));
  if (leads.length === 0) {
    throw new Error(`Could not find local leads for source list "${SOURCE_TAG}".`);
  }

  return { icp, leads };
};

const toIntentSignals = (lead) => {
  const preCall = [];
  const negative = [];

  for (const signal of Array.isArray(lead?.signals) ? lead.signals : []) {
    const label = String(signal?.label || signal?.content || '').trim();
    if (!label) continue;
    if (/^no verified intent signals yet/i.test(label)) continue;
    if (/^no internet evidence linked yet/i.test(label)) continue;
    if (String(signal?.type || '').toLowerCase() === 'negative') {
      negative.push(label);
    } else {
      preCall.push(label);
    }
  }

  const result = {};
  if (preCall.length > 0) result.pre_call = [...new Set(preCall)];
  if (negative.length > 0) result.negative = [...new Set(negative)];
  return Object.keys(result).length > 0 ? result : null;
};

const toInternetSignals = (lead) =>
  Array.isArray(lead?.internet_signals)
    ? lead.internet_signals
    : [];

const sanitizeLeadForLiveSchema = (lead, workspaceId, icpProfileId) => ({
  id: generateId('lead'),
  workspace_id: workspaceId,
  created_at: lead.created_date || lead.created_at || new Date().toISOString(),
  updated_at: new Date().toISOString(),
  company_name: lead.company_name || null,
  website_url: lead.website_url || null,
  industry: lead.industry || null,
  company_size: Number.isFinite(Number(lead.company_size)) ? Number(lead.company_size) : null,
  country: lead.country || null,
  contact_name: lead.contact_name || null,
  contact_role: lead.contact_role || null,
  contact_email: lead.contact_email || null,
  source_list: lead.source_list || SOURCE_TAG,
  status: lead.status || null,
  follow_up_status: lead.follow_up_status || null,
  notes: lead.notes || null,
  analysis_summary: lead.analysis_summary || null,
  generated_icebreakers: lead.generated_icebreakers || null,
  score_details: lead.score_details || null,
  icp_profile_id: icpProfileId,
  analysis_version: lead.analysis_version || null,
  last_analyzed_at: lead.last_analyzed_at || null,
  ai_score: Number.isFinite(Number(lead.ai_score)) ? Number(lead.ai_score) : null,
  ai_confidence: Number.isFinite(Number(lead.ai_confidence)) ? Number(lead.ai_confidence) : null,
  final_score: Number.isFinite(Number(lead.final_score)) ? Number(lead.final_score) : null,
  final_category: lead.final_category || null,
  final_priority: Number.isFinite(Number(lead.final_priority)) ? Number(lead.final_priority) : null,
  final_recommended_action: lead.final_recommended_action || null,
  internet_signals: toInternetSignals(lead),
  auto_signal_metadata: {
    imported_from: 'local_db_security_it',
    original_local_lead_id: lead.id,
    original_icp_score: lead.icp_score ?? null,
    original_icp_raw_score: lead.icp_raw_score ?? null,
    original_recommended_action: lead.recommended_action ?? null,
  },
  intent_signals: toIntentSignals(lead),
});

const buildWorkspaceTargets = async (client, ownerEmails) => {
  const normalizedEmails = ownerEmails.map(normalizeText).filter(Boolean);
  if (normalizedEmails.length === 0) {
    throw new Error('Provide at least one --emails target.');
  }

  const res = await client.query(
    `
      select u.id as app_user_id, u.email, u.full_name, wm.workspace_id, wm.role, w.name as workspace_name
      from public.users u
      join public.workspace_members wm on wm.app_user_id = u.id
      join public.workspaces w on w.id = wm.workspace_id
      where lower(u.email) = any($1::text[])
        and wm.role = 'owner'
      order by u.email
    `,
    [normalizedEmails]
  );

  return res.rows;
};

const parseEmailsArg = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const upsertIcpProfile = async (client, target, localIcp) => {
  await client.query('update public.icp_profiles set is_active = false where workspace_id = $1', [target.workspace_id]);

  const existing = await client.query(
    'select id from public.icp_profiles where workspace_id = $1 and lower(name) = lower($2) limit 1',
    [target.workspace_id, localIcp.name]
  );

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `
        update public.icp_profiles
        set owner_user_id = $2,
            name = $3,
            description = $4,
            is_active = true,
            weights = $5::jsonb,
            updated_at = now()
        where id = $1
      `,
      [id, target.app_user_id, localIcp.name, localIcp.description || '', JSON.stringify(localIcp.weights || {})]
    );
    return id;
  }

  const id = generateId('icp');
  await client.query(
    `
      insert into public.icp_profiles (
        id, workspace_id, owner_user_id, name, description, is_active, weights, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, true, $6::jsonb, now(), now()
      )
    `,
    [id, target.workspace_id, target.app_user_id, localIcp.name, localIcp.description || '', JSON.stringify(localIcp.weights || {})]
  );
  return id;
};

const replaceWorkspaceLeads = async (client, target, localLeads, icpProfileId) => {
  await client.query(
    'delete from public.leads where workspace_id = $1 and source_list = $2',
    [target.workspace_id, SOURCE_TAG]
  );

  for (const lead of localLeads) {
    const payload = sanitizeLeadForLiveSchema(lead, target.workspace_id, icpProfileId);
    await client.query(
      `
        insert into public.leads (
          id, workspace_id, created_at, updated_at,
          company_name, website_url, industry, company_size, country,
          contact_name, contact_role, contact_email, source_list,
          status, follow_up_status, notes, analysis_summary, generated_icebreakers,
          score_details, icp_profile_id, analysis_version, last_analyzed_at,
          ai_score, ai_confidence, final_score, final_category, final_priority,
          final_recommended_action, internet_signals, auto_signal_metadata, intent_signals
        ) values (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17, $18::jsonb,
          $19::jsonb, $20, $21, $22,
          $23, $24, $25, $26, $27,
          $28, $29::jsonb, $30::jsonb, $31::jsonb
        )
      `,
      [
        payload.id,
        payload.workspace_id,
        payload.created_at,
        payload.updated_at,
        payload.company_name,
        payload.website_url,
        payload.industry,
        payload.company_size,
        payload.country,
        payload.contact_name,
        payload.contact_role,
        payload.contact_email,
        payload.source_list,
        payload.status,
        payload.follow_up_status,
        payload.notes,
        payload.analysis_summary,
        JSON.stringify(payload.generated_icebreakers || {}),
        JSON.stringify(payload.score_details || {}),
        payload.icp_profile_id,
        payload.analysis_version,
        payload.last_analyzed_at,
        payload.ai_score,
        payload.ai_confidence,
        payload.final_score,
        payload.final_category,
        payload.final_priority,
        payload.final_recommended_action,
        JSON.stringify(payload.internet_signals || []),
        JSON.stringify(payload.auto_signal_metadata || {}),
        JSON.stringify(payload.intent_signals || {}),
      ]
    );
  }
};

const verifyWorkspaceState = async (client, target) => {
  const counts = await client.query(
    `
      select
        (select count(*)::int from public.leads where workspace_id = $1 and source_list = $2 and deleted_at is null) as lead_count,
        (select count(*)::int from public.icp_profiles where workspace_id = $1) as icp_count,
        (select max(name) from public.icp_profiles where workspace_id = $1 and is_active = true) as active_icp_name
    `,
    [target.workspace_id, SOURCE_TAG]
  );

  return counts.rows[0];
};

const run = async () => {
  const emails = parseEmailsArg(args.emails);
  if (emails.length === 0) {
    throw new Error('Explicit --emails is required for live import, for example: --emails marketmenow75@gmail.com');
  }

  if (args.confirm !== 'yes') {
    throw new Error('Live import requires --confirm yes.');
  }

  const client = new Client(buildClientConfig(process.env));
  const { icp, leads } = await loadLocalTargetList();

  await client.connect();
  try {
    const targets = await buildWorkspaceTargets(client, emails);
    if (targets.length === 0) {
      throw new Error(`No owner workspaces found for emails: ${emails.join(', ')}`);
    }

    const results = [];

    for (const target of targets) {
      await client.query('begin');
      try {
        const icpProfileId = await upsertIcpProfile(client, target, icp);
        await replaceWorkspaceLeads(client, target, leads, icpProfileId);
        const verification = await verifyWorkspaceState(client, target);
        await client.query('commit');

        results.push({
          email: target.email,
          workspace_id: target.workspace_id,
          workspace_name: target.workspace_name,
          imported_leads: Number(verification.lead_count || 0),
          icp_count: Number(verification.icp_count || 0),
          active_icp_name: verification.active_icp_name || null,
        });
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log(JSON.stringify({
      source_tag: SOURCE_TAG,
      target_emails: emails,
      imported_from: LOCAL_DB_PATH,
      security_it_leads: leads.length,
      results,
    }, null, 2));
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
