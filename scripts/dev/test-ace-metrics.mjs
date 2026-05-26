#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execp = promisify(exec);

async function main() {
  const now = new Date().toISOString();
  const metrics = {
    cacheKey: 'test:ace:metrics:sample',
    cacheSource: 'local-json',
    contextCacheHit: true,
    reusedChunkCount: 3,
    promptTokensSavedEstimate: 120,
    timeSavedMsEstimate: 230,
    repoGitSha: process.env.GIT_SHA || null,
    packId: 'sample-pack-1',
    timeToFirstTokenMs: 450,
    tokensPerSecond: 12.3,
    promptTokens: 80,
    completionTokens: 256,
    cacheScenario: 'dev-test-no-cache',
    lastUsedAt: now,
  };

  // 1) Append local log
  const logDir = path.join(process.cwd(), 'logs', 'ace-context-cache');
  await fs.mkdir(logDir, { recursive: true });
  const logFile = path.join(logDir, 'latest.json');
  await fs.appendFile(logFile, JSON.stringify({ timestamp: now, metrics }) + '\n', 'utf8');
  console.log('Appended local log:', logFile);

  // 2) Write a snapshot file
  const snapDir = path.join(process.cwd(), 'tmp', 'ace-context-snapshots');
  await fs.mkdir(snapDir, { recursive: true });
  const snapPath = path.join(snapDir, `test-${Date.now()}.json`);
  await fs.writeFile(snapPath, JSON.stringify({ pack: { id: metrics.packId, createdAt: now, metrics } }, null, 2), 'utf8');
  console.log('Wrote snapshot:', snapPath);

  // 3) Insert a test row into Postgres (auto-detect container -> docker cp+exec, then local psql fallback)
  const pgUser = process.env.POSTGRES_USER || 'legal_admin';
  const pgDb = process.env.POSTGRES_DB || 'legal_ai_db';
  const pgPass = process.env.POSTGRES_PASSWORD || process.env.POSTGRES_PASSWORD_FILE || '';

  const metadataObj = metrics;
  const metadata = JSON.stringify(metadataObj).replace(/'/g, "''");
  const sqlContent = `INSERT INTO ace_retrieval_runs (query, intent, mode, model, query_embedding_model, expanded_terms, context_budget_tokens, final_context_tokens, metadata) VALUES ('test-ace-metrics','dev-test','context-pack','ace-context-pack',NULL,'{}',NULL,NULL,'${metadata}'::jsonb);`;

  // helper to try docker-based insertion
  async function tryDockerInsert() {
    try {
      const { stdout } = await execp('docker ps --format "{{.Names}} {{.Image}}"');
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      // find a container whose name or image looks like Postgres
      const pgLine = lines.find(l => /postgres|pgvector|legal-ai-postgres/i.test(l));
      if (!pgLine) return false;
      const container = pgLine.split(/\s+/)[0];
      const tmpLocal = path.join(process.cwd(), 'tmp', 'ace-insert.sql');
      await fs.mkdir(path.dirname(tmpLocal), { recursive: true });
      await fs.writeFile(tmpLocal, sqlContent, 'utf8');
      console.log('Found Postgres container:', container, '- copying SQL and executing');
      await execp(`docker cp ${tmpLocal} ${container}:/tmp/ace-insert.sql`);
      await execp(`docker exec ${container} psql -U ${pgUser} -d ${pgDb} -f /tmp/ace-insert.sql`);
      // cleanup inside container
      await execp(`docker exec ${container} rm -f /tmp/ace-insert.sql`).catch(()=>{});
      // cleanup local tmp file
      await fs.rm(tmpLocal).catch(()=>{});
      console.log('Inserted test row into Postgres via container', container);
      return true;
    } catch (e) {
      console.warn('Docker-based insert failed:', e.message || e);
      return false;
    }
  }

  // helper to try local psql
  async function tryLocalPsql() {
    if (!pgPass) {
      console.warn('No POSTGRES_PASSWORD provided; local psql insert skipped.');
      return false;
    }
    try {
      // check psql exists
      await execp('psql --version');
    } catch (e) {
      console.warn('Local psql not available in PATH:', e.message || e);
      return false;
    }
    const tmpLocal = path.join(process.cwd(), 'tmp', 'ace-insert.sql');
    await fs.writeFile(tmpLocal, sqlContent, 'utf8');
    const cmd = `psql -h ${process.env.POSTGRES_HOST || 'localhost'} -p ${process.env.POSTGRES_PORT || '5434'} -U ${pgUser} -d ${pgDb} -f ${tmpLocal}`;
    try {
      await execp(cmd, { env: { ...process.env, PGPASSWORD: pgPass } });
      await fs.rm(tmpLocal).catch(()=>{});
      console.log('Inserted test row into Postgres via local psql');
      return true;
    } catch (e) {
      console.warn('Local psql insert failed:', e.message || e);
      return false;
    }
  }

  // Try docker insert first
  if (await tryDockerInsert()) return;

  // Then try local psql
  if (await tryLocalPsql()) return;

  console.warn('Postgres insert skipped: no container found and local psql unavailable or no credentials provided. SQL written to', path.join(process.cwd(), 'tmp', 'ace-insert.sql'));
}

main().catch((e) => { console.error(e); process.exit(1); });
