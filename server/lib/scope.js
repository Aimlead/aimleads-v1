export const getUserWorkspaceContext = (user) => {
  if (!user) {
    return {
      workspaceId: '',
      role: null,
      appUserId: null,
    };
  }

  const context = user.workspace_context || user.membership || null;
  if (context?.workspace_id) {
    return {
      workspaceId: String(context.workspace_id).trim(),
      role: context.role || user.workspace_role || null,
      appUserId: context.app_user_id || user.app_user_id || user.id || null,
    };
  }

  return {
    workspaceId: '',
    role: null,
    appUserId: user.app_user_id || user.id || null,
  };
};

export const getUserWorkspaceId = (user) => {
  return getUserWorkspaceContext(user).workspaceId;
};

export const isRecordScopedToUser = (record, user) => {
  if (!record || !user) return false;

  const workspaceId = getUserWorkspaceId(user);
  const recordWorkspaceId = String(record.workspace_id || '').trim();

  return Boolean(workspaceId && recordWorkspaceId && recordWorkspaceId === workspaceId);
};

export const filterByUserScope = (items = [], user) => {
  return items.filter((item) => isRecordScopedToUser(item, user));
};

export const withUserScope = (payload, user) => {
  return {
    ...payload,
    workspace_id: getUserWorkspaceId(user),
  };
};
