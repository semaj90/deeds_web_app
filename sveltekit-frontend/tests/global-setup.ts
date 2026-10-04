/**
 * Playwright Global Setup — seeds test case data before the test suite runs.
 *
 * Strategy: POST to /api/cases via the running dev server. DEV_BYPASS_AUTH auto-authenticates
 * as the dev admin user (00000000-0000-0000-0000-000000000001), which is the same identity
 * that browser tests use. This ensures seeded cases appear when navigating /cases.
 *
 * Also hard-deletes any stale [PW-TEST] cases from previous runs before seeding.
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { request as playwrightRequest } from '@playwright/test';
import {
  TEST_CASE_SEED,
  TEST_CASE_PREFIX,
  TEST_IDS_FILE,
} from './fixtures/test-cases.js';
import { PORTS, env } from './helpers/env-ports.js';
import { HEALTHY_DATABASE, classifyPostgresError, type DatabaseReadinessClassification } from '../src/lib/server/db/readiness.js';

const BASE_URL = PORTS.APP_BASE;
// No credential literals in source: DATABASE_URL resolves from process.env > .env.local > .env
// (env-ports helper). If none is set, DB cleanup is skipped with a warning.
const DB_URL = process.env.DATABASE_URL || env('DATABASE_URL', '');
const DB_READY_TIMEOUT_MS = Number(env('PLAYWRIGHT_DB_READY_TIMEOUT_MS', '90000'));

/**
 * Wait for PostgreSQL to accept queries. Distinguishes STARTING (crash recovery /
 * SQLSTATE 57P03: keep waiting) from UNAVAILABLE (retry briefly; non-retryable
 * auth/config failures stop immediately). Never throws; returns the last classification.
 */
async function waitForDatabaseReady(connectionString: string): Promise<DatabaseReadinessClassification> {
  const deadline = Date.now() + DB_READY_TIMEOUT_MS;
  let last = classifyPostgresError(new Error('database readiness not attempted'));
  while (Date.now() < deadline) {
    const probe = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
    try {
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end().catch(() => {});
      return HEALTHY_DATABASE;
    } catch (err) {
      await probe.end().catch(() => {});
      last = classifyPostgresError(err);
      if (!last.retryable) return last;
      console.log(`   ⏳  DB ${last.state} (${last.reason}); retrying …`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return last;
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_SKIP_GLOBAL_SETUP === 'true') {
    console.log('\n🌱  [global-setup] Skipped via PLAYWRIGHT_SKIP_GLOBAL_SETUP\n');
    return;
  }

  console.log('\n🌱  [global-setup] Cleaning up stale test cases …');

  // Hard-delete any leftover [PW-TEST] cases from previous runs
  const readiness = DB_URL ? await waitForDatabaseReady(DB_URL) : null;
  const pool = new pg.Pool({ connectionString: DB_URL || undefined });
  try {
    if (!readiness || readiness.state !== 'healthy') {
      throw new Error(`database ${readiness?.state ?? 'not configured'} (${readiness?.reason ?? 'NO_DATABASE_URL'})`);
    }
    const result = await pool.query(`DELETE FROM cases WHERE title LIKE $1 RETURNING title`, [
      `${TEST_CASE_PREFIX}%`,
    ]);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`   🗑️  Removed ${result.rowCount} stale test case(s) from previous runs`);
    } else {
      console.log('   ✓  No stale test cases to clean up');
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not clean stale cases (DB may be unavailable): ${err}`);
  } finally {
    await pool.end();
  }

  // Use a plain API context (no demo-login). DEV_BYPASS_AUTH auto-authenticates
  // as user 00000000-0000-0000-0000-000000000001 — the same identity browser tests get.
  console.log('🌱  [global-setup] Seeding test cases via /api/cases (DEV_BYPASS_AUTH) …');

  const createdIds: string[] = [];
  const apiContext = await playwrightRequest.newContext({ baseURL: BASE_URL });

  try {
    for (const seedCase of TEST_CASE_SEED) {
      const res = await apiContext.post('/api/cases', {
        data: seedCase,
      });

      if (res.ok()) {
        const payload = await res.json();
        const id: string = payload?.data?.case?.id ?? payload?.data?.id ?? payload?.id;
        if (id) {
          createdIds.push(id);
          console.log(`   ✅  Created: "${seedCase.title}" → ${id}`);
        } else {
          console.warn(`   ⚠️  Created but no ID returned for: "${seedCase.title}"`);
        }
      } else {
        const text = await res.text().catch(() => '');
        console.warn(`   ⚠️  Failed to create "${seedCase.title}" (${res.status()}): ${text}`);
      }
    }
  } finally {
    await apiContext.dispose();
  }

  // Persist IDs for teardown
  const idsFilePath = path.resolve(TEST_IDS_FILE);
  await mkdir(path.dirname(idsFilePath), { recursive: true });
  await writeFile(idsFilePath, JSON.stringify({ ids: createdIds }, null, 2));

  console.log(
    `🌱  [global-setup] Done — seeded ${createdIds.length}/${TEST_CASE_SEED.length} cases\n`
  );
}
