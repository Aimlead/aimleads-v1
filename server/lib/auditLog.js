import { dataStore } from './dataStore.js';
import { createId } from './utils.js';
import { getUserWorkspaceId } from './scope.js';
import { logger } from './observability.js';

/**
 * Write an audit log entry. Fire-and-forget — does not throw.
 * @param {Object} opts
 * @param {Object} opts.user - authenticated user
 * @param {'create'|'update'|'delete'|'export'} opts.action
 * @param {'lead'|'icp_profile'|'workspace_invite'|'workspace_member'|'user_data'|'lead_export'} opts.resourceType
 * @param {string} opts.resourceId
 * @param {Object} [opts.changes] - key/value pairs that changed
 */
export const writeAuditLog = async ({ user, action, resourceType, resourceId, changes }) => {
  try {
    if (typeof dataStore.createAuditEntry !== 'function') return;

    await dataStore.createAuditEntry(user, {
      id: createId('audit'),
      workspace_id: getUserWorkspaceId(user),
      user_id: user.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      changes: changes || null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('audit_log_write_failed', {
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      error: error?.message,
    });
  }
};
