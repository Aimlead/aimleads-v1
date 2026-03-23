import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dbPath = path.resolve(root, 'server/data/db.json');
const outDir = path.resolve(root, 'supabase/export');

const normalizeDb = (parsed = {}) => ({
  users: Array.isArray(parsed.users) ? parsed.users : [],
  leads: Array.isArray(parsed.leads) ? parsed.leads : [],
  icpProfiles: Array.isArray(parsed.icpProfiles) ? parsed.icpProfiles : [],
});

const ensureWorkspaceId = (user) => user.workspace_id || `ws_${user.id}`;

const run = async () => {
  const raw = await fs.readFile(dbPath, 'utf8');
  const db = normalizeDb(JSON.parse(raw));

  const users = db.users.map((user) => ({
    ...user,
    workspace_id: ensureWorkspaceId(user),
  }));

  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [String(user.email || '').toLowerCase(), user]));
  const fallbackUser = users[0] || null;

  const resolveOwner = (ownerField) => {
    if (!ownerField) return fallbackUser;
    if (usersById.has(ownerField)) return usersById.get(ownerField);

    const byEmail = usersByEmail.get(String(ownerField).toLowerCase());
    if (byEmail) return byEmail;

    return fallbackUser;
  };

  const workspaces = [];
  const workspaceSeen = new Set();
  for (const user of users) {
    if (workspaceSeen.has(user.workspace_id)) continue;
    workspaceSeen.add(user.workspace_id);
    workspaces.push({
      id: user.workspace_id,
      name: user.full_name ? `${user.full_name} Workspace` : `Workspace ${user.workspace_id}`,
      created_at: user.created_at || new Date().toISOString(),
    });
  }

  const workspaceMembers = users.map((user) => ({
    workspace_id: user.workspace_id,
    user_id: user.id,
    role: 'owner',
    created_at: user.created_at || new Date().toISOString(),
  }));

  const icpProfiles = db.icpProfiles.map((profile) => {
    const owner = resolveOwner(profile.owner_user_id);
    return {
      ...profile,
      owner_user_id: owner?.id || null,
      workspace_id: profile.workspace_id || owner?.workspace_id || null,
    };
  });

  const leads = db.leads.map((lead) => {
    const owner = resolveOwner(lead.owner_user_id);
    return {
      ...lead,
      owner_user_id: owner?.id || null,
      workspace_id: lead.workspace_id || owner?.workspace_id || null,
    };
  });

  await fs.mkdir(outDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.resolve(outDir, 'workspaces.json'), JSON.stringify(workspaces, null, 2), 'utf8'),
    fs.writeFile(path.resolve(outDir, 'users.json'), JSON.stringify(users, null, 2), 'utf8'),
    fs.writeFile(path.resolve(outDir, 'workspace_members.json'), JSON.stringify(workspaceMembers, null, 2), 'utf8'),
    fs.writeFile(path.resolve(outDir, 'icp_profiles.json'), JSON.stringify(icpProfiles, null, 2), 'utf8'),
    fs.writeFile(path.resolve(outDir, 'leads.json'), JSON.stringify(leads, null, 2), 'utf8'),
  ]);

  console.log('Supabase export generated in:', outDir);
  console.log('Rows:', {
    workspaces: workspaces.length,
    users: users.length,
    workspace_members: workspaceMembers.length,
    icp_profiles: icpProfiles.length,
    leads: leads.length,
  });
};

run().catch((error) => {
  console.error('Export failed', error);
  process.exitCode = 1;
});
