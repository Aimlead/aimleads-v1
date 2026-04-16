import { readDb, withDb } from './db.js';
import { getDataProvider, getRuntimeConfig } from './config.js';
import { logger } from './observability.js';

const warnedSupabaseMissingTable = new Set();

export const FEATURE_FLAG_DEFINITIONS = [
  {
    flag_name: 'async_jobs',
    label: 'Async jobs',
    description: 'Prepare queue-backed AI jobs and polling workflows before a wider rollout.',
    category: 'platform',
    default_enabled: false,
  },
  {
    flag_name: 'notifications_center',
    label: 'Notification center',
    description: 'Enable the future in-app notification center once it is ready for this workspace.',
    category: 'product',
    default_enabled: false,
  },
  {
    flag_name: 'dark_mode',
    label: 'Dark mode',
    description: 'Unlock the upcoming workspace theme toggle for internal or pilot workspaces first.',
    category: 'experience',
    default_enabled: false,
  },
];

const FEATURE_FLAGS_BY_NAME = new Map(FEATURE_FLAG_DEFINITIONS.map((flag) => [flag.flag_name, flag]));

const normalizeFlagName = (value) => String(value || '').trim().toLowerCase();
const boolFromValue = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const ensureKnownFlag = (flagName) => {
  const normalized = normalizeFlagName(flagName);
  const definition = FEATURE_FLAGS_BY_NAME.get(normalized);
  if (!definition) {
    const error = new Error(`Unknown feature flag: ${flagName}`);
    error.status = 404;
    throw error;
  }
  return definition;
};

const buildDefaultFlags = () =>
  FEATURE_FLAG_DEFINITIONS.map((definition) => ({
    ...definition,
    enabled: definition.default_enabled,
    updated_at: null,
    updated_by_user_id: null,
  }));

const mergeDefinitionsWithRows = (rows = []) => {
  const byFlag = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [normalizeFlagName(row?.flag_name), row])
  );

  return FEATURE_FLAG_DEFINITIONS.map((definition) => {
    const stored = byFlag.get(definition.flag_name);
    return {
      ...definition,
      enabled: stored ? boolFromValue(stored.enabled, definition.default_enabled) : definition.default_enabled,
      updated_at: stored?.updated_at || null,
      updated_by_user_id: stored?.updated_by_user_id || null,
    };
  });
};

const getSupabaseBase = () => {
  const config = getRuntimeConfig();
  return config.supabase.url.replace(/\/$/, '');
};

const getServiceHeaders = (prefer = 'return=representation') => {
  const config = getRuntimeConfig();
  const key = config.supabase.serviceRoleKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: prefer,
  };
};

const isMissingTableError = (status, payload) => {
  const text = [payload?.message, payload?.hint, payload?.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return status === 404 || text.includes('feature_flags') && (text.includes('does not exist') || text.includes('could not find'));
};

const warnMissingSupabaseTableOnce = (workspaceId, errorPayload = {}) => {
  const key = `${workspaceId || 'unknown'}:feature_flags`;
  if (warnedSupabaseMissingTable.has(key)) return;
  warnedSupabaseMissingTable.add(key);
  logger.warn('feature_flags_table_missing', {
    workspace_id: workspaceId || null,
    message: errorPayload?.message || null,
    hint: errorPayload?.hint || null,
  });
};

const fetchSupabaseFeatureFlags = async (workspaceId) => {
  const url = `${getSupabaseBase()}/rest/v1/feature_flags?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,flag_name,enabled,updated_at,updated_by_user_id`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getServiceHeaders(),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (isMissingTableError(response.status, payload)) {
      warnMissingSupabaseTableOnce(workspaceId, payload);
      return [];
    }

    const error = new Error(payload?.message || `Feature flags request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return Array.isArray(payload) ? payload : [];
};

const upsertSupabaseFeatureFlag = async (workspaceId, flagName, enabled, updatedByUserId) => {
  const body = {
    workspace_id: workspaceId,
    flag_name: flagName,
    enabled,
    updated_at: new Date().toISOString(),
    updated_by_user_id: updatedByUserId || null,
  };

  const url = `${getSupabaseBase()}/rest/v1/feature_flags?on_conflict=workspace_id,flag_name`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getServiceHeaders('resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (isMissingTableError(response.status, payload)) {
      warnMissingSupabaseTableOnce(workspaceId, payload);
      return {
        ...ensureKnownFlag(flagName),
        enabled,
        updated_at: body.updated_at,
        updated_by_user_id: updatedByUserId || null,
      };
    }

    const error = new Error(payload?.message || `Feature flag upsert failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  return {
    ...ensureKnownFlag(flagName),
    enabled: boolFromValue(row?.enabled, enabled),
    updated_at: row?.updated_at || body.updated_at,
    updated_by_user_id: row?.updated_by_user_id || updatedByUserId || null,
  };
};

export const listWorkspaceFeatureFlags = async (workspaceId) => {
  if (!workspaceId) return buildDefaultFlags();

  if (getDataProvider() === 'supabase') {
    const rows = await fetchSupabaseFeatureFlags(workspaceId);
    return mergeDefinitionsWithRows(rows);
  }

  const db = await readDb();
  const rows = (db.featureFlags || []).filter((entry) => String(entry?.workspace_id || '') === String(workspaceId));
  return mergeDefinitionsWithRows(rows);
};

export const setWorkspaceFeatureFlag = async ({
  workspaceId,
  flagName,
  enabled,
  updatedByUserId = null,
} = {}) => {
  const definition = ensureKnownFlag(flagName);
  if (!workspaceId) {
    const error = new Error('workspaceId is required');
    error.status = 400;
    throw error;
  }

  const normalizedEnabled = Boolean(enabled);

  if (getDataProvider() === 'supabase') {
    return upsertSupabaseFeatureFlag(workspaceId, definition.flag_name, normalizedEnabled, updatedByUserId);
  }

  let updatedRow = null;
  await withDb((current) => {
    const nextRows = [...(current.featureFlags || [])];
    const index = nextRows.findIndex(
      (entry) =>
        String(entry?.workspace_id || '') === String(workspaceId) &&
        normalizeFlagName(entry?.flag_name) === definition.flag_name
    );

    updatedRow = {
      workspace_id: workspaceId,
      flag_name: definition.flag_name,
      enabled: normalizedEnabled,
      updated_at: new Date().toISOString(),
      updated_by_user_id: updatedByUserId || null,
    };

    if (index >= 0) {
      nextRows[index] = updatedRow;
    } else {
      nextRows.unshift(updatedRow);
    }

    return {
      ...current,
      featureFlags: nextRows,
    };
  });

  return {
    ...definition,
    enabled: updatedRow.enabled,
    updated_at: updatedRow.updated_at,
    updated_by_user_id: updatedRow.updated_by_user_id,
  };
};

export const isFeatureFlagEnabled = async (workspaceId, flagName) => {
  const definition = ensureKnownFlag(flagName);
  const flags = await listWorkspaceFeatureFlags(workspaceId);
  const resolved = flags.find((flag) => flag.flag_name === definition.flag_name);
  return resolved ? Boolean(resolved.enabled) : Boolean(definition.default_enabled);
};
