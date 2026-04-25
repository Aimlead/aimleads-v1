import { FOLLOW_UP_STATUS, LEAD_STATUS } from '@/constants/leads';

const STORAGE_KEYS = {
  user: 'aimleads_mock_user',
  leads: 'aimleads_mock_leads',
  icpProfiles: 'aimleads_mock_icp_profiles',
  invites: 'aimleads_mock_invites',
  crmIntegrations: 'aimleads_mock_crm_integrations',
};

const hasWindow = () => typeof window !== 'undefined';

const nowIso = () => new Date().toISOString();

const createId = () => `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const defaultUser = {
  id: 'mock-user-1',
  email: 'demo@aimleads.local',
  full_name: 'Demo User',
};

const defaultIcpProfile = {
  id: 'mock-icp-1',
  name: 'SaaS Outbound ICP',
  description: 'Default profile used while backend is not connected.',
  is_active: true,
  owner_user_id: defaultUser.email,
  weights: {
    industrie: {
      primaires: ['SaaS', 'Software'],
      secondaires: ['MarTech', 'FinTech', 'E-commerce'],
      exclusions: [],
      scores: { parfait: 30, partiel: 15, aucun: -30, exclu: -100 },
    },
    roles: {
      exclusions: ['Intern', 'Assistant'],
      exacts: ['CEO', 'Head of Sales', 'VP Sales', 'Founder'],
      proches: ['Director', 'Manager', 'Growth'],
      scores: { parfait: 25, partiel: 10, exclu: -100, aucun: -25 },
    },
    typeClient: {
      primaire: ['B2B'],
      secondaire: ['B2B2C'],
      scores: { parfait: 25, partiel: 10, aucun: -40 },
    },
    structure: {
      primaire: { min: 50, max: 5000 },
      secondaire: { min: 30, max: 10000 },
      scores: { parfait: 15, partiel: 10, aucun: -20 },
    },
    geo: {
      primaire: ['France', 'Belgium', 'Switzerland'],
      secondaire: ['Germany', 'Spain', 'Italy'],
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

const defaultLeads = [
  {
    id: 'mock-lead-1',
    company_name: 'Acme SaaS',
    website_url: 'acmesaas.com',
    industry: 'SaaS',
    company_size: 120,
    country: 'France',
    contact_name: 'Claire Martin',
    contact_role: 'Head of Sales',
    status: LEAD_STATUS.TO_ANALYZE,
    follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
    created_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'mock-lead-2',
    company_name: 'Beta Retail',
    website_url: 'betaretail.io',
    industry: 'E-commerce',
    company_size: 45,
    country: 'Belgium',
    contact_name: 'Lucas Bernard',
    contact_role: 'Growth Manager',
    status: LEAD_STATUS.QUALIFIED,
    icp_score: 73,
    icp_category: 'Strong Fit',
    follow_up_status: FOLLOW_UP_STATUS.CONTACTED,
    created_date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'mock-lead-3',
    company_name: 'Gamma Ops',
    website_url: 'gammaops.ai',
    industry: 'Logistics',
    company_size: 1500,
    country: 'Germany',
    contact_name: 'Nina Dupont',
    contact_role: 'COO',
    status: LEAD_STATUS.REJECTED,
    icp_score: 28,
    icp_category: 'Low Fit',
    follow_up_status: FOLLOW_UP_STATUS.CLOSED_LOST,
    created_date: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
];

const readStorage = (key, fallback) => {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  if (!hasWindow()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const ensureMockDb = () => {
  if (!hasWindow()) return;

  if (!window.localStorage.getItem(STORAGE_KEYS.user)) {
    writeStorage(STORAGE_KEYS.user, defaultUser);
  }

  if (!window.localStorage.getItem(STORAGE_KEYS.icpProfiles)) {
    writeStorage(STORAGE_KEYS.icpProfiles, [defaultIcpProfile]);
  }

  if (!window.localStorage.getItem(STORAGE_KEYS.leads)) {
    writeStorage(STORAGE_KEYS.leads, defaultLeads);
  }

  if (!window.localStorage.getItem(STORAGE_KEYS.invites)) {
    writeStorage(STORAGE_KEYS.invites, []);
  }

  if (!window.localStorage.getItem(STORAGE_KEYS.crmIntegrations)) {
    writeStorage(STORAGE_KEYS.crmIntegrations, []);
  }
};

export const mockDb = {
  ensure: ensureMockDb,
  createId,
  nowIso,
  getUser() {
    ensureMockDb();
    return readStorage(STORAGE_KEYS.user, defaultUser);
  },
  setUser(user) {
    writeStorage(STORAGE_KEYS.user, user);
  },
  deleteUser() {
    writeStorage(STORAGE_KEYS.user, null);
  },
  getLeads() {
    ensureMockDb();
    return readStorage(STORAGE_KEYS.leads, defaultLeads);
  },
  setLeads(leads) {
    writeStorage(STORAGE_KEYS.leads, leads);
  },
  getIcpProfiles() {
    ensureMockDb();
    return readStorage(STORAGE_KEYS.icpProfiles, [defaultIcpProfile]);
  },
  setIcpProfiles(profiles) {
    writeStorage(STORAGE_KEYS.icpProfiles, profiles);
  },
  getInvites() {
    ensureMockDb();
    return readStorage(STORAGE_KEYS.invites, []);
  },
  setInvites(invites) {
    writeStorage(STORAGE_KEYS.invites, invites);
  },
  getCrmIntegrations() {
    ensureMockDb();
    return readStorage(STORAGE_KEYS.crmIntegrations, []);
  },
  setCrmIntegrations(integrations) {
    writeStorage(STORAGE_KEYS.crmIntegrations, integrations);
  },
};

