import { readDb, withDb } from './db.js';
import { getDataProvider, getRuntimeConfig } from './config.js';
import { createId } from './utils.js';
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

const WORKSPACE_ROLES = new Set(['owner', 'admin', 'member']);

const normalizeWorkspaceRole = (value, fallback = 'member') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (WORKSPACE_ROLES.has(normalized)) {
    return normalized;
  }
  return fallback;
};

const getMembershipUserId = (user) => String(user?.supabase_auth_id || user?.id || '').trim();

const createStatusError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isPendingInvite = (invite) => Boolean(invite && !invite.accepted_at && !invite.revoked_at);

const sortByCreatedAtAsc = (items = []) =>
  [...items].sort((left, right) => {
    const byCreatedAt = toTimestamp(left?.created_at) - toTimestamp(right?.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });

const sortByCreatedAtDesc = (items = []) =>
  [...items].sort((left, right) => {
    const byCreatedAt = toTimestamp(right?.created_at) - toTimestamp(left?.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });

const isCurrentWorkspaceMember = (member, user) => {
  const memberUserId = String(member?.user_id || '').trim();
  const memberAppUserId = String(member?.app_user_id || '').trim();
  const currentMemberUserId = getMembershipUserId(user);

  return (
    (currentMemberUserId && memberUserId === currentMemberUserId) ||
    (user?.id && memberAppUserId === String(user.id))
  );
};

const toWorkspaceMemberView = (member, users = [], currentUser = null) => {
  const matchedUser =
    users.find(
      (candidate) =>
        String(candidate?.supabase_auth_id || '').trim() === String(member?.user_id || '').trim() ||
        String(candidate?.id || '').trim() === String(member?.user_id || '').trim()
    ) || null;

  return {
    user_id: String(member?.user_id || '').trim(),
    app_user_id: matchedUser?.id || null,
    workspace_id: member?.workspace_id || matchedUser?.workspace_id || '',
    email: matchedUser?.email || member?.email || '',
    full_name: matchedUser?.full_name || member?.full_name || '',
    role: normalizeWorkspaceRole(member?.role),
    created_at: member?.created_at || matchedUser?.created_at || new Date().toISOString(),
    is_current_user: currentUser ? isCurrentWorkspaceMember({
      ...member,
      app_user_id: matchedUser?.id || member?.app_user_id || null,
      email: matchedUser?.email || member?.email || '',
    }, currentUser) : false,
  };
};

const toWorkspaceInviteView = (invite) => ({
  id: invite?.id,
  workspace_id: invite?.workspace_id || '',
  email: normalizeEmail(invite?.email || ''),
  role: normalizeWorkspaceRole(invite?.role),
  invited_by_user_id: invite?.invited_by_user_id || invite?.invited_by || null,
  created_at: invite?.created_at || new Date().toISOString(),
  accepted_at: invite?.accepted_at || null,
  revoked_at: invite?.revoked_at || null,
  status: isPendingInvite(invite) ? 'pending' : invite?.accepted_at ? 'accepted' : 'revoked',
});

const withWorkspaceId = (user, workspaceId) => {
  if (!user) return user;
  if (!workspaceId || String(user.workspace_id || '').trim() === String(workspaceId).trim()) {
    return user;
  }
  return {
    ...user,
    workspace_id: workspaceId,
  };
};

const matchWhere = (record, where = {}) => {
  return Object.entries(where).every(([key, value]) => record[key] === value);
};

const mapWorkspaceMember = (member, users = [], currentUser = null) =>
  toWorkspaceMemberView(member, users, currentUser);

const isActiveWorkspaceInvite = (invite) => isPendingInvite(invite);

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
  'intent_signals',
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
  'llm_enriched',
  'llm_provider',
  'llm_score_adjustment',
  'llm_confidence',
  'suggested_action',
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

const mapWriteBody = (body, transform) => {
  if (Array.isArray(body)) {
    return body.map((item) => transform(item));
  }
  return transform(body);
};

const applyLegacyOwnerUserId = (body, ownerUserId, unsupportedColumns = new Set()) => {
  if (!ownerUserId || unsupportedColumns.has('owner_user_id')) {
    return body;
  }

  return mapWriteBody(body, (row) => {
    if (!row || typeof row !== 'object') return row;
    if (row.owner_user_id) return row;
    return {
      ...row,
      owner_user_id: ownerUserId,
    };
  });
};

const pruneUnsupportedColumnsFromBody = (body, unsupportedColumns = new Set()) => {
  return mapWriteBody(body, (row) => {
    if (!row || typeof row !== 'object') return row;

    const next = { ...row };
    for (const column of unsupportedColumns) {
      delete next[column];
    }
    return next;
  });
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

const parseRequiredColumnError = (error, table) => {
  const text = [
    error?.message,
    error?.payload?.message,
    error?.payload?.hint,
    error?.payload?.details,
  ]
    .filter(Boolean)
    .join(' ');

  const relationMatch = text.match(/null value in column "([^"]+)" of relation "([^"]+)"/i);
  if (relationMatch) {
    const column = String(relationMatch[1] || '').trim();
    const relation = String(relationMatch[2] || '').trim();
    if (column && relation && (!table || relation === table)) {
      return { table: relation, column };
    }
  }

  const tableMatch = text.match(/column "([^"]+)" of table "([^"]+)"/i);
  if (tableMatch) {
    const column = String(tableMatch[1] || '').trim();
    const relation = String(tableMatch[2] || '').trim();
    if (column && relation && (!table || relation === table)) {
      return { table: relation, column };
    }
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

  async findFirstWorkspaceMembershipForUser(user) {
    const membershipUserId = getMembershipUserId(user);
    const appUserId = String(user?.id || '').trim();
    const db = await readDb();

    return (
      (db.workspaceMembers || []).find(
        (entry) =>
          String(entry?.user_id || '').trim() === membershipUserId ||
          String(entry?.app_user_id || '').trim() === appUserId
      ) ||
      null
    );
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
    const workspaceRole = normalizeWorkspaceRole(payload.workspace_role, 'owner');
    const user = {
      ...payload,
      id: payload.id || createId('user'),
      workspace_id: payload.workspace_id || createId('ws'),
      created_at: payload.created_at || new Date().toISOString(),
    };
    delete user.workspace_role;

    const membership = {
      workspace_id: user.workspace_id,
      user_id: getMembershipUserId(user),
      app_user_id: user.id,
      role: workspaceRole,
      created_at: user.created_at,
    };

    await withDb((current) => ({
      ...current,
      workspaces: (current.workspaces || []).some((workspace) => workspace.id === user.workspace_id)
        ? current.workspaces || []
        : [
            {
              id: user.workspace_id,
              name: `${user.full_name || 'New User'} Workspace`,
              created_at: user.created_at,
            },
            ...(current.workspaces || []),
          ],
      users: [user, ...(current.users || [])],
      workspaceMembers: [
        membership,
        ...(current.workspaceMembers || []).filter(
          (entry) => !(entry.workspace_id === membership.workspace_id && entry.user_id === membership.user_id)
        ),
      ],
    }));

    return user;
  },

  async createUserInWorkspace(payload) {
    const user = {
      ...payload,
      id: payload.id || createId('user'),
      created_at: payload.created_at || new Date().toISOString(),
    };

    await withDb((current) => ({
      ...current,
      users: [user, ...(current.users || [])],
    }));

    return user;
  },

  async upsertWorkspaceMembership(payload) {
    const workspaceId = String(payload?.workspace_id || '').trim();
    const memberUserId = String(payload?.user_id || '').trim();
    if (!workspaceId || !memberUserId) return null;

    let nextMembership = null;

    await withDb((current) => {
      const existingMembers = current.workspaceMembers || [];
      const existing = existingMembers.find(
        (entry) => entry.workspace_id === workspaceId && String(entry.user_id || '').trim() === memberUserId
      );

      nextMembership = {
        workspace_id: workspaceId,
        user_id: memberUserId,
        app_user_id: payload?.app_user_id || existing?.app_user_id || null,
        role: normalizeWorkspaceRole(payload?.role, existing?.role || 'member'),
        created_at: existing?.created_at || payload?.created_at || new Date().toISOString(),
      };

      return {
        ...current,
        workspaceMembers: [
          nextMembership,
          ...existingMembers.filter(
            (entry) => !(entry.workspace_id === workspaceId && String(entry.user_id || '').trim() === memberUserId)
          ),
        ],
      };
    });

    return nextMembership;
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

  async deleteWorkspaceMembership(user, memberUserId) {
    const workspaceId = getUserWorkspaceId(user);
    const normalizedMemberUserId = String(memberUserId || '').trim();
    if (!workspaceId || !normalizedMemberUserId) return null;

    await withDb((current) => ({
      ...current,
      workspaceMembers: (current.workspaceMembers || []).filter(
        (entry) => !(entry.workspace_id === workspaceId && String(entry.user_id || '').trim() === normalizedMemberUserId)
      ),
    }));

    return { workspace_id: workspaceId, user_id: normalizedMemberUserId };
  },

  async listLeads(user, sort = '-created_at') {
    let leads = filterByUserScope((await readDb()).leads || [], user).filter((l) => !l.deleted_at);
    if (sort === '-created_date' || sort === '-created_at') {
      leads = [...leads].sort((left, right) => {
        const rightTs = toTimestamp(right?.created_at || right?.created_date);
        const leftTs = toTimestamp(left?.created_at || left?.created_date);
        return rightTs - leftTs;
      });
    }
    return leads;
  },

  async listWorkspaceMembers(user) {
    const workspaceId = getUserWorkspaceId(user);
    const db = await readDb();
    const members = (db.workspaceMembers || []).filter((entry) => entry.workspace_id === workspaceId);

    if (members.length === 0) {
      return [];
    }

    return members.map((member) => mapWorkspaceMember(member, db.users || [], user));
  },

  async listWorkspaceInvites(user) {
    const workspaceId = getUserWorkspaceId(user);
    const db = await readDb();
    return (db.workspaceInvites || [])
      .filter((invite) => invite.workspace_id === workspaceId && isActiveWorkspaceInvite(invite))
      .sort((left, right) => toTimestamp(right.created_at) - toTimestamp(left.created_at))
      .map((invite) => toWorkspaceInviteView(invite));
  },

  async findActiveWorkspaceInviteByEmail(email) {
    const db = await readDb();
    const normalizedEmail = normalizeEmail(email);
    const invite =
      (db.workspaceInvites || [])
        .filter((inviteRow) => normalizeEmail(inviteRow.email) === normalizedEmail && isActiveWorkspaceInvite(inviteRow))
        .sort((left, right) => toTimestamp(right.created_at) - toTimestamp(left.created_at))[0] || null;
    return invite ? toWorkspaceInviteView(invite) : null;
  },

  async createWorkspaceInvite(user, payload) {
    const workspaceId = getUserWorkspaceId(user);
    const normalizedEmail = normalizeEmail(payload.email);
    const role = normalizeWorkspaceRole(payload.role, 'member');
    const createdAt = new Date().toISOString();
    let createdInvite = null;

      await withDb((current) => {
        const users = current.users || [];
        const invites = current.workspaceInvites || [];
        const existingUser = users.find((entry) => normalizeEmail(entry.email) === normalizedEmail);
        const existingMembership = existingUser
          ? (current.workspaceMembers || []).find(
              (entry) =>
                String(entry?.app_user_id || '').trim() === String(existingUser.id || '').trim()
                || String(entry?.user_id || '').trim() === String(existingUser.supabase_auth_id || existingUser.id || '').trim()
            ) || null
          : null;
        const existingUserWorkspaceId = String(existingMembership?.workspace_id || '').trim();

        if (existingUserWorkspaceId === workspaceId) {
          const error = new Error('This user is already a member of your workspace.');
          error.status = 409;
          throw error;
        }

        if (existingUser && existingUserWorkspaceId && existingUserWorkspaceId !== workspaceId) {
          const error = new Error('This email already belongs to another workspace account.');
          error.status = 409;
          throw error;
        }

      const existingInvite = invites.find(
        (invite) => normalizeEmail(invite.email) === normalizedEmail && isActiveWorkspaceInvite(invite)
      );

      if (existingInvite && existingInvite.workspace_id !== workspaceId) {
        const error = new Error('This email already has a pending invite in another workspace.');
        error.status = 409;
        throw error;
      }

      if (existingInvite) {
        createdInvite = {
          ...existingInvite,
          role,
          invited_by_user_id: user.id,
        };

        return {
          ...current,
          workspaceInvites: invites.map((invite) => (invite.id === existingInvite.id ? createdInvite : invite)),
        };
      }

      createdInvite = {
        id: createId('invite'),
        workspace_id: workspaceId,
        email: normalizedEmail,
        role,
        invited_by_user_id: user.id,
        created_at: createdAt,
        accepted_at: null,
        accepted_by_user_id: null,
        revoked_at: null,
      };

      return {
        ...current,
        workspaceInvites: [createdInvite, ...invites],
      };
    });

    return toWorkspaceInviteView(createdInvite);
  },

  async revokeWorkspaceInvite(user, inviteId) {
    const workspaceId = getUserWorkspaceId(user);
    const normalizedInviteId = String(inviteId || '').trim();
    let revokedInvite = null;

    await withDb((current) => {
      const invites = current.workspaceInvites || [];
      const nextInvites = invites.map((invite) => {
        if (invite.id !== normalizedInviteId || invite.workspace_id !== workspaceId || !isActiveWorkspaceInvite(invite)) {
          return invite;
        }

        revokedInvite = {
          ...invite,
          revoked_at: new Date().toISOString(),
        };
        return revokedInvite;
      });

      return {
        ...current,
        workspaceInvites: nextInvites,
      };
    });

    return revokedInvite ? toWorkspaceInviteView(revokedInvite) : null;
  },

  async consumeWorkspaceInviteByEmail(email, { accepted_by_user_id } = {}) {
    const normalizedEmail = normalizeEmail(email);
    let acceptedInvite = null;

    await withDb((current) => ({
      ...current,
      workspaceInvites: (current.workspaceInvites || []).map((invite) => {
        if (normalizeEmail(invite.email) !== normalizedEmail || !isActiveWorkspaceInvite(invite)) {
          return invite;
        }

        acceptedInvite = {
          ...invite,
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: accepted_by_user_id || invite.accepted_by_user_id || null,
        };
        return acceptedInvite;
      }),
    }));

    return acceptedInvite ? toWorkspaceInviteView(acceptedInvite) : null;
  },

  async updateWorkspaceMemberRole(user, memberUserId, role) {
    const workspaceId = getUserWorkspaceId(user);
    const normalizedMemberUserId = String(memberUserId || '').trim();
    const nextRole = normalizeWorkspaceRole(role, 'member');
    let updatedMember = null;

    await withDb((current) => ({
      ...current,
      workspaceMembers: (current.workspaceMembers || []).map((entry) => {
        if (entry.workspace_id !== workspaceId || String(entry.user_id || '').trim() !== normalizedMemberUserId) {
          return entry;
        }

        updatedMember = {
          ...entry,
          role: nextRole,
        };
        return updatedMember;
      }),
    }));

    if (!updatedMember) return null;

    const db = await readDb();
    return mapWorkspaceMember(updatedMember, db.users || []);
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
        created_at: payload.created_at || payload.created_date || new Date().toISOString(),
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
          created_at: row.created_at || row.created_date || new Date().toISOString(),
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
            created_at: new Date().toISOString(),
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
        created_at: payload.created_at || payload.created_date || new Date().toISOString(),
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
  const unsupportedIcpColumns = new Set();

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

    while (attempts < 20) {
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

  const requestIcpProfilesWithCompatibility = async (
    user,
    {
      method = 'GET',
      query = {},
      body,
      returnRepresentation = true,
    } = {}
  ) => {
    let nextQuery = { ...(query || {}) };
    let nextBody = pruneUnsupportedColumnsFromBody(body, unsupportedIcpColumns);
    let attempts = 0;

    while (attempts < 20) {
      attempts += 1;
      try {
        return await request('icp_profiles', {
          method,
          query: nextQuery,
          body: nextBody,
          returnRepresentation,
        });
      } catch (error) {
        const missing = parseMissingColumnError(error);
        if (missing?.table === 'icp_profiles' && missing?.column) {
          if (unsupportedIcpColumns.has(missing.column)) {
            throw error;
          }

          unsupportedIcpColumns.add(missing.column);
          logger.warn('supabase_missing_icp_column_retrying_without_field', {
            column: missing.column,
            method,
          });

          delete nextQuery[missing.column];
          const prunedBody = pruneUnsupportedColumnsFromBody(nextBody, unsupportedIcpColumns);
          const queryChanged = JSON.stringify(nextQuery) !== JSON.stringify(query || {});
          const bodyChanged = JSON.stringify(nextBody ?? null) !== JSON.stringify(prunedBody ?? null);

          if (!queryChanged && !bodyChanged) {
            throw error;
          }

          nextBody = prunedBody;
          continue;
        }

        const required = parseRequiredColumnError(error, 'icp_profiles');
        if (required?.column === 'owner_user_id' && !unsupportedIcpColumns.has('owner_user_id')) {
          const ownerUserId = String(user?.app_user_id || user?.id || '').trim();
          if (!ownerUserId) {
            throw error;
          }

          const enrichedBody = applyLegacyOwnerUserId(nextBody, ownerUserId, unsupportedIcpColumns);
          if (JSON.stringify(nextBody ?? null) === JSON.stringify(enrichedBody ?? null)) {
            throw error;
          }

          logger.warn('supabase_legacy_icp_owner_user_required_retrying_with_field', {
            column: 'owner_user_id',
            method,
          });

          nextBody = enrichedBody;
          continue;
        }

        throw error;
      }
    }

    throw new Error('Supabase icp_profiles mutation failed after compatibility attempts');
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

    async findFirstWorkspaceMembershipForUser(user) {
      const membershipUserId = getMembershipUserId(user);
      const appUserId = String(user?.id || '').trim();

      const query = {
        order: 'created_at.asc',
        limit: '1',
      };

      if (membershipUserId) {
        query.user_id = `eq.${membershipUserId}`;
      } else if (appUserId) {
        query.app_user_id = `eq.${appUserId}`;
      } else {
        return null;
      }

      const rows = await request('workspace_members', {
        method: 'GET',
        query,
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

    async deleteWorkspaceMembership(user, memberUserId) {
      const workspaceId = getUserWorkspaceId(user);
      const normalizedMemberUserId = String(memberUserId || '').trim();
      if (!workspaceId || !normalizedMemberUserId) return null;

      await request('workspace_members', {
        method: 'DELETE',
        query: {
          workspace_id: `eq.${workspaceId}`,
          user_id: `eq.${normalizedMemberUserId}`,
        },
        returnRepresentation: false,
      });

      return {
        workspace_id: workspaceId,
        user_id: normalizedMemberUserId,
      };
    },

    async createUser(payload) {
      const workspaceRole = normalizeWorkspaceRole(payload.workspace_role, 'owner');
      const user = {
        ...payload,
        id: payload.id || createId('user'),
        workspace_id: payload.workspace_id || createId('ws'),
        created_at: payload.created_at || new Date().toISOString(),
      };
      delete user.workspace_role;

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
            user_id: getMembershipUserId(user),
            app_user_id: user.id,
            role: workspaceRole,
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

    async createUserInWorkspace(payload) {
      const user = {
        ...payload,
        id: payload.id || createId('user'),
        created_at: payload.created_at || new Date().toISOString(),
      };

      const rows = await requestUsersWithSchemaFallback({
        method: 'POST',
        body: user,
      });

      return firstOrNull(rows) || user;
    },

    async upsertWorkspaceMembership(payload) {
      const workspaceId = String(payload?.workspace_id || '').trim();
      const memberUserId = String(payload?.user_id || '').trim();
      if (!workspaceId || !memberUserId) return null;

      const existingRows = await request('workspace_members', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          user_id: `eq.${memberUserId}`,
          limit: '1',
        },
      });

      const existing = firstOrNull(existingRows);

      if (existing) {
        const rows = await request('workspace_members', {
          method: 'PATCH',
          query: {
            workspace_id: `eq.${workspaceId}`,
            user_id: `eq.${memberUserId}`,
          },
          body: {
            role: normalizeWorkspaceRole(payload?.role, existing.role || 'member'),
          },
        });

        return firstOrNull(rows) || { ...existing, role: normalizeWorkspaceRole(payload?.role, existing.role || 'member') };
      }

      const membership = {
        workspace_id: workspaceId,
        user_id: memberUserId,
        app_user_id: payload?.app_user_id || null,
        role: normalizeWorkspaceRole(payload?.role),
        created_at: payload?.created_at || new Date().toISOString(),
      };

      const rows = await request('workspace_members', {
        method: 'POST',
        body: membership,
      });

      return firstOrNull(rows) || membership;
    },

    async listLeads(user, sort = '-created_at') {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('leads', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          deleted_at: 'is.null',
          ...((sort === '-created_date' || sort === '-created_at') ? { order: 'created_at.desc' } : {}),
        },
      });

      return Array.isArray(rows) ? rows : [];
    },

    async listWorkspaceMembers(user) {
      const workspaceId = getUserWorkspaceId(user);
      try {
        const memberRows = await request('workspace_members', {
          method: 'GET',
          query: {
            workspace_id: `eq.${workspaceId}`,
            order: 'created_at.asc',
          },
        });
        if (!Array.isArray(memberRows) || memberRows.length === 0) {
          return [];
        }

        const appUserIds = [...new Set(
          memberRows
            .map((row) => String(row?.app_user_id || '').trim())
            .filter(Boolean)
        )];
        const membershipUserIds = [...new Set(
          memberRows
            .map((row) => String(row?.user_id || '').trim())
            .filter(Boolean)
        )];

        const usersByAppId = appUserIds.length > 0
          ? await request('users', {
              method: 'GET',
              query: {
                id: `in.(${appUserIds.join(',')})`,
                order: 'created_at.asc',
              },
            }).catch(() => [])
          : [];

        const usersByAuthId =
          (!Array.isArray(usersByAppId) || usersByAppId.length === 0) && membershipUserIds.length > 0
            ? await request('users', {
                method: 'GET',
                query: {
                  supabase_auth_id: `in.(${membershipUserIds.join(',')})`,
                  order: 'created_at.asc',
                },
              }).catch(() => [])
            : [];

        const users = Array.isArray(usersByAppId) && usersByAppId.length > 0 ? usersByAppId : usersByAuthId;

        return memberRows.map((row) => mapWorkspaceMember(row, Array.isArray(users) ? users : [], user));
      } catch {
        return [];
      }
    },

    async listWorkspaceInvites(user) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await request('workspace_invites', {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          accepted_at: 'is.null',
          revoked_at: 'is.null',
          order: 'created_at.desc',
        },
      });

      return Array.isArray(rows) ? rows.map((row) => toWorkspaceInviteView(row)) : [];
    },

    async findActiveWorkspaceInviteByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const rows = await request('workspace_invites', {
        method: 'GET',
        query: {
          email: `eq.${normalizedEmail}`,
          accepted_at: 'is.null',
          revoked_at: 'is.null',
          order: 'created_at.desc',
          limit: '1',
        },
      });

      const invite = firstOrNull(rows);
      return invite ? toWorkspaceInviteView(invite) : null;
    },

    async createWorkspaceInvite(user, payload) {
      const workspaceId = getUserWorkspaceId(user);
      const normalizedEmail = normalizeEmail(payload.email);
      const role = normalizeWorkspaceRole(payload.role, 'member');
      const existingUser = await this.findUserByEmail(normalizedEmail);
      const existingMembership = existingUser
        ? await this.findFirstWorkspaceMembershipForUser(existingUser).catch(() => null)
        : null;
      const existingUserWorkspaceId = String(existingMembership?.workspace_id || '').trim();

      if (existingUserWorkspaceId === workspaceId) {
        const error = new Error('This user is already a member of your workspace.');
        error.status = 409;
        throw error;
      }

      if (existingUser && existingUserWorkspaceId && existingUserWorkspaceId !== workspaceId) {
        const error = new Error('This email already belongs to another workspace account.');
        error.status = 409;
        throw error;
      }

      const existingInvite = await this.findActiveWorkspaceInviteByEmail(normalizedEmail);
      if (existingInvite && existingInvite.workspace_id !== workspaceId) {
        const error = new Error('This email already has a pending invite in another workspace.');
        error.status = 409;
        throw error;
      }

      if (existingInvite) {
        const rows = await request('workspace_invites', {
          method: 'PATCH',
          query: {
            id: `eq.${existingInvite.id}`,
            workspace_id: `eq.${workspaceId}`,
          },
          body: {
            role,
            invited_by_user_id: user.id,
          },
        });

        return toWorkspaceInviteView(firstOrNull(rows) || { ...existingInvite, role, invited_by_user_id: user.id });
      }

      const invite = {
        id: createId('invite'),
        workspace_id: workspaceId,
        email: normalizedEmail,
        role,
        invited_by_user_id: user.id,
        created_at: new Date().toISOString(),
        accepted_at: null,
        accepted_by_user_id: null,
        revoked_at: null,
      };

      const rows = await request('workspace_invites', {
        method: 'POST',
        body: invite,
      });

      return toWorkspaceInviteView(firstOrNull(rows) || invite);
    },

    async revokeWorkspaceInvite(user, inviteId) {
      const workspaceId = getUserWorkspaceId(user);
      const normalizedInviteId = String(inviteId || '').trim();
      const rows = await request('workspace_invites', {
        method: 'PATCH',
        query: {
          id: `eq.${normalizedInviteId}`,
          workspace_id: `eq.${workspaceId}`,
          accepted_at: 'is.null',
          revoked_at: 'is.null',
        },
        body: {
          revoked_at: new Date().toISOString(),
        },
      });

      const invite = firstOrNull(rows);
      return invite ? toWorkspaceInviteView(invite) : null;
    },

    async consumeWorkspaceInviteByEmail(email, { accepted_by_user_id } = {}) {
      const normalizedEmail = normalizeEmail(email);
      const rows = await request('workspace_invites', {
        method: 'PATCH',
        query: {
          email: `eq.${normalizedEmail}`,
          accepted_at: 'is.null',
          revoked_at: 'is.null',
        },
        body: {
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: accepted_by_user_id || null,
        },
      });

      const invite = firstOrNull(rows);
      return invite ? toWorkspaceInviteView(invite) : null;
    },

    async updateWorkspaceMemberRole(user, memberUserId, role) {
      const workspaceId = getUserWorkspaceId(user);
      const normalizedMemberUserId = String(memberUserId || '').trim();
      const nextRole = normalizeWorkspaceRole(role, 'member');
      const rows = await request('workspace_members', {
        method: 'PATCH',
        query: {
          workspace_id: `eq.${workspaceId}`,
          user_id: `eq.${normalizedMemberUserId}`,
        },
        body: {
          role: nextRole,
        },
      });

      const updated = firstOrNull(rows);
      if (!updated) return null;

      const users = updated?.app_user_id
        ? await request('users', {
            method: 'GET',
            query: {
              id: `eq.${updated.app_user_id}`,
              limit: '1',
            },
          }).catch(() => [])
        : updated?.user_id
          ? await request('users', {
              method: 'GET',
              query: {
                supabase_auth_id: `eq.${updated.user_id}`,
                limit: '1',
              },
            }).catch(() => [])
          : [];

      return mapWorkspaceMember(updated, Array.isArray(users) ? users : [], user);
    },

    async filterLeads(user, where = {}) {
      const workspaceId = getUserWorkspaceId(user);
      const query = { workspace_id: `eq.${workspaceId}`, deleted_at: 'is.null' };

      // Whitelist allowed filter fields to prevent PostgREST operator injection
      const ALLOWED_FILTER_FIELDS = new Set([
        'status', 'follow_up_status', 'source_list', 'icp_profile_id',
        'industry', 'country', 'icp_category', 'final_category',
        'llm_enriched', 'created_at', 'id',
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
          created_at: payload.created_at || payload.created_date || new Date().toISOString(),
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
            created_at: row.created_at || row.created_date || new Date().toISOString(),
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
      const rows = await requestIcpProfilesWithCompatibility(user, {
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

      const rows = await requestIcpProfilesWithCompatibility(user, { method: 'GET', query });
      return Array.isArray(rows) ? rows : [];
    },

    async getIcpProfileById(user, profileId) {
      const workspaceId = getUserWorkspaceId(user);
      const rows = await requestIcpProfilesWithCompatibility(user, {
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
      const activeRows = await requestIcpProfilesWithCompatibility(user, {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          is_active: 'eq.true',
          limit: '1',
        },
      });

      const active = firstOrNull(activeRows);
      if (active) return active;

      const fallbackRows = await requestIcpProfilesWithCompatibility(user, {
        method: 'GET',
        query: {
          workspace_id: `eq.${workspaceId}`,
          order: 'created_at.desc',
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

      await requestIcpProfilesWithCompatibility(user, {
        method: 'PATCH',
        query: {
          workspace_id: `eq.${workspaceId}`,
        },
        body: { is_active: false },
        returnRepresentation: false,
      });

      if (payload.id) {
        const rows = await requestIcpProfilesWithCompatibility(user, {
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
          created_at: new Date().toISOString(),
        },
        user
      );

      const rows = await requestIcpProfilesWithCompatibility(user, {
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
          created_at: payload.created_at || payload.created_date || new Date().toISOString(),
        },
        user
      );

      const rows = await requestIcpProfilesWithCompatibility(user, {
        method: 'POST',
        body: profile,
      });

      return firstOrNull(rows) || profile;
    },

    async updateIcpProfile(user, profileId, updates) {
      const workspaceId = getUserWorkspaceId(user);

      const rows = await requestIcpProfilesWithCompatibility(user, {
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

      await requestIcpProfilesWithCompatibility(user, {
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
        unsupported_icp_columns: [...unsupportedIcpColumns],
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
        column: 'intent_signals',
        unsupportedSet: unsupportedLeadColumns,
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

      await probeColumn({
        table: 'icp_profiles',
        column: 'owner_user_id',
        unsupportedSet: unsupportedIcpColumns,
      });

      return this.getDiagnostics();
    },
  };
};

const dataStoreRuntime = {
  configuredProvider: getDataProvider(),
  activeProvider: getDataProvider(),
  fallbackReason: null,
};
const provider = getDataProvider() === 'supabase' ? createSupabaseClient() : localStore;

export const dataStore = provider;
export const getDataStoreRuntime = () => ({ ...dataStoreRuntime });
