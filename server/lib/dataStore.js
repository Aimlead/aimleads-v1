import { readDb, withDb } from './db.js';
import { getDataProvider, getRuntimeConfig } from './config.js';
import { createId, sortByCreatedDateDesc } from './utils.js';
import { filterByUserScope, getUserWorkspaceId, isRecordScopedToUser, withUserScope } from './scope.js';
import { logger } from './observability.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const toTimestamp = (value) => {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
};

const pickCanonicalUser = (users = []) => {
  if (!Array.isArray(users) || users.length === 0) return null;

  const sortedUsers = [...users].sort((left, right) => {
    const byCreatedAt = toTimestamp(left.created_at) - toTimestamp(right.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });

  return sortedUsers[0];
};

const matchWhere = (record, where = {}) => {
  return Object.entries(where).every(([key, value]) => record[key] === value);
};

const LEAD_WRITABLE_COLUMNS = new Set([
  'id',
  'workspace_id',
  'owner_user_id',
  'created_date',
  'company_name',
  'website_url',
  'industry',
  'company_size',
  'country',
  'contact_name',
  'contact_role',
  'contact_email',
  'source_list',
  'status',
  'follow_up_status',
  'notes',
  'analysis_summary',
  'generated_icebreaker',
  'generated_icebreakers',
  'signals',
  'score_details',
  'internet_signals',
  'auto_signal_metadata',
  'ai_signals',
  'ai_summary',
  'scoring_weights',
  'icp_profile_id',
  'icp_profile_name',
  'analysis_version',
  'last_analyzed_at',
  'icp_raw_score',
  'icp_score',
  'icp_category',
  'icp_priority',
  'recommended_action',
  'ai_score',
  'ai_confidence',
  'final_score',
  'final_category',
  'final_priority',
  'final_recommended_action',
  'final_status',
]);

const toSafeLeadWriteRow = (row, unsupportedColumns = new Set()) => {
  if (!row || typeof row !== 'object') return row;

  const safe = {};
  for (const [key, value] of Object.entries(row)) {
    if (!LEAD_WRITABLE_COLUMNS.has(key)) continue;
    if (unsupportedColumns.has(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  return safe;
};

const toSafeLeadWriteBody = (body, unsupportedColumns = new Set()) => {
  if (Array.isArray(body)) {
    return body.map((item) => toSafeLeadWriteRow(item, unsupportedColumns));
  }
  return toSafeLeadWriteRow(body, unsupportedColumns);
};

const toSafeUserWriteRow = (row, unsupportedColumns = new Set()) => {
  if (!row || typeof row !== 'object') return row;

  const safe = {};
  for (const [key, value] of Object.entries(row)) {
    if (unsupportedColumns.has(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  return safe;
};

const toSafeUserWriteBody = (body, unsupportedColumns = new Set()) => {
  if (Array.isArray(body)) {
    return body.map((item) => toSafeUserWriteRow(item, unsupportedColumns));
  }
  return toSafeUserWriteRow(body, unsupportedColumns);
};

const parseMissingColumnError = (error) => {
  const text = [
    error?.message,
    error?.payload?.message,
    error?.payload?.hint,
    error?.payload?.details,
  ]
    .filter(Boolean)
    .join(' ');

  const notFoundMatch = text.match(/could not find the '([^']+)' column of '([^']+)'/i);
  if (notFoundMatch) {
    return {
      table: String(notFoundMatch[2] || '').trim(),
      column: String(notFoundMatch[1] || '').trim(),
    };
  }

  const missingMatch = text.match(/column\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (missingMatch) {
    return {
      table: String(missingMatch[1] || '').trim(),
      column: String(missingMatch[2] || '').trim(),
    };
  }

  return null;
};

const localStore = {
  async findUserByEmail(email) {
    const db = await readDb();
    const matches = (db.users || []).filter((user) => normalizeEmail(user.email) === normalizeEmail(email));
    return pickCanonicalUser(matches);
  },

  async findUserBySupabaseAuthId(supabaseAuthId) {
    const normalized = String(supabaseAuthId || '').trim();
    if (!normalized) return null;

    const db = await readDb();
    return (db.users || []).find((user) => String(user.supabase_auth_id || '').trim() === normalized) || null;
  },

  async findUserById(userId) {
    const db = await readDb();
    return (db.users || []).find((user) => user.id === userId) || null;
  },

  async updateUser(userId, updates) {
    let updated = null;

    await withDb((current) => {
      const nextUsers = (current.users || []).map((user) => {
        if (user.id !== userId) return user;
        updated = { ...user, ...updates };
        return updated;
      });

      return {
        ...current,
        users: nextUsers,
      };
    });

    return updated;
  },

  async createUser(payload) {
    const user = {
      ...payload,
      id: payload.id || createId('user'),
      workspace_id: payload.workspace_id || createId('ws'),
      created_at: payload.created_at || new Date().toISOString(),
    };

    await withDb((current) => ({
      ...current,
      users: [user, ...(current.users || [])],
    }));

    return user;
  },

  async deleteUser(userId) {
    let deleted = null;

    await withDb((current) => {
      const nextUsers = (current.users || []).filter((user) => {
        if (user.id === userId) {
          deleted = user;
          return false;
        }
        return true;
      });

      return { ...current, users: nextUsers };
    });

    return deleted;
  },

  async listLeads(user, sort = '-created_date') {
    let leads = filterByUserScope((await readDb()).leads || [], user).filter((l) => !l.deleted_at);
    if (sort === '-created_date') {
      leads = sortByCreatedDateDesc(leads);
    }
    return leads;
  },

  async listWorkspaceMembers(user) {
    // In local mode, only the current user exists
    return [
      {
        user_id: user.id,
        workspace_id: user.workspace_id,
        email: user.email,
        full_name: user.full_name,
        role: 'owner',
        created_at: user.created_at,
      },
    ];
  },

  async filterLeads(user, where = {}) {
    return filterByUserScope((await readDb()).leads || [], user)
      .filter((l) => !l.deleted_at)
      .filter((lead) => matchWhere(lead, where));
  },

  async createLead(user, payload) {
    const lead = withUserScope(
      {
        ...payload,
        id: payload.id || createId('lead'),
        created_date: payload.created_date || new Date().toISOString(),
      },
      user
    );

    await withDb((current) => ({
      ...current,
      leads: [lead, ...(current.leads || [])],
    }));

    return lead;
  },

  async createLeadsBulk(user, rows = []) {
    const created = rows.map((row) =>
      withUserScope(
        {
          ...row,
          id: row.id || createId('lead'),
          created_date: row.created_date || new Date().toISOString(),
        },
        user
      )
    );

    if (created.length > 0) {
      await withDb((current) => ({
        ...current,
        leads: [...created, ...(current.leads || [])],
      }));
    }

    return created;
  },

  async getLeadById(user, leadId) {
    const db = await readDb();
    const lead = (db.leads || []).find((item) => item.id === leadId);
    if (!lead || !isRecordScopedToUser(lead, user) || lead.deleted_at) return null;
    return lead;
  },

  async updateLead(user, leadId, updates) {
    let updated = null;

    await withDb((current) => {
      const nextLeads = (current.leads || []).map((lead) => {
        if (lead.id !== leadId) return lead;
        if (!isRecordScopedToUser(lead, user)) return lead;
        updated = { ...lead, ...updates };
        return updated;
      });

      return {
        ...current,
        leads: nextLeads,
      };
    });

    return updated;
  },

  async deleteLead(user, leadId) {
    let deleted = null;

    await withDb((current) => {
      const nextLeads = (current.leads || []).map((lead) => {
        if (lead.id === leadId && isRecordScopedToUser(lead, user) && !lead.deleted_at) {
          deleted = lead;
          return { ...lead, deleted_at: new Date().toISOString() };
        }
        return lead;
      });

      return { ...current, leads: nextLeads };
    });

    return deleted;
  },

  async listIcpProfiles(user) {
    return filterByUserScope((await readDb()).icpProfiles || [], user);
  },

  async filterIcpProfiles(user, where = {}) {
    return filterByUserScope((await readDb()).icpProfiles || [], user).filter((profile) => matchWhere(profile, where));
  },

  async getIcpProfileById(user, profileId) {
    const db = await readDb();
    const profile = (db.icpProfiles || []).find((item) => item.id === profileId);
    if (!profile || !isRecordScopedToUser(profile, user)) return null;
    return profile;
  },

  async getActiveIcpProfile(user) {
    const profiles = await this.listIcpProfiles(user);
    return profiles.find((profile) => profile.is_active) || profiles[0] || null;
  },

  async saveActiveIcpProfile(user, payload) {
    let active = null;

    await withDb((current) => {
      const scopedProfiles = filterByUserScope(current.icpProfiles || [], user);
      const otherProfiles = (current.icpProfiles || []).filter((profile) => !isRecordScopedToUser(profile, user));

      let nextScopedProfiles = [];

      if (payload.id) {
        nextScopedProfiles = scopedProfiles.map((profile) => {
          if (profile.id === payload.id) {
            active = withUserScope({ ...profile, ...payload, is_active: true }, user);
            return active;
          }
          return { ...profile, is_active: false };
        });
      } else {
        active = withUserScope(
          {
            ...payload,
            id: createId('icp'),
            is_active: true,
            created_date: new Date().toISOString(),
          },
          user
        );

        nextScopedProfiles = [
          active,
          ...scopedProfiles.map((profile) => ({
            ...profile,
            is_active: false,
          })),
        ];
      }

      return {
        ...current,
        icpProfiles: [...nextScopedProfiles, ...otherProfiles],
      };
    });

    return active;
  },

  async createIcpProfile(user, payload) {
    const profile = withUserScope(
      {
        ...payload,
        id: payload.id || createId('icp'),
        is_active: payload.is_active || false,
        created_date: payload.created_date || new Date().toISOString(),
      },
      user
    );

    await withDb((current) => ({
      ...current,
      icpProfiles: [profile, ...(current.icpProfiles || [])],
    }));

    return profile;
  },

  async updateIcpProfile(user, profileId, updates) {
    let updated = null;

    await withDb((current) => {
      const nextProfiles = (current.icpProfiles || []).map((profile) => {
        if (profile.id !== profileId) return profile;
        if (!isRecordScopedToUser(profile, user)) return profile;
        updated = { ...profile, ...updates };
        return updated;
      });

      return { ...current, icpProfiles: nextProfiles };
    });

    return updated;
  },

  async deleteIcpProfile(user, profileId) {
    let deleted = null;

    await withDb((current) => {
      const nextProfiles = (current.icpProfiles || []).filter((profile) => {
        if (profile.id === profileId && isRecordScopedToUser(profile, user)) {
          deleted = profile;
          return false;
        }
        return true;
      });

      return { ...current, icpProfiles: nextProfiles };
    });

    return deleted;
  },

  async createAuditEntry(_user, entry) {
    await withDb((current) => ({
      ...current,
      auditLog: [entry, ...(current.auditLog || [])],
    }));
    return entry;
  },

  async listAuditLog(user, { limit = 100, offset = 0 } = {}) {
    const db = await readDb();
    const workspaceId = getUserWorkspaceId(user);
    const entries = (db.auditLog || [])
      .filter((entry) => entry.workspace_id === workspaceId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return entries.slice(offset, offset + limit);
  },

  getDiagnostics() {
    return {
      provider: 'local',
      unsupported_user_columns: [],
      unsupported_lead_columns: [],
    };
  },

  async refreshDiagnostics() {
    return this.getDiagnostics();
  },
};

const createSupabaseClient = () => {
  const config = getRuntimeConfig();
  const baseUrl = `${config.supabase.url.replace(/\/$/, '')}/rest/v1`;
  const apiKey = config.supabase.serviceRoleKey;
  const unsupportedLeadColumns = new Set();
  const unsupportedUserColumns = new Set();

  const request = async (table, { method = 'GET', query = {}, body, returnRepresentation = true } = {}) => {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }

    const url = `${baseUrl}/${table}${params.toString() ? `?${params.toString()}` : ''}`;

    const headers = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: returnRepresentation ? 'return=representation' : 'return=minimal',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.hint || `Supabase request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };

  const firstOrNull = (rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
  const isDuplicateError = (error) => error?.payload?.code === '23505' || error?.status === 409;

  const requestLeadsWithSchemaFallback = async ({
    method = 'GET',
    query = {},
    body,
    returnRepresentation = true,
  } = {}) => {
    let nextBody = toSafeLeadWriteBody(body, unsupportedLeadColumns);
    let attempts = 0;

    while (attempts < 5) {
      attempts += 1;
      try {
        return await request('leads', {
          method,
          query,
          body: nextBody,
          returnRepresentation,
        });
      } catch (error) {
        const missing = parseMissingColumnError(error);
        if (!missing || missing.table !== 'leads' || !missing.column) {
          throw error;
        }

        if (unsupportedLeadColumns.has(missing.column)) {
          throw error;
        }

        unsupportedLeadColumns.add(missing.column);
        logger.warn('supabase_missing_leads_column_retrying_without_field', {
          column: missing.column,
          method,
        });

        const prunedBody = toSafeLeadWriteBody(nextBody, unsupportedLeadColumns);
        const previous = JSON.stringify(nextBody ?? null);
        const next = JSON.stringify(prunedBody ?? null);
        if (previous === next) {
          throw error;
        }
        nextBody = prunedBody;
      }
    }

    throw new Error('Supabase leads mutation failed after schema fallback attempts');
  };

  const requestUsersWithSchemaFallback = async ({
    method = 'GET',
    query = {},
    body,
    returnRepresentation = true,
  } = {}) => {
    let nextQuery = { ...(query || {}) };
    let nextBody = toSafeUserWriteBody(body, unsupportedUserColumns);
    let attempts = 0;

    while (attempts < 5) {
      attempts += 1;
      try {
        return await request('users', {
          method,
          query: nextQuery,
          body: nextBody,
          returnRepresentation,
        });
      } catch (error) {
        const missing = parseMissingColumnError(error);
        if (!missing || missing.table !== 'users' || !missing.column) {
          throw error;
        }

        if (unsupportedUserColumns.has(missing.column)) {
          throw error;
        }

        unsupportedUserColumns.add(missing.column);
        logger.warn('supabase_missing_users_column_retrying_without_field', {
          column: missing.column,
          method,
        });

        delete nextQuery[missing.column];

        const prunedBody = toSafeUserWriteBody(nextBody, unsupportedUserColumns);
        const queryChanged = JSON.stringify(nextQuery) !== JSON.stringify(query || {});
        const bodyChanged = JSON.stringify(nextBody ?? null) !== JSON.stringify(prunedBody ?? null);

        if (!queryChanged && !bodyChanged) {
          throw error;
        }

        nextBody = prunedBody;
      }
    }

    throw new Error('Supabase users mutation failed after schema fallback attempts');
  };

  const probeColumn = async ({ table, column, unsupportedSet }) => {
    try {
      await request(table, {
        method: 'GET',
        query: {
          select: column,
          limit: '1',
        },
      });
      unsupportedSet.delete(column);
      return;
    } catch (error) {
      const missing = parseMissingColumnError(error);
      if (missing?.table === table && missing?.column === column) {
        unsupportedSet.add(column);
        return;
      }
      throw error;
    }
  };

  return {
    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const rows = await request('users', {
        method: 'GET',
        query: {
          email: `eq.${normalizedEmail}`,
          order: 'created_at.asc,id.asc',
          limit: '25',
        },
      });

      if (Array.isArray(rows) && rows.length > 1) {
        logger.warn('duplicate_users_same_email_detected', {
          email: normalizedEmail,
          count: rows.length,
        });
      }

      return pickCanonicalUser(rows);
    },

    async findUserBySupabaseAuthId(supabaseAuthId) {
      const normalized = String(supabaseAuthId || '').trim();
      if (!normalized) return null;

      if (unsupportedUserColumns.has('supabase_auth_id')) {
        return null;
      }

      try {
        const rows = await request('users', {
          method: 'GET',
          query: {
            supabase_auth_id: `eq.${normalized}`,
            limit: '1',
          },
        });

        return firstOrNull(rows);
      } catch (error) {
        const missing = parseMissingColumnError(error);
        if (missing?.table === 'users' && missing?.column === 'supabase_auth_id') {
          unsupportedUserColumns.add('supabase_auth_id');
          logger.warn('supabase_missing_users_column_fallback_by_email', {
            column: 'supabase_auth_id',
          });
          return null;
        }
        throw error;
      }
    },

    async findUserById(userId) {
      const rows = await request('users', {
        method: 'GET',
        query: {
          id: `eq.${userId}`,
          limit: '1',
        },
      });

      return firstOrNull(rows);
    },

    async updateUser(userId, updates) {
      const rows = await requestUsersWithSchemaFallback({
        method: 'PATCH',
        query: {
          id: `eq.${userId}`,
        },
        body: updates,
      });

      return firstOrNull(rows);
    },

    async deleteUser(userId) {
      const existing = await this.findUserById(userId);
      if (!existing) return null;

      await request('users', {
        method: 'DELETE',
        query: { id: `eq.${userId}` },
        returnRepresentation: false,
      });

      return existing;
    },

    async createUser(payload) {
      const user = {
        ...payload,
        id: payload.id || createId('user'),
        workspace_id: payload.workspace_id || createId('ws'),
        password_hash: payload.password_hash || '__supabase_auth__',
        created_at: payload.created_at || new Date().toISOString(),
      };

      const workspace = {
        id: user.workspace_id,
        name: `${user.full_name || 'New User'} Workspace`,
        created_at: user.created_at,
      };

      try {
        await request('workspaces', {
          method: 'POST',
          body: workspace,
        });
      } catch (error) {
        if (!isDuplicateError(error)) {
          throw error;
        }
      }

      const rows = await requestUsersWithSchemaFallback({
        method: 'POST',
        body: user,
      });

      try {
        await request('workspace_members', {
          method: 'POST',
          body: {
            workspace_id: user.workspace_id,
            user_id: user.supabase_auth_id || user.id,
            role: 'owner',
            created_at: user.created_at,
          },
          returnRepresentation: false,
        });
      } catch (error) {
        if (!isDuplicateError(error)) {
          throw error;
        }
      }

      return firstOrNull(rows) || user;
    },

    async listLeads(user, sort = '-created_date') {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('leads', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          deleted_at: 'is.null',
          ...(sort === '-created_date' ? { order: 'created_date.desc' } : {}),
        },
      });

      return Array.isArray(rows) ? rows : [];
    },

    async listWorkspaceMembers(user) {
      const workspaceId = getUserWorkspaceId(user);
      try {
        const rows = await request('workspace_members', {
          method: 'GET',
          query: { workspace_id: `eq.${workspaceId}`, select: '*,users(email,full_name)' },
        });
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty');
        return rows.map((row) => ({
          user_id: row.user_id,
          workspace_id: row.workspace_id,
          email: row.users?.email || row.email,
          full_name: row.users?.full_name || row.full_name,
          role: row.role,
          created_at: row.created_at,
        }));
      } catch {
        return [
          {
            user_id: user.id,
            workspace_id: workspaceId,
            email: user.email,
            full_name: user.full_name,
            role: 'owner',
            created_at: user.created_at,
          },
        ];
      }
    },

    async filterLeads(user, where = {}) {
      const workspaceId = getUserWorkspaceId(user);
      const query = { workspace_id: `eq.${workspaceId}`, deleted_at: 'is.null' };

      // Whitelist allowed filter fields to prevent PostgREST operator injection
      const ALLOWED_FILTER_FIELDS = new Set([
        'status', 'follow_up_status', 'source_list', 'icp_profile_id',
        'industry', 'country', 'icp_category', 'final_category',
        'llm_enriched', 'created_date', 'id',
      ]);

      for (const [key, value] of Object.entries(where)) {
        if (!ALLOWED_FILTER_FIELDS.has(key)) continue;
        // Encode value to prevent PostgREST operator injection (strip dots and special chars)
        query[key] = `eq.${String(value).replace(/[^a-zA-Z0-9 _\-@]/g, '')}`;
      }

      const rows = await request('leads', { method: 'GET', query });
      return Array.isArray(rows) ? rows : [];
    },

    async createLead(user, payload) {
      const lead = withUserScope(
        {
          ...payload,
          id: payload.id || createId('lead'),
          created_date: payload.created_date || new Date().toISOString(),
        },
        user
      );

      const rows = await requestLeadsWithSchemaFallback({
        method: 'POST',
        body: lead,
      });

      return firstOrNull(rows) || lead;
    },

    async createLeadsBulk(user, rows = []) {
      if (rows.length === 0) return [];

      const created = rows.map((row) =>
        withUserScope(
          {
            ...row,
            id: row.id || createId('lead'),
            created_date: row.created_date || new Date().toISOString(),
          },
          user
        )
      );

      const result = await requestLeadsWithSchemaFallback({
        method: 'POST',
        body: created,
      });

      return Array.isArray(result) ? result : created;
    },

    async getLeadById(user, leadId) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('leads', {
        method: 'GET',
        query: {
          id: `eq.${leadId}`,
          workspace_id: `eq.${workspaceId}`,
          deleted_at: 'is.null',
          limit: '1',
        },
      });

      return firstOrNull(rows);
    },

    async updateLead(user, leadId, updates) {
      const workspaceId = getUserWorkspaceId(user);

      const rows = await requestLeadsWithSchemaFallback({
        method: 'PATCH',
        query: {
          id: `eq.${leadId}`,
          workspace_id: `eq.${workspaceId}`,
        },
        body: updates,
      });

      return firstOrNull(rows);
    },

    async deleteLead(user, leadId) {
      const workspaceId = getUserWorkspaceId(user);

      const existing = await this.getLeadById(user, leadId);
      if (!existing) return null;

      await request('leads', {
        method: 'PATCH',
        query: {
          id: `eq.${leadId}`,
          workspace_id: `eq.${workspaceId}`,
        },
        body: { deleted_at: new Date().toISOString() },
      });

      return existing;
    },

    async listIcpProfiles(user) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('icp_profiles', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
        },
      });

      return Array.isArray(rows) ? rows : [];
    },

    async filterIcpProfiles(user, where = {}) {
      const workspaceId = getUserWorkspaceId(user);
      const query = { workspace_id: `eq.${workspaceId}` };

      for (const [key, value] of Object.entries(where)) {
        query[key] = `eq.${value}`;
      }

      const rows = await request('icp_profiles', { method: 'GET', query });
      return Array.isArray(rows) ? rows : [];
    },

    async getIcpProfileById(user, profileId) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('icp_profiles', {
        method: 'GET',
        query: {
          id: `eq.${profileId}`,
          workspace_id: `eq.${workspaceId}`,
          limit: '1',
        },
      });

      return firstOrNull(rows);
    },

    async getActiveIcpProfile(user) {
      const workspaceId = getUserWorkspaceId(user);
      const activeRows = await request('icp_profiles', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          is_active: 'eq.true',
          limit: '1',
        },
      });

      const active = firstOrNull(activeRows);
      if (active) return active;

      const fallbackRows = await request('icp_profiles', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          order: 'created_date.desc',
          limit: '1',
        },
      });

      return firstOrNull(fallbackRows);
    },

    async saveActiveIcpProfile(user, payload) {
      const workspaceId = getUserWorkspaceId(user);

      if (payload.id) {
        const existing = await this.getIcpProfileById(user, payload.id);
        if (!existing) return null;
      }

      await request('icp_profiles', {
        method: 'PATCH',
        query: {
          workspace_id: `eq.${workspaceId}`,
        },
        body: { is_active: false },
        returnRepresentation: false,
      });

      if (payload.id) {
        const rows = await request('icp_profiles', {
          method: 'PATCH',
          query: {
            id: `eq.${payload.id}`,
            workspace_id: `eq.${workspaceId}`,
          },
          body: withUserScope({ ...payload, is_active: true }, user),
        });

        return firstOrNull(rows);
      }

      const created = withUserScope(
        {
          ...payload,
          id: createId('icp'),
          is_active: true,
          created_date: new Date().toISOString(),
        },
        user
      );

      const rows = await request('icp_profiles', {
        method: 'POST',
        body: created,
      });

      return firstOrNull(rows) || created;
    },

    async createIcpProfile(user, payload) {
      const profile = withUserScope(
        {
          ...payload,
          id: payload.id || createId('icp'),
          is_active: payload.is_active || false,
          created_date: payload.created_date || new Date().toISOString(),
        },
        user
      );

      const rows = await request('icp_profiles', {
        method: 'POST',
        body: profile,
      });

      return firstOrNull(rows) || profile;
    },

    async updateIcpProfile(user, profileId, updates) {
      const workspaceId = getUserWorkspaceId(user);

      const rows = await request('icp_profiles', {
        method: 'PATCH',
        query: {
          id: `eq.${profileId}`,
          workspace_id: `eq.${workspaceId}`,
        },
        body: updates,
      });

      return firstOrNull(rows);
    },

    async deleteIcpProfile(user, profileId) {
      const workspaceId = getUserWorkspaceId(user);

      const existing = await this.getIcpProfileById(user, profileId);
      if (!existing) return null;

      await request('icp_profiles', {
        method: 'DELETE',
        query: {
          id: `eq.${profileId}`,
          workspace_id: `eq.${workspaceId}`,
        },
        returnRepresentation: false,
      });

      return existing;
    },

    async createAuditEntry(_user, entry) {
      try {
        await request('audit_log', {
          method: 'POST',
          body: entry,
          returnRepresentation: false,
        });
      } catch {
        // audit log is best-effort
      }
      return entry;
    },

    async listAuditLog(user, { limit = 100, offset = 0 } = {}) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('audit_log', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          order: 'created_at.desc',
          limit: String(limit),
          offset: String(offset),
        },
      });
      return Array.isArray(rows) ? rows : [];
    },

    getDiagnostics() {
      return {
        provider: 'supabase',
        unsupported_user_columns: [...unsupportedUserColumns],
        unsupported_lead_columns: [...unsupportedLeadColumns],
      };
    },

    async refreshDiagnostics() {
      await probeColumn({
        table: 'users',
        column: 'supabase_auth_id',
        unsupportedSet: unsupportedUserColumns,
      });

      await probeColumn({
        table: 'leads',
        column: 'internet_signals',
        unsupportedSet: unsupportedLeadColumns,
      });

      await probeColumn({
        table: 'leads',
        column: 'auto_signal_metadata',
        unsupportedSet: unsupportedLeadColumns,
      });

      return this.getDiagnostics();
    },
  };
};

const shouldAllowSupabaseLocalFallback = () => {
  const raw = String(process.env.SUPABASE_FALLBACK_TO_LOCAL || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return getRuntimeConfig().nodeEnv !== 'production';
};

const isSupabaseConnectionError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const directCauseCode = String(error?.cause?.code || '').toUpperCase();
  const nestedCodes = Array.isArray(error?.cause?.errors)
    ? error.cause.errors.map((entry) => String(entry?.code || '').toUpperCase())
    : [];

  const knownNetworkCodes = ['EACCES', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'];

  if (knownNetworkCodes.includes(code) || knownNetworkCodes.includes(directCauseCode)) {
    return true;
  }

  if (nestedCodes.some((nested) => knownNetworkCodes.includes(nested))) {
    return true;
  }

  return message.includes('fetch failed') || message.includes('network') || message.includes('socket hang up');
};

const isSupabaseRecoverableError = (error) => {
  if (isSupabaseConnectionError(error)) {
    return true;
  }

  const status = Number(error?.status);
  return [401, 403, 429, 500, 502, 503, 504].includes(status);
};

const dataStoreRuntime = {
  configuredProvider: getDataProvider(),
  activeProvider: getDataProvider(),
  fallbackReason: null,
};

const createSupabaseFailoverStore = (supabaseStore) => {
  if (!shouldAllowSupabaseLocalFallback()) {
    return supabaseStore;
  }

  let fallbackActive = false;

  const activateFallback = (error) => {
    if (fallbackActive) return;
    fallbackActive = true;
    dataStoreRuntime.activeProvider = 'local-fallback';
    dataStoreRuntime.fallbackReason = String(error?.message || error?.code || 'supabase_unreachable');
    logger.warn('supabase_fallback_local_enabled', {
      reason: dataStoreRuntime.fallbackReason,
    });
  };

  return new Proxy(supabaseStore, {
    get(target, prop, receiver) {
      const targetValue = Reflect.get(target, prop, receiver);

      if (typeof targetValue !== 'function') {
        return targetValue;
      }

      return async (...args) => {
        const localMethod = localStore[prop];

        if (fallbackActive && typeof localMethod === 'function') {
          return localMethod(...args);
        }

        try {
          return await targetValue.apply(target, args);
        } catch (error) {
          if (typeof localMethod === 'function' && isSupabaseRecoverableError(error)) {
            activateFallback(error);
            return localMethod(...args);
          }
          throw error;
        }
      };
    },
  });
};

const provider =
  getDataProvider() === 'supabase' ? createSupabaseFailoverStore(createSupabaseClient()) : localStore;

export const dataStore = provider;
export const getDataStoreRuntime = () => ({ ...dataStoreRuntime });



