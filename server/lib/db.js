import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveDbPath = () => {
  const custom = String(process.env.DB_FILE_PATH || '').trim();
  if (custom) {
    return path.resolve(custom);
  }

  return path.resolve(__dirname, '../data/db.json');
};

const defaultDb = {
  users: [],
  leads: [],
  icpProfiles: [],
};

let dbQueue = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeDb = (parsed = {}) => ({
  users: Array.isArray(parsed.users) ? parsed.users : [],
  leads: Array.isArray(parsed.leads) ? parsed.leads : [],
  icpProfiles: Array.isArray(parsed.icpProfiles) ? parsed.icpProfiles : [],
});

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

async function readDbFromDisk(retries = 3) {
  const dbPath = resolveDbPath();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const raw = await fs.readFile(dbPath, 'utf-8');
      const parsed = parseJson(raw);
      if (parsed) return normalizeDb(parsed);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { ...defaultDb };
      }
    }

    await wait(50 * (attempt + 1));
  }

  return { ...defaultDb };
}

async function writeDbToDisk(nextDb) {
  const dbPath = resolveDbPath();
  const payload = JSON.stringify(normalizeDb(nextDb), null, 2);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, payload, 'utf-8');
}

function enqueue(task) {
  const run = dbQueue.then(task, task);
  dbQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function readDb() {
  return enqueue(() => readDbFromDisk());
}

export async function writeDb(nextDb) {
  return enqueue(async () => {
    await writeDbToDisk(nextDb);
    return normalizeDb(nextDb);
  });
}

export async function withDb(mutator) {
  return enqueue(async () => {
    const current = await readDbFromDisk();
    const next = await mutator(current);
    const normalized = normalizeDb(next);
    await writeDbToDisk(normalized);
    return normalized;
  });
}
