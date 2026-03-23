import { readDb, writeDb } from '../lib/db.js';
import { createId } from '../lib/utils.js';
import { hashPassword } from '../lib/auth.js';
import { isAuthProviderSupabase } from '../lib/config.js';
import { ensureAuthUserWithPassword } from '../lib/supabaseAuth.js';
import { ensureWorkspaceUserForAuth } from '../lib/workspaceUser.js';

const DEFAULT_EMAIL = 'demo@aimleads.local';
const DEFAULT_PASSWORD = 'demo1234';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const demoIcpProfilePayload = {
  name: 'SaaS Outbound ICP',
  description: 'Default ICP profile for local development and demo validation.',
  weights: {
    industrie: {
      primaires: ['SaaS', 'Software'],
      secondaires: ['MarTech', 'FinTech', 'E-commerce'],
      exclusions: ['Hospital', 'Education', 'Public Administration'],
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exacts: ['CTO', 'CIO', 'Head of IT', 'IT Director', 'VP IT', 'CISO'],
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

const createDemoLeads = () => {
  const now = Date.now();

  return [
    {
      company_name: 'Acme SaaS',
      website_url: 'acmesaas.com',
      industry: 'SaaS',
      company_size: 120,
      country: 'France',
      contact_name: 'Claire Martin',
      contact_role: 'Head of IT',
      status: 'To Analyze',
      follow_up_status: 'To Contact',
      created_date: new Date(now - ONE_DAY_MS).toISOString(),
    },
    {
      company_name: 'Beta Retail',
      website_url: 'betaretail.io',
      industry: 'E-commerce',
      company_size: 320,
      country: 'Belgium',
      contact_name: 'Lucas Bernard',
      contact_role: 'IT Director',
      status: 'To Analyze',
      follow_up_status: 'To Contact',
      created_date: new Date(now - 2 * ONE_DAY_MS).toISOString(),
    },
    {
      company_name: 'Gamma Fintech',
      website_url: 'gammafintech.ai',
      industry: 'FinTech',
      company_size: 900,
      country: 'Germany',
      contact_name: 'Nina Dupont',
      contact_role: 'CIO',
      status: 'To Analyze',
      follow_up_status: 'To Contact',
      created_date: new Date(now - 3 * ONE_DAY_MS).toISOString(),
    },
  ];
};

export async function bootstrapDb() {
  const db = await readDb();

  let shouldWrite = false;

  if (!db.users || db.users.length === 0) {
    db.users = [
      {
        id: createId('user'),
        workspace_id: createId('ws'),
        email: DEFAULT_EMAIL,
        full_name: 'Demo User',
        password_hash: hashPassword(DEFAULT_PASSWORD),
        created_at: new Date().toISOString(),
      },
    ];
    shouldWrite = true;
  }

  if (db.users?.some((user) => !user.password_hash || !user.workspace_id)) {
    db.users = db.users.map((user) => {
      let next = user;

      if (!user.password_hash) {
        next = {
          ...next,
          password_hash: hashPassword(DEFAULT_PASSWORD),
        };
      }

      if (!user.workspace_id) {
        next = {
          ...next,
          workspace_id: createId('ws'),
        };
      }

      if (next !== user) {
        shouldWrite = true;
      }

      return next;
    });
  }

  if (!db.leads) {
    db.leads = [];
    shouldWrite = true;
  }

  if (!db.icpProfiles) {
    db.icpProfiles = [];
    shouldWrite = true;
  }

  const usersById = new Map(db.users.map((user) => [user.id, user]));
  const usersByEmail = new Map(db.users.map((user) => [normalizeEmail(user.email), user]));
  const fallbackUser = usersByEmail.get(normalizeEmail(DEFAULT_EMAIL)) || db.users[0] || null;

  const resolveOwnerUser = (ownerField) => {
    if (!ownerField) return null;

    if (usersById.has(ownerField)) {
      return usersById.get(ownerField);
    }

    const byEmail = usersByEmail.get(normalizeEmail(ownerField));
    if (byEmail) {
      return byEmail;
    }

    return null;
  };

  db.icpProfiles = (db.icpProfiles || []).map((profile) => {
    const ownerUser = resolveOwnerUser(profile.owner_user_id) || fallbackUser;

    if (!ownerUser) return profile;

    const next = {
      ...profile,
      owner_user_id: ownerUser.id,
      workspace_id: profile.workspace_id || ownerUser.workspace_id,
    };

    if (next.owner_user_id !== profile.owner_user_id || next.workspace_id !== profile.workspace_id) {
      shouldWrite = true;
    }

    return next;
  });

  db.leads = (db.leads || []).map((lead) => {
    const ownerUser = resolveOwnerUser(lead.owner_user_id) || fallbackUser;

    if (!ownerUser) return lead;

    const next = {
      ...lead,
      owner_user_id: ownerUser.id,
      workspace_id: lead.workspace_id || ownerUser.workspace_id,
    };

    if (next.owner_user_id !== lead.owner_user_id || next.workspace_id !== lead.workspace_id) {
      shouldWrite = true;
    }

    return next;
  });

  if (shouldWrite) {
    await writeDb(db);
  }
}

export async function bootstrapWorkspaceDemoData(dataStore, user) {
  if (!user) return;

  const activeIcp = await dataStore.getActiveIcpProfile(user);
  if (!activeIcp) {
    await dataStore.saveActiveIcpProfile(user, {
      ...demoIcpProfilePayload,
      owner_user_id: user.id,
    });
  }

  const existingLeads = await dataStore.listLeads(user, '-created_date');
  if (Array.isArray(existingLeads) && existingLeads.length > 0) {
    return;
  }

  await dataStore.createLeadsBulk(user, createDemoLeads());
}

export async function bootstrapSupabaseDemoUser(dataStore) {
  if (!isAuthProviderSupabase()) {
    const existing = await dataStore.findUserByEmail(DEFAULT_EMAIL);
    const demoPasswordHash = hashPassword(DEFAULT_PASSWORD);

    if (existing) {
      const updated = await dataStore.updateUser(existing.id, {
        password_hash: demoPasswordHash,
        full_name: existing.full_name || 'Demo User',
      });

      const user = updated || existing;
      await bootstrapWorkspaceDemoData(dataStore, user);
      return user;
    }

    const createdAt = new Date().toISOString();

    const created = await dataStore.createUser({
      id: createId('user'),
      workspace_id: createId('ws'),
      email: DEFAULT_EMAIL,
      full_name: 'Demo User',
      password_hash: demoPasswordHash,
      created_at: createdAt,
    });

    await bootstrapWorkspaceDemoData(dataStore, created);
    return created;
  }

  const authUser = await ensureAuthUserWithPassword({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    fullName: 'Demo User',
  });

  const workspaceUser = await ensureWorkspaceUserForAuth({
    authUser,
    fallbackFullName: 'Demo User',
  });

  await bootstrapWorkspaceDemoData(dataStore, workspaceUser);
  return workspaceUser;
}