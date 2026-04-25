import { FOLLOW_UP_STATUS, LEAD_STATUS } from '@/constants/leads';
import { ROUTES } from '@/constants/routes';
import { computeIcpScoreFromProfile, resolveLeadScores } from '@/lib/leadScoring';
import { mockDb } from '@/services/mock/mockDb';

const defaultApiBase = '/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || defaultApiBase).replace(/\/$/, '');
const rawMode = (import.meta.env.VITE_DATA_MODE || 'api').toLowerCase();
const FORCED_MODE = rawMode === 'mock' ? 'mock' : 'api';
const ALLOW_API_FALLBACK = String(import.meta.env.VITE_ALLOW_API_FALLBACK || '0').trim() !== '0';

export const isApiConfigured = Boolean(API_BASE_URL);

const isAuthError = (error) => {
  const status = error?.status || error?.response?.status;
  return status === 401 || status === 403;
};

const CSRF_COOKIE_NAME = 'aimleads_csrf';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const readCookieValue = (name) => {
  if (typeof document === 'undefined') return '';

  const match = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) return '';
  return decodeURIComponent(match.slice(name.length + 1));
};

const ensureCsrfToken = async () => {
  let token = readCookieValue(CSRF_COOKIE_NAME);
  if (token) return token;

  try {
    await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch {
    // Best effort only. The write below will fail clearly if the token is still missing.
  }

  token = readCookieValue(CSRF_COOKIE_NAME);
  return token;
};

const shouldFallback = (error, passAuthErrors = false) => {
  const status = error?.status || error?.response?.status;

  if (passAuthErrors && isAuthError(error)) {
    return false;
  }

  if (status && status >= 400 && status < 500) {
    return false;
  }

  return true;
};

const unwrapApiResponse = (payload) => {
  if (!payload) return null;
  if (payload.data !== undefined) return payload.data;
  if (payload.user !== undefined) return payload.user;
  return payload;
};

const apiRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const requestHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...headers,
  };

  if (!CSRF_SAFE_METHODS.has(normalizedMethod)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      requestHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: normalizedMethod,
    credentials: 'include',
    headers: requestHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

  let payload = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;

    if (response.status === 401 && !path.includes('/auth/')) {
      if (typeof window !== 'undefined') {
        const query = `?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        window.location.assign(`${ROUTES.login}${query}`);
      }
    }

    if (response.status === 402 && payload?.code === 'INSUFFICIENT_CREDITS') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aimleads:insufficient-credits', {
          detail: {
            balance: payload.balance ?? 0,
            required: payload.required ?? 0,
            action: payload.action ?? '',
          },
        }));
      }
    }

    throw error;
  }

  if (response.status !== 204 && payload === null) {
    const error = new Error('Invalid API response (expected JSON)');
    error.status = 502;
    throw error;
  }

  return unwrapApiResponse(payload);
};

const runWithMode = async ({ operationName, apiCall, fallbackCall, passAuthErrors = false }) => {
  if (FORCED_MODE === 'mock') {
    return fallbackCall();
  }

  try {
    if (!apiCall) throw new Error('API call not available');
    return await apiCall();
  } catch (apiError) {
    if (!ALLOW_API_FALLBACK) {
      throw apiError;
    }

    if (!shouldFallback(apiError, passAuthErrors)) throw apiError;
    console.warn(`[dataClient] ${operationName} failed on API, fallback to mock.`, apiError);
    return fallbackCall();
  }
};

const sortByCreatedDateDesc = (items) => {
  return [...items].sort((a, b) => {
    const left = new Date(a.created_at || a.created_date || 0).getTime();
    const right = new Date(b.created_at || b.created_date || 0).getTime();
    return right - left;
  });
};

const sanitizeWebsite = (website) => {
  if (!website) return '';
  return String(website).replace(/^https?:\/\//, '').trim();
};

const toDataUrl = (payload) => {
  const json = JSON.stringify(payload, null, 2);
  return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
};

const getIcpCategory = (score) => {
  if (score >= 80) return 'Excellent';
  if (score >= 50) return 'Strong Fit';
  if (score >= 20) return 'Medium Fit';
  return 'Low Fit';
};

const estimateLocalSignalScore = (lead) => {
  let score = 45;
  if (lead?.contact_email || lead?.email) score += 12;
  if (lead?.phone || lead?.contact_phone) score += 8;
  if (lead?.linkedin_url || lead?.linkedin) score += 6;
  if (lead?.website_url) score += 6;
  if (Array.isArray(lead?.internet_signals) && lead.internet_signals.length > 0) score += 10;
  if (String(lead?.industry || '').toLowerCase().includes('saas')) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const buildLocalSequence = (lead, { tone = 'consultative' } = {}) => {
  const company = lead?.company_name || 'votre équipe';
  const contact = lead?.contact_name || 'Bonjour';
  const role = lead?.contact_role || 'votre rôle';
  const hook = lead?.analysis_summary || lead?.recommended_action || `${company} semble avoir un bon potentiel de priorisation commerciale.`;

  return {
    sequence_name: `Séquence ${company}`,
    objective: `Transformer ${company} en conversation qualifiée avec un ton ${tone}.`,
    personalization_hooks: [
      hook,
      `${role} peut relier le besoin métier aux priorités pipeline.`,
    ],
    touches: [
      {
        day: 1,
        channel: 'email',
        subject: `${company} - priorisation des comptes`,
        body: `${contact},\n\nJe me permets de vous contacter car ${hook}\n\nAimLeads aide les équipes sales à repérer les comptes à traiter maintenant, avec un scoring lisible et une prochaine action claire.`,
        cta: 'Ouvert à un échange de 15 minutes cette semaine ?',
      },
      {
        day: 3,
        channel: 'linkedin',
        body: `Bonjour ${lead?.contact_name || ''}, je vous ai écrit au sujet de la priorisation des comptes ${company}. Curieux d'échanger si le sujet est d'actualité.`,
        cta: 'Se connecter',
      },
      {
        day: 6,
        channel: 'email_followup',
        subject: `Re: ${company} - priorisation`,
        body: `Je vous relance rapidement. Si la qualification des leads ou la lecture des signaux prend trop de temps côté équipe, je peux vous montrer un workflow simple à tester avec vos propres comptes.`,
        cta: 'Je vous envoie deux créneaux ?',
      },
    ],
  };
};

const createSampleLeads = () => ([
  {
    id: mockDb.createId(),
    company_name: 'Nexa Revenue',
    website_url: 'nexarevenue.io',
    industry: 'SaaS',
    company_size: 280,
    country: 'France',
    contact_name: 'Emma Laurent',
    contact_role: 'VP Sales',
    contact_email: 'emma.laurent@nexarevenue.io',
    phone: '+33123456780',
    linkedin_url: 'https://www.linkedin.com',
    source_list: 'Demo pipeline',
    status: LEAD_STATUS.TO_ANALYZE,
    follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
    created_at: mockDb.nowIso(),
    created_date: mockDb.nowIso(),
  },
  {
    id: mockDb.createId(),
    company_name: 'Atlas Fintech',
    website_url: 'atlasfintech.co',
    industry: 'FinTech',
    company_size: 620,
    country: 'Belgium',
    contact_name: 'Noah Dubois',
    contact_role: 'Head of Growth',
    contact_email: 'noah.dubois@atlasfintech.co',
    source_list: 'Demo pipeline',
    status: LEAD_STATUS.TO_ANALYZE,
    follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
    created_at: mockDb.nowIso(),
    created_date: mockDb.nowIso(),
  },
  {
    id: mockDb.createId(),
    company_name: 'Mistral Ops',
    website_url: 'mistralops.eu',
    industry: 'Logistics',
    company_size: 1800,
    country: 'Germany',
    contact_name: 'Sofia Weber',
    contact_role: 'COO',
    source_list: 'Demo pipeline',
    status: LEAD_STATUS.TO_ANALYZE,
    follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
    created_at: mockDb.nowIso(),
    created_date: mockDb.nowIso(),
  },
]);

const leadsMockApi = {
  async list() {
    return sortByCreatedDateDesc(mockDb.getLeads());
  },

  async filter(where = {}) {
    const entries = Object.entries(where);
    return mockDb.getLeads().filter((lead) => entries.every(([key, value]) => lead[key] === value));
  },

  async getById(id) {
    return mockDb.getLeads().find((lead) => lead.id === id) || null;
  },

  async create(payload) {
    const leads = mockDb.getLeads();
    const item = {
      id: mockDb.createId(),
      status: LEAD_STATUS.TO_ANALYZE,
      follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
      created_at: mockDb.nowIso(),
      ...payload,
      website_url: sanitizeWebsite(payload.website_url),
    };
    item.created_date = item.created_date || item.created_at;

    mockDb.setLeads([item, ...leads]);
    return item;
  },

  async update(id, payload) {
    const leads = mockDb.getLeads();
    const next = leads.map((lead) => (lead.id === id ? { ...lead, ...payload } : lead));
    mockDb.setLeads(next);
    return next.find((lead) => lead.id === id) || null;
  },

  async delete(id) {
    const leads = mockDb.getLeads();
    const next = leads.filter((lead) => lead.id !== id);
    mockDb.setLeads(next);
    return { deleted_count: leads.length === next.length ? 0 : 1 };
  },

  async bulkCreate(rows) {
    const leads = mockDb.getLeads();
    const created = rows
      .map((row) => ({
        id: mockDb.createId(),
        created_at: mockDb.nowIso(),
        status: LEAD_STATUS.TO_ANALYZE,
        follow_up_status: FOLLOW_UP_STATUS.TO_CONTACT,
        company_name: row.company_name || row['company name'] || row.name,
        website_url: sanitizeWebsite(row.website_url || row.website || row.url),
        industry: row.industry || '',
        company_size: row.company_size ? Number.parseInt(row.company_size, 10) : null,
        country: row.country || '',
        contact_name: row.contact_name || row.contact || '',
        contact_role: row.contact_role || row.role || row.title || '',
        contact_email: row.contact_email || row.email || '',
        source_list: row.source_list || row.source || '',
      }))
      .map((lead) => ({
        ...lead,
        created_date: lead.created_date || lead.created_at,
      }))
      .filter((lead) => Boolean(lead.company_name));

    if (created.length > 0) {
      mockDb.setLeads([...created, ...leads]);
    }

    return created;
  },

  async externalSignals(id, payload = {}) {
    const existing = mockDb.getLeads().find((lead) => lead.id === id);
    if (!existing) return null;

    const signals = Array.isArray(payload.signals) ? payload.signals : [];
    return this.update(id, { internet_signals: signals });
  },

  async discoverSignals(id) {
    return this.getById(id);
  },

  async scoreIcp(id) {
    const activeIcp = icpMockApi.getActive ? await icpMockApi.getActive() : null;
    const lead = await this.getById(id);
    if (!lead) return null;

    const computed = computeIcpScoreFromProfile(lead, activeIcp);
    const icpScore = computed?.score ?? Number(lead.icp_score || 0);
    return this.update(id, {
      icp_score: icpScore,
      icp_category: getIcpCategory(icpScore),
      score_details: {
        ...(lead.score_details || {}),
        icp: {
          profile_id: activeIcp?.id,
          profile_name: activeIcp?.name,
          criteria: computed?.criteria || [],
          calculated_locally: true,
        },
      },
    });
  },

  async reanalyze(id) {
    const activeIcp = await icpMockApi.getActive();
    const lead = await this.getById(id);
    if (!lead) return null;

    const computed = computeIcpScoreFromProfile(lead, activeIcp);
    const icpScore = computed?.score ?? Number(lead.icp_score || 0);
    const aiScore = estimateLocalSignalScore(lead);
    const scores = resolveLeadScores({ ...lead, icp_score: icpScore, ai_score: aiScore }, activeIcp);
    const finalScore = scores.finalScore ?? icpScore;
    const nextAction = finalScore >= 80
      ? 'Priorité haute: contacter maintenant avec un message personnalisé.'
      : finalScore >= 55
        ? 'À travailler: envoyer un email court et valider le besoin.'
        : 'À enrichir ou garder pour nurturing.';

    return this.update(id, {
      status: finalScore >= 45 ? LEAD_STATUS.QUALIFIED : LEAD_STATUS.REJECTED,
      icp_score: icpScore,
      icp_category: getIcpCategory(icpScore),
      ai_score: aiScore,
      final_score: finalScore,
      final_recommended_action: nextAction,
      recommended_action: nextAction,
      analysis_summary: `${lead.company_name || 'Ce lead'} obtient ${finalScore}/100 en analyse locale, avec un ICP à ${icpScore}/100 et un signal estimé à ${aiScore}/100.`,
      generated_icebreakers: {
        email: `J'ai remarqué que ${lead.company_name || 'votre équipe'} correspond à notre ICP et semble prioritaire pour un échange court.`,
        linkedin: `Bonjour ${lead.contact_name || ''}, curieux d'échanger sur vos priorités de qualification commerciale.`,
        call: `Mentionner le score local ${finalScore}/100 et valider le besoin de priorisation.`,
      },
      score_details: {
        ...(lead.score_details || {}),
        icp: {
          profile_id: activeIcp?.id,
          profile_name: activeIcp?.name,
          criteria: computed?.criteria || [],
          calculated_locally: true,
        },
        signal_analysis: {
          ai_score: aiScore,
          confidence: 72,
          icebreaker: `Le contexte disponible indique une bonne raison de prioriser ${lead.company_name || 'ce compte'}.`,
          calculated_locally: true,
        },
      },
      last_analyzed_at: mockDb.nowIso(),
    });
  },

  async generateSequence(id, payload = {}) {
    const lead = await this.getById(id);
    if (!lead) return null;
    return buildLocalSequence(lead, payload);
  },
};

const icpMockApi = {
  async list() {
    return mockDb.getIcpProfiles();
  },

  async filter(where = {}) {
    const entries = Object.entries(where);
    return mockDb.getIcpProfiles().filter((profile) => entries.every(([key, value]) => profile[key] === value));
  },

  async getActive() {
    const profiles = mockDb.getIcpProfiles();
    return profiles.find((profile) => profile.is_active) || profiles[0] || null;
  },

  async saveActive(payload) {
    const profiles = mockDb.getIcpProfiles();
    const normalized = profiles.map((profile) => ({ ...profile, is_active: false }));

    if (payload.id) {
      const updated = normalized.map((profile) =>
        profile.id === payload.id ? { ...profile, ...payload, is_active: true } : profile
      );
      mockDb.setIcpProfiles(updated);
      return updated.find((profile) => profile.id === payload.id);
    }

    const created = {
      ...payload,
      id: mockDb.createId(),
      is_active: true,
      created_at: mockDb.nowIso(),
    };
    created.created_date = created.created_date || created.created_at;

    mockDb.setIcpProfiles([created, ...normalized]);
    return created;
  },
};

const mockUnsupported = async () => {
  throw new Error('This action requires API mode (VITE_DATA_MODE=api).');
};

const apiClient = {
  auth: {
    me: () => apiRequest('/auth/me'),
    login: (payload) => apiRequest('/auth/login', { method: 'POST', body: payload }),
    register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload }),
    logout: () => apiRequest('/auth/logout', { method: 'POST' }),
    updateMe: (payload) => apiRequest('/auth/me', { method: 'PATCH', body: payload }),
    exportMe: () => `${API_BASE_URL}/auth/me/export`,
    deleteMe: () => apiRequest('/auth/me', { method: 'DELETE' }),
    ssoInit: (provider, redirect = '') => {
      const query = new URLSearchParams({ provider: String(provider || '') });
      const safeRedirect = String(redirect || '').trim();
      if (safeRedirect.startsWith('/') && !safeRedirect.startsWith('//') && safeRedirect !== '/') {
        query.set('redirect', safeRedirect);
      }
      return `${API_BASE_URL}/auth/sso/init?${query.toString()}`;
    },
    ssoSession: (payload) => apiRequest('/auth/sso/session', { method: 'POST', body: payload }),
    ssoCodeExchange: (payload) => apiRequest('/auth/sso/code', { method: 'POST', body: payload }),
  },
  leads: {
    list: (sort = '-created_at') => apiRequest(`/leads?sort=${encodeURIComponent(sort)}`),
    filter: (where = {}) => apiRequest('/leads/filter', { method: 'POST', body: { where } }),
    search: (q) => apiRequest(`/leads/search?q=${encodeURIComponent(q)}`),
    getById: (id) => apiRequest(`/leads/${id}`),
    create: (payload) => apiRequest('/leads', { method: 'POST', body: payload }),
    update: (id, payload) => apiRequest(`/leads/${id}`, { method: 'PATCH', body: payload }),
    delete: (id) => apiRequest(`/leads/${id}`, { method: 'DELETE' }),
    bulkCreate: (rows) => apiRequest('/leads/import', { method: 'POST', body: { rows } }),
    bulkDelete: (ids) => apiRequest('/leads/bulk-delete', { method: 'POST', body: { ids } }),
    exportUrl: () => `${API_BASE_URL}/leads/export`,
    externalSignals: (id, payload) => apiRequest(`/leads/${id}/external-signals`, { method: 'POST', body: payload }),
    scoreIcp: (id) => apiRequest(`/leads/${id}/score-icp`, { method: 'POST' }),
    analyzeSignals: (id, payload = {}) => apiRequest(`/leads/${id}/analyze-signals`, { method: 'POST', body: payload }),
    reanalyze: (id, payload = {}) => apiRequest(`/leads/${id}/reanalyze`, { method: 'POST', body: payload }),
    discoverSignals: (id, payload = {}) => apiRequest(`/leads/${id}/discover-signals`, { method: 'POST', body: payload }),
    generateSequence: (id, payload = {}) => apiRequest(`/leads/${id}/sequence`, { method: 'POST', body: payload }),
    research: (payload) => apiRequest('/leads/research', { method: 'POST', body: payload }),
  },
  icp: {
    list: () => apiRequest('/icp'),
    filter: (where = {}) => apiRequest('/icp/filter', { method: 'POST', body: { where } }),
    getActive: () => apiRequest('/icp/active'),
    saveActive: (payload) =>
      apiRequest('/icp/active', {
        method: 'PUT',
        body: payload,
      }),
    generateIcp: (description) => apiRequest('/icp/generate', { method: 'POST', body: { description } }),
  },
  analyze: (payload) => apiRequest('/analyze', { method: 'POST', body: payload }),
  jobs: {
    getStatus: (jobId) => apiRequest(`/jobs/${encodeURIComponent(jobId)}/status`),
  },
  workspace: {
    listMembers: () => apiRequest('/workspace/members'),
    listInvites: () => apiRequest('/workspace/invites'),
    loadSampleData: () => apiRequest('/workspace/sample-data', { method: 'POST' }),
    listAiRuns: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/workspace/ai-runs${qs ? `?${qs}` : ''}`);
    },
    listFeatureFlags: () => apiRequest('/workspace/feature-flags'),
    updateFeatureFlag: (flagName, enabled) =>
      apiRequest(`/workspace/feature-flags/${encodeURIComponent(flagName)}`, {
        method: 'PUT',
        body: { enabled },
      }),
    inviteMember: (payload) => apiRequest('/workspace/invites', { method: 'POST', body: payload }),
    revokeInvite: (inviteId) => apiRequest(`/workspace/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' }),
    updateMemberRole: (memberUserId, payload) =>
      apiRequest(`/workspace/members/${encodeURIComponent(memberUserId)}/role`, { method: 'PATCH', body: payload }),
    transferOwnership: (memberUserId) =>
      apiRequest(`/workspace/members/${encodeURIComponent(memberUserId)}/transfer-ownership`, { method: 'POST' }),
    exportUrl: () => `${API_BASE_URL}/workspace/export`,
    getIntegrationStatus: () => apiRequest('/workspace/integration-status'),
    getCredits: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/workspace/credits${qs ? `?${qs}` : ''}`);
    },
    grantCredits: (payload) => apiRequest('/workspace/credits/grant', { method: 'POST', body: payload }),
  },
  crm: {
    list: () => apiRequest('/crm'),
    save: (payload) => apiRequest('/crm', { method: 'POST', body: payload }),
    delete: (crmType) => apiRequest(`/crm/${encodeURIComponent(crmType)}`, { method: 'DELETE' }),
    test: (crmType) => apiRequest('/crm/test', { method: 'POST', body: { crm_type: crmType } }),
    syncLead: (leadId, crmType) =>
      apiRequest(`/crm/sync/${encodeURIComponent(leadId)}`, { method: 'POST', body: { crm_type: crmType } }),
    syncBulk: (leadIds, crmType) =>
      apiRequest('/crm/sync-bulk', { method: 'POST', body: { lead_ids: leadIds, crm_type: crmType } }),
    getSyncStatus: (leadId) => apiRequest(`/crm/sync-status/${encodeURIComponent(leadId)}`),
    getFieldMapping: (crmType) => apiRequest(`/crm/field-mapping/${encodeURIComponent(crmType)}`),
    saveFieldMapping: (crmType, mapping) =>
      apiRequest(`/crm/field-mapping/${encodeURIComponent(crmType)}`, { method: 'PUT', body: { mapping } }),
  },
  dev: {
    loadDemo: () => apiRequest('/dev/load-demo', { method: 'POST' }),
    reanalyze: (payload = {}) => apiRequest('/dev/reanalyze', { method: 'POST', body: payload }),
    checkup: () => apiRequest('/dev/checkup'),
  },
};

export const dataClient = {
  mode: FORCED_MODE,
  debug: {
    apiBaseUrl: API_BASE_URL,
    allowApiFallback: ALLOW_API_FALLBACK,
  },

  auth: {
    ssoInit(provider) {
      return typeof apiClient.auth?.ssoInit === 'function' ? apiClient.auth.ssoInit(provider) : '';
    },

    async ssoSession(payload) {
      return runWithMode({
        operationName: 'auth.ssoSession',
        apiCall: () => apiClient.auth.ssoSession(payload),
        fallbackCall: mockUnsupported,
      });
    },

    async ssoCodeExchange(payload) {
      return runWithMode({
        operationName: 'auth.ssoCodeExchange',
        apiCall: () => apiClient.auth.ssoCodeExchange(payload),
        fallbackCall: mockUnsupported,
      });
    },

    async isAuthenticated() {
      try {
        const user = await runWithMode({
          operationName: 'auth.isAuthenticated',
          apiCall: () => apiClient.auth.me(),
          fallbackCall: async () => mockDb.getUser(),
          passAuthErrors: true,
        });
        return Boolean(user);
      } catch (error) {
        if (isAuthError(error)) return false;
        throw error;
      }
    },

    async getCurrentUser() {
      return runWithMode({
        operationName: 'auth.getCurrentUser',
        apiCall: () => apiClient.auth.me(),
        fallbackCall: async () => mockDb.getUser(),
        passAuthErrors: true,
      });
    },

    async login(payload) {
      return runWithMode({
        operationName: 'auth.login',
        apiCall: () => apiClient.auth.login(payload),
        fallbackCall: async () => {
          const existing = mockDb.getUser();
          if (existing) return existing;
          const user = {
            id: mockDb.createId(),
            email: payload?.email || 'demo@aimleads.local',
            full_name: payload?.full_name || 'Demo User',
            created_at: mockDb.nowIso(),
          };
          mockDb.setUser(user);
          return user;
        },
        passAuthErrors: true,
      });
    },

    async register(payload) {
      return runWithMode({
        operationName: 'auth.register',
        apiCall: () => apiClient.auth.register(payload),
        fallbackCall: async () => {
          const user = {
            id: mockDb.createId(),
            email: payload?.email || 'demo@aimleads.local',
            full_name: payload?.full_name || 'Demo User',
            created_at: mockDb.nowIso(),
          };
          mockDb.setUser(user);
          return user;
        },
      });
    },

    async logout() {
      await runWithMode({
        operationName: 'auth.logout',
        apiCall: () => apiClient.auth.logout(),
        fallbackCall: async () => true,
      }).catch(() => {});

      return true;
    },

    async resetPassword(email) {
      return runWithMode({
        operationName: 'auth.resetPassword',
        apiCall: () => apiRequest('/auth/reset-password', { method: 'POST', body: { email } }),
        fallbackCall: async () => ({ ok: true }),
      });
    },

    async completePasswordRecovery(payload) {
      return runWithMode({
        operationName: 'auth.completePasswordRecovery',
        apiCall: () => apiRequest('/auth/reset-password/complete', { method: 'POST', body: payload }),
        fallbackCall: async () => ({ ok: true }),
      });
    },

    async updateMe(payload) {
      return runWithMode({
        operationName: 'auth.updateMe',
        apiCall: () => apiClient.auth.updateMe(payload),
        fallbackCall: async () => {
          const current = mockDb.getUser() || {};
          const updated = {
            ...current,
            full_name: payload?.full_name ?? current.full_name,
            updated_at: mockDb.nowIso(),
          };
          mockDb.setUser(updated);
          return updated;
        },
      });
    },

    exportMe() {
      if (FORCED_MODE === 'mock') {
        return toDataUrl({
          exported_at: mockDb.nowIso(),
          user: mockDb.getUser(),
        });
      }
      return apiClient.auth.exportMe();
    },

    async deleteMe() {
      return runWithMode({
        operationName: 'auth.deleteMe',
        apiCall: () => apiClient.auth.deleteMe(),
        fallbackCall: async () => {
          mockDb.deleteUser();
          return { deleted: true };
        },
      });
    },

    redirectToLogin(redirectUrl) {
      if (typeof window !== 'undefined') {
        const target = redirectUrl || window.location.pathname + window.location.search;
        const query = target ? `?redirect=${encodeURIComponent(target)}` : '';
        window.location.assign(`${ROUTES.login}${query}`);
      }

      return undefined;
    },
  },

  public: {
    async submitDemoRequest(payload) {
      return apiRequest('/public/demo-requests', { method: 'POST', body: payload });
    },

    async trackEvent(payload) {
      return apiRequest('/public/analytics-events', { method: 'POST', body: payload });
    },
  },

  leads: {
    async list(sort = '-created_at') {
      return runWithMode({
        operationName: 'leads.list',
        apiCall: () => apiClient.leads.list(sort),
        fallbackCall: () => leadsMockApi.list(),
        passAuthErrors: true,
      });
    },

    async filter(where) {
      return runWithMode({
        operationName: 'leads.filter',
        apiCall: () => apiClient.leads.filter(where),
        fallbackCall: () => leadsMockApi.filter(where),
        passAuthErrors: true,
      });
    },

    async getById(id) {
      return runWithMode({
        operationName: 'leads.getById',
        apiCall: () => apiClient.leads.getById(id),
        fallbackCall: () => leadsMockApi.getById(id),
        passAuthErrors: true,
      });
    },

    async create(payload) {
      return runWithMode({
        operationName: 'leads.create',
        apiCall: () => apiClient.leads.create(payload),
        fallbackCall: () => leadsMockApi.create(payload),
        passAuthErrors: true,
      });
    },

    async update(id, payload) {
      return runWithMode({
        operationName: 'leads.update',
        apiCall: () => apiClient.leads.update(id, payload),
        fallbackCall: () => leadsMockApi.update(id, payload),
        passAuthErrors: true,
      });
    },

    async delete(id) {
      return runWithMode({
        operationName: 'leads.delete',
        apiCall: () => apiClient.leads.delete(id),
        fallbackCall: () => leadsMockApi.delete(id),
        passAuthErrors: true,
      });
    },

    async bulkCreate(rows) {
      return runWithMode({
        operationName: 'leads.bulkCreate',
        apiCall: () => apiClient.leads.bulkCreate(rows),
        fallbackCall: () => leadsMockApi.bulkCreate(rows),
        passAuthErrors: true,
      });
    },

    async bulkDelete(ids) {
      return runWithMode({
        operationName: 'leads.bulkDelete',
        apiCall: () => apiClient.leads.bulkDelete(ids),
        fallbackCall: async () => {
          let deleted = 0;
          for (const id of ids) {
            const leads = mockDb.getLeads();
            const next = leads.map((l) => l.id === id ? { ...l, deleted_at: new Date().toISOString() } : l);
            mockDb.setLeads(next);
            deleted += 1;
          }
          return { deleted_count: deleted };
        },
        passAuthErrors: true,
      });
    },

    exportUrl() {
      return apiClient.leads.exportUrl();
    },

    async externalSignals(id, payload) {
      return runWithMode({
        operationName: 'leads.externalSignals',
        apiCall: () => apiClient.leads.externalSignals(id, payload),
        fallbackCall: () => leadsMockApi.externalSignals(id, payload),
        passAuthErrors: true,
      });
    },

    async scoreIcp(id) {
      return runWithMode({
        operationName: 'leads.scoreIcp',
        apiCall: () => apiClient.leads.scoreIcp(id),
        fallbackCall: () => leadsMockApi.scoreIcp(id),
        passAuthErrors: true,
      });
    },

    async reanalyze(id, payload = {}) {
      return runWithMode({
        operationName: 'leads.reanalyze',
        apiCall: () => apiClient.leads.reanalyze(id, payload),
        fallbackCall: () => leadsMockApi.reanalyze(id, payload),
        passAuthErrors: true,
      });
    },
    async analyzeSignals(id, payload = {}) {
      return runWithMode({
        operationName: 'leads.analyzeSignals',
        apiCall: () => apiClient.leads.analyzeSignals(id, payload),
        fallbackCall: () => leadsMockApi.getById(id),
      });
    },

    async discoverSignals(id, payload = {}) {
      return runWithMode({
        operationName: 'leads.discoverSignals',
        apiCall: () => apiClient.leads.discoverSignals(id, payload),
        fallbackCall: mockUnsupported,
        passAuthErrors: true,
      });
    },

    async generateSequence(id, payload = {}) {
      return runWithMode({
        operationName: 'leads.generateSequence',
        apiCall: () => apiClient.leads.generateSequence(id, payload),
        fallbackCall: () => leadsMockApi.generateSequence(id, payload),
        passAuthErrors: true,
      });
    },

    async research(payload) {
      return runWithMode({
        operationName: 'leads.research',
        apiCall: () => apiClient.leads.research(payload),
        fallbackCall: mockUnsupported,
        passAuthErrors: true,
      });
    },
  },

  icp: {
    async list() {
      return runWithMode({
        operationName: 'icp.list',
        apiCall: () => apiClient.icp.list(),
        fallbackCall: () => icpMockApi.list(),
        passAuthErrors: true,
      });
    },

    async filter(where) {
      return runWithMode({
        operationName: 'icp.filter',
        apiCall: () => apiClient.icp.filter(where),
        fallbackCall: () => icpMockApi.filter(where),
        passAuthErrors: true,
      });
    },

    async getActive() {
      return runWithMode({
        operationName: 'icp.getActive',
        apiCall: () => apiClient.icp.getActive(),
        fallbackCall: () => icpMockApi.getActive(),
        passAuthErrors: true,
      });
    },

    async saveActive(payload) {
      return runWithMode({
        operationName: 'icp.saveActive',
        apiCall: () => apiClient.icp.saveActive(payload),
        fallbackCall: () => icpMockApi.saveActive(payload),
        passAuthErrors: true,
      });
    },

    async generateIcp(description) {
      return runWithMode({
        operationName: 'icp.generateIcp',
        apiCall: () => apiClient.icp.generateIcp(description),
        fallbackCall: mockUnsupported,
        passAuthErrors: true,
      });
    },
  },

  analyze: async (payload) => {
    return runWithMode({
      operationName: 'analyze',
      apiCall: () => apiClient.analyze(payload),
      fallbackCall: async () => null,
      passAuthErrors: true,
    });
  },

  jobs: {
    async getStatus(jobId) {
      return runWithMode({
        operationName: 'jobs.getStatus',
        apiCall: () => apiClient.jobs.getStatus(jobId),
        fallbackCall: mockUnsupported,
        passAuthErrors: true,
      });
    },
  },

  audit: {
    async list({ limit = 100, offset = 0 } = {}) {
      return runWithMode({
        operationName: 'audit.list',
        apiCall: () => apiRequest(`/audit?limit=${limit}&offset=${offset}`),
        fallbackCall: async () => [],
        passAuthErrors: true,
      });
    },
  },

  workspace: {
    async listMembers() {
      return runWithMode({
        operationName: 'workspace.listMembers',
        apiCall: () => apiClient.workspace.listMembers(),
        fallbackCall: async () => {
          const user = mockDb.getUser();
          return user
            ? [
                {
                  user_id: user.id,
                  app_user_id: user.id,
                  workspace_id: user.workspace_id,
                  email: user.email,
                  full_name: user.full_name,
                  role: 'owner',
                  created_at: user.created_at,
                  is_current_user: true,
                },
              ]
            : [];
        },
        passAuthErrors: true,
      });
    },
    async loadSampleData() {
      return runWithMode({
        operationName: 'workspace.loadSampleData',
        apiCall: () => apiClient.workspace.loadSampleData(),
        fallbackCall: async () => {
          const leads = mockDb.getLeads();
          const alreadySeeded = leads.some((lead) => lead.source_list === 'Demo pipeline');
          if (alreadySeeded) return { already_seeded: true, inserted: 0 };
          const sampleLeads = createSampleLeads();
          mockDb.setLeads([...sampleLeads, ...leads]);
          return { already_seeded: false, inserted: sampleLeads.length, createdLeads: sampleLeads };
        },
        passAuthErrors: true,
      });
    },
    async listInvites() {
      return runWithMode({
        operationName: 'workspace.listInvites',
        apiCall: () => apiClient.workspace.listInvites(),
        fallbackCall: async () => mockDb.getInvites(),
        passAuthErrors: true,
      });
    },
    async listAiRuns(params = {}) {
      return runWithMode({
        operationName: 'workspace.listAiRuns',
        apiCall: () => apiClient.workspace.listAiRuns(params),
        fallbackCall: async () => [],
        passAuthErrors: true,
      });
    },
    async listFeatureFlags() {
      return runWithMode({
        operationName: 'workspace.listFeatureFlags',
        apiCall: () => apiClient.workspace.listFeatureFlags(),
        fallbackCall: async () => ({
          current_role: 'owner',
          can_manage: true,
          flags: [
            {
              flag_name: 'async_jobs',
              label: 'Async jobs',
              description: 'Prepare queue-backed AI jobs and polling workflows before a wider rollout.',
              category: 'platform',
              default_enabled: false,
              enabled: false,
              updated_at: null,
              updated_by_user_id: null,
            },
            {
              flag_name: 'notifications_center',
              label: 'Notification center',
              description: 'Enable the future in-app notification center once it is ready for this workspace.',
              category: 'product',
              default_enabled: false,
              enabled: false,
              updated_at: null,
              updated_by_user_id: null,
            },
            {
              flag_name: 'dark_mode',
              label: 'Dark mode',
              description: 'Unlock the upcoming workspace theme toggle for internal or pilot workspaces first.',
              category: 'experience',
              default_enabled: false,
              enabled: false,
              updated_at: null,
              updated_by_user_id: null,
            },
            {
              flag_name: 'send_to_aimlead',
              label: 'Send to real AimLead',
              description: 'Enable syncing workspace modifications directly to the live AimLead production environment.',
              category: 'platform',
              default_enabled: false,
              enabled: false,
              updated_at: null,
              updated_by_user_id: null,
            },
          ],
        }),
        passAuthErrors: true,
      });
    },
    async grantCredits(payload) {
      return runWithMode({
        operationName: 'workspace.grantCredits',
        apiCall: () => apiClient.workspace.grantCredits(payload),
        fallbackCall: async () => ({
          success: true,
          new_balance: 200,
          amount: payload?.amount || 150,
        }),
        passAuthErrors: true,
      });
    },
    async updateFeatureFlag(flagName, enabled) {
      return runWithMode({
        operationName: 'workspace.updateFeatureFlag',
        apiCall: () => apiClient.workspace.updateFeatureFlag(flagName, enabled),
        fallbackCall: async () => ({
          flag_name: flagName,
          enabled,
        }),
        passAuthErrors: true,
      });
    },
    async inviteMember(payload) {
      return runWithMode({
        operationName: 'workspace.inviteMember',
        apiCall: () => apiClient.workspace.inviteMember(payload),
        fallbackCall: async () => {
          const email = String(payload?.email || '').trim().toLowerCase();
          if (!email) throw new Error('Email is required.');
          const invite = {
            id: mockDb.createId(),
            email,
            role: payload?.role || 'member',
            status: 'pending',
            invited_at: mockDb.nowIso(),
            created_at: mockDb.nowIso(),
          };
          mockDb.setInvites([invite, ...mockDb.getInvites().filter((item) => item.email !== email)]);
          return invite;
        },
        passAuthErrors: true,
      });
    },
    async revokeInvite(inviteId) {
      return runWithMode({
        operationName: 'workspace.revokeInvite',
        apiCall: () => apiClient.workspace.revokeInvite(inviteId),
        fallbackCall: async () => {
          const before = mockDb.getInvites();
          mockDb.setInvites(before.filter((invite) => String(invite.id) !== String(inviteId)));
          return { revoked: true };
        },
        passAuthErrors: true,
      });
    },
    async updateMemberRole(memberUserId, payload) {
      return runWithMode({
        operationName: 'workspace.updateMemberRole',
        apiCall: () => apiClient.workspace.updateMemberRole(memberUserId, payload),
        fallbackCall: async () => ({ user_id: memberUserId, role: payload?.role || 'member' }),
        passAuthErrors: true,
      });
    },
    async transferOwnership(memberUserId) {
      return runWithMode({
        operationName: 'workspace.transferOwnership',
        apiCall: () => apiClient.workspace.transferOwnership(memberUserId),
        fallbackCall: async () => ({ user_id: memberUserId, role: 'owner' }),
        passAuthErrors: true,
      });
    },
    exportUrl() {
      if (FORCED_MODE === 'mock') {
        return toDataUrl({
          exported_at: mockDb.nowIso(),
          user: mockDb.getUser(),
          leads: mockDb.getLeads(),
          icp_profiles: mockDb.getIcpProfiles(),
          invites: mockDb.getInvites(),
        });
      }
      return apiClient.workspace.exportUrl();
    },
    async getCredits(params = {}) {
      return runWithMode({
        operationName: 'workspace.getCredits',
        apiCall: () => apiClient.workspace.getCredits(params),
        fallbackCall: async () => ({
          balance: 50,
          costs: {},
          transactions: [],
          plan: { plan_slug: 'free', billing_status: 'trial', trial_ends_at: null },
          entitlements: {
            plan_slug: 'free',
            plan_name: 'Free',
            credits_included: 50,
            seats_included: 3,
            crm_integrations: 0,
            includes_api_access: false,
            includes_priority_support: false,
          },
          usage: {
            credits_included: 50,
            estimated_used_credits: 0,
            remaining_credits: 50,
            usage_percent: 0,
            recent_30d_credits: 0,
            projected_runway_days: null,
            usage_window_days: 30,
            seats_included: 3,
            seats_used: 1,
            pending_invites: 0,
            reserved_seats: 1,
            seats_remaining: 2,
            limit_reached: false,
            crm_slots_included: 0,
            crm_slots_used: 0,
            crm_slots_remaining: 0,
            crm_limit_reached: true,
            connected_crm_types: [],
          },
          top_actions: [],
          plan_catalog: [],
        }),
        passAuthErrors: true,
      });
    },

      async getIntegrationStatus() {
        return runWithMode({
          operationName: 'workspace.getIntegrationStatus',
          apiCall: () => apiClient.workspace.getIntegrationStatus(),
          fallbackCall: async () => ({
            claude: false,
            hunter: false,
            newsApi: false,
            supabase: {
              configured: false,
              url: false,
              publishableKey: false,
              serviceRoleKey: false,
            },
            runtime: {
              nodeEnv: 'mock',
              dataProvider: 'mock',
              authProvider: 'mock',
              activeProvider: 'mock',
              fallbackReason: null,
              apiDocsEnabled: false,
              demoBootstrapEnabled: false,
            },
            security: {
              csrfProtectionEnabled: false,
              csrfMode: 'unknown',
              cspEnabled: false,
              trustedOriginsConfigured: false,
              secureCookies: false,
              publicBetaReady: false,
            },
          }),
          passAuthErrors: false,
        });
      },
  },

  crm: {
    async list() {
      return runWithMode({
        operationName: 'crm.list',
        apiCall: () => apiClient.crm.list(),
        fallbackCall: async () => mockDb.getCrmIntegrations(),
        passAuthErrors: true,
      });
    },
    async save(payload) {
      return runWithMode({
        operationName: 'crm.save',
        apiCall: () => apiClient.crm.save(payload),
        fallbackCall: async () => {
          const crmType = String(payload?.crm_type || '').trim().toLowerCase();
          if (!crmType) throw new Error('CRM type is required.');
          const masked = payload?.api_token ? `••••${String(payload.api_token).slice(-4)}` : '';
          const item = {
            id: crmType,
            crm_type: crmType,
            api_token: masked,
            config: payload?.config || {},
            is_active: true,
            connected_at: mockDb.nowIso(),
            updated_at: mockDb.nowIso(),
            field_mapping: {},
          };
          const next = [item, ...mockDb.getCrmIntegrations().filter((entry) => entry.crm_type !== crmType)];
          mockDb.setCrmIntegrations(next);
          return item;
        },
        passAuthErrors: true,
      });
    },
    async delete(crmType) {
      return runWithMode({
        operationName: 'crm.delete',
        apiCall: () => apiClient.crm.delete(crmType),
        fallbackCall: async () => {
          mockDb.setCrmIntegrations(mockDb.getCrmIntegrations().filter((entry) => entry.crm_type !== crmType));
          return { deleted: true };
        },
        passAuthErrors: true,
      });
    },
    async test(crmType) {
      return runWithMode({
        operationName: 'crm.test',
        apiCall: () => apiClient.crm.test(crmType),
        fallbackCall: async () => {
          const integrations = mockDb.getCrmIntegrations();
          const existing = integrations.find((entry) => entry.crm_type === crmType && entry.is_active);
          if (!existing) return { success: false, error: 'not_connected' };
          mockDb.setCrmIntegrations(integrations.map((entry) =>
            entry.crm_type === crmType ? { ...entry, last_tested_at: mockDb.nowIso() } : entry
          ));
          return { success: true, mock: true };
        },
        passAuthErrors: true,
      });
    },
    async syncLead(leadId, crmType) {
      return runWithMode({
        operationName: 'crm.syncLead',
        apiCall: () => apiClient.crm.syncLead(leadId, crmType),
        fallbackCall: async () => {
          await leadsMockApi.update(leadId, {
            crm_sync_status: 'synced',
            crm_last_synced_at: mockDb.nowIso(),
            crm_type: crmType,
          });
          mockDb.setCrmIntegrations(mockDb.getCrmIntegrations().map((entry) =>
            entry.crm_type === crmType ? { ...entry, last_synced_at: mockDb.nowIso() } : entry
          ));
          return { success: true, lead_id: leadId, crm_type: crmType };
        },
        passAuthErrors: true,
      });
    },
    async syncBulk(leadIds, crmType) {
      return runWithMode({
        operationName: 'crm.syncBulk',
        apiCall: () => apiClient.crm.syncBulk(leadIds, crmType),
        fallbackCall: async () => {
          for (const leadId of leadIds || []) {
            await leadsMockApi.update(leadId, {
              crm_sync_status: 'synced',
              crm_last_synced_at: mockDb.nowIso(),
              crm_type: crmType,
            });
          }
          return { success: true, synced: (leadIds || []).length, failed: 0 };
        },
        passAuthErrors: true,
      });
    },
    async getSyncStatus(leadId) {
      return runWithMode({
        operationName: 'crm.getSyncStatus',
        apiCall: () => apiClient.crm.getSyncStatus(leadId),
        fallbackCall: async () => [],
        passAuthErrors: true,
      });
    },
    async getFieldMapping(crmType) {
      return runWithMode({
        operationName: 'crm.getFieldMapping',
        apiCall: () => apiClient.crm.getFieldMapping(crmType),
        fallbackCall: async () =>
          mockDb.getCrmIntegrations().find((entry) => entry.crm_type === crmType)?.field_mapping || {},
        passAuthErrors: true,
      });
    },
    async saveFieldMapping(crmType, mapping) {
      return runWithMode({
        operationName: 'crm.saveFieldMapping',
        apiCall: () => apiClient.crm.saveFieldMapping(crmType, mapping),
        fallbackCall: async () => {
          mockDb.setCrmIntegrations(mockDb.getCrmIntegrations().map((entry) =>
            entry.crm_type === crmType ? { ...entry, field_mapping: mapping, updated_at: mockDb.nowIso() } : entry
          ));
          return { crm_type: crmType, mapping };
        },
        passAuthErrors: true,
      });
    },
  },

  dev: {
    loadDemo: async () =>
      runWithMode({
        operationName: 'dev.loadDemo',
        apiCall: () => apiClient.dev.loadDemo(),
        fallbackCall: mockUnsupported,
      }),

    reanalyze: async (payload = {}) =>
      runWithMode({
        operationName: 'dev.reanalyze',
        apiCall: () => apiClient.dev.reanalyze(payload),
        fallbackCall: mockUnsupported,
      }),

    checkup: async () =>
      runWithMode({
        operationName: 'dev.checkup',
        apiCall: () => apiClient.dev.checkup(),
        fallbackCall: mockUnsupported,
      }),
  },
};
