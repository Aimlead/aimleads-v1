const normalize = (value) => String(value || '').trim().toLowerCase();

export const getUserWorkspaceId = (user) => {
  if (!user) return '';
  return user.workspace_id || `ws_${user.id}`;
};

const ownerMatchesUser = (ownerUserId, user) => {
  const owner = normalize(ownerUserId);
  if (!owner) return false;
  return owner === normalize(user?.id) || owner === normalize(user?.email);
};

export const isRecordScopedToUser = (record, user) => {
  if (!record || !user) return false;

  const workspaceId = getUserWorkspaceId(user);
  if (record.workspace_id) {
    return record.workspace_id === workspaceId;
  }

  if (record.owner_user_id) {
    return ownerMatchesUser(record.owner_user_id, user);
  }

  return false;
};

export const filterByUserScope = (items = [], user) => {
  return items.filter((item) => isRecordScopedToUser(item, user));
};

export const withUserScope = (payload, user) => {
  return {
    ...payload,
    owner_user_id: user.id,
    workspace_id: getUserWorkspaceId(user),
  };
};
