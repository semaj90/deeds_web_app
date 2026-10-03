#!/usr/bin/env node
/**
 * Daily Graphify ACE packet step (ENABLED BY DEFAULT, FAIL-CLOSED). Runs after phase-8 fan-out in
 * `graphify:daily:chain`. It never bypasses an admission gate and writes NOTHING to Postgres/Qdrant/Valkey
 * itself in this revision: it (1) enforces the canonical projection admission verdict, (2) counts packets the
 * pre-embedding guard would allow, and (3) writes an exclusive-create receipt saying exactly why packets were
 * or were not composed. Exit code is 0 for a recorded BLOCKED (the chain must not crash on a fail-closed skip);
 * 1 only for an unexpected error.
 *
 * Composition + BitFrost write are intentionally NOT wired here yet (status PACKET_COMPOSITION_NOT_WIRED):
 * they must go through packages/parent-atlas buildAcePacketV3 + AcePacketWriter.writeRevisionQualifiedV3ToBitfrost
 * (TTL <= 86400 s, `embedAllowedPacketKeys` from this census) once REVISION_QUALIFIED is proven.
 *
 *   node scripts/atlas/graphify-daily-ace-packet-step-v1.mjs [--disable]   (ATLAS_DAILY_ACE_PACKETS=0 also disables)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { ENRICHMENT_READINESS_CTE_V1 } from './lib/enrichment-readiness-sql-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

export const ACE_DAILY_TTL_SECONDS = 86_400; // writer hard cap; 7-day WARM tier is a separate, later decision
const disabled = process.argv.includes('--disable') || process.env.ATLAS_DAILY_ACE_PACKETS === '0';
const receipt = {
  schema: 'atlas.graphify-daily-ace-packet-step.v1', generatedAt: new Date().toISOString(),
  enabledByDefault: true, disabled, ttlSeconds: ACE_DAILY_TTL_SECONDS,
  status: 'BLOCKED', reasons: [], admission: null, embedAllowedPackets: null, packetsComposed: 0, cacheWrites: 0, canonicalWrites: 0,
};
const finish = (code = 0) => {
  const out = path.join(REPO_ROOT, 'docs', 'reports', `graphify-daily-ace-packet-step-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: receipt.status, reasons: receipt.reasons, embedAllowedPackets: receipt.embedAllowedPackets, cacheWrites: 0, receipt: path.relative(REPO_ROOT, out) }, null, 2));
  process.exit(code);
};

if (disabled) { receipt.status = 'DISABLED_BY_OPERATOR'; receipt.reasons.push('EXPLICIT_DISABLE'); finish(0); }

try {
  // 1) same admission gate the daily chain uses; a NOT_SAFE verdict blocks this step too
  try {
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts/atlas/require-canonical-projection-admission-v1.mjs')], { cwd: REPO_ROOT, stdio: 'pipe', timeout: 10 * 60 * 1000 });
    receipt.admission = 'SAFE_TO_PROJECT';
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    receipt.admission = /NOT_SAFE_TO_PROJECT/.test(msg) ? 'NOT_SAFE_TO_PROJECT' : 'ADMISSION_CHECK_FAILED';
    receipt.reasons.push(`PROJECTION_NOT_ADMITTED:${receipt.admission}`);
  }

  // 2) read-only census of packets the pre-embedding guard would allow (no writes)
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const r = await client.query(`${ENRICHMENT_READINESS_CTE_V1} SELECT count(*) FILTER (WHERE embed_allowed)::int AS allowed, count(*)::int AS total FROM lv`);
    await client.query('ROLLBACK');
    receipt.embedAllowedPackets = r.rows[0].allowed; receipt.totalPackets = r.rows[0].total;
  } finally { client.release(); await pool.end(); }

  if (receipt.embedAllowedPackets === 0) receipt.reasons.push('NO_EMBED_ALLOWED_PACKETS');
  if (receipt.reasons.length === 0) receipt.reasons.push('PACKET_COMPOSITION_NOT_WIRED');
  receipt.status = receipt.admission === 'SAFE_TO_PROJECT' ? 'ADMITTED_COMPOSITION_NOT_WIRED' : 'BLOCKED';
  finish(0);
} catch (e) {
  receipt.status = 'ERROR'; receipt.reasons.push(`UNEXPECTED:${e.message}`);
  finish(1);
}
