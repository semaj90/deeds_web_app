import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema-postgres.ts';

const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

const getDatabaseUrl = () => process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
const getAdminDatabaseUrl = () => process.env.ADMIN_DATABASE_URL || getDatabaseUrl();

const createPool = (connectionString, maxClientsEnv) => {
  const max = Number(maxClientsEnv ?? '10');
  return new Pool({
    connectionString,
    max: Number.isNaN(max) ? 10 : max,
    ssl:
      process.env.PGSSLMODE === 'require'
        ? { rejectUnauthorized: process.env.PGSSLREJECTUNAUTHORIZED !== 'false' }
        : undefined,
  });
};

let runtimePool = null;
let adminPool = null;
let runtimeDb = null;
let adminDbInstance = null;

const ensureRuntimePool = () => {
  if (!runtimePool) {
    runtimePool = createPool(getDatabaseUrl(), process.env.PG_MAX_CLIENTS);
    runtimePool.on('error', (err) => console.error('[db] runtime pool error', err));
  }
  return runtimePool;
};

const ensureAdminPool = () => {
  if (!adminPool) {
    adminPool = createPool(getAdminDatabaseUrl(), process.env.PG_ADMIN_MAX_CLIENTS ?? '5');
    adminPool.on('error', (err) => console.error('[db] admin pool error', err));
  }
  return adminPool;
};

export const createRuntimeConnection = () => {
  if (!runtimeDb) {
    runtimeDb = drizzle(ensureRuntimePool(), { schema });
  }
  return runtimeDb;
};

export const createAdminConnection = () => {
  if (!adminDbInstance) {
    adminDbInstance = drizzle(ensureAdminPool(), { schema });
  }
  return adminDbInstance;
};

export const closeConnections = async () => {
  const closes = [];
  if (runtimePool) {
    closes.push(
      runtimePool.end().catch((err) => console.warn('[db] error closing runtime pool', err))
    );
    runtimePool = null;
    runtimeDb = null;
  }
  if (adminPool) {
    closes.push(adminPool.end().catch((err) => console.warn('[db] error closing admin pool', err)));
    adminPool = null;
    adminDbInstance = null;
  }
  await Promise.all(closes);
};

export const db = createRuntimeConnection();
export const adminDb = createAdminConnection();

export const pools = {
  get runtime() {
    return ensureRuntimePool();
  },
  get admin() {
    return ensureAdminPool();
  },
};

export * from './schema-postgres.ts';

export default {
  getDb: createRuntimeConnection,
  getAdminDb: createAdminConnection,
  closeConnections,
};
