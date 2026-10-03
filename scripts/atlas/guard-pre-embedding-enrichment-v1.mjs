#!/usr/bin/env node

/**
 * Pre-embedding enrichment guard — READ-ONLY. Decides per packet whether EmbeddingGemma fan-out /
 * graph creation may consume it. Blocked packets get a reason and are NEVER given a default vector.
 *
 *   node guard-pre-embedding-enrichment-v1.mjs --all [--strict] [--out decisions.ndjson]
 *   node guard-pre-embedding-enrichment-v1.mjs --keys-file keys.txt [--strict]   (one packet_key per line)
 *
 * Exit: 0 normally; 3 with --strict when any requested packet is blocked. Stdout is a JSON summary.
 * Callers (daily graphify) should embed only decision === EMBED_ALLOWED.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ENRICHMENT_READINESS_CTE_V1 } from './lib/enrichment-readiness-sql-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const all = process.argv.includes('--all');
const strict = process.argv.includes('--strict');
const keysFile = arg('--keys-file');
const outPath = arg('--out');
if (!all && !keysFile) { console.error('usage: --all | --keys-file <file> [--strict] [--out <ndjson>]'); process.exit(64); }
const keys = keysFile ? fs.readFileSync(path.resolve(keysFile), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : null;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 300000 });
const client = await pool.connect();
let rows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query(`${ENRICHMENT_READINESS_CTE_V1}
    SELECT packet_key, source_ref, ident, has_rev, sha_conflict, has_summary, has_keywords, has_domain, has_concepts, emb_real, emb_placeholder, embed_allowed
    FROM lv ${keys ? 'WHERE packet_key = ANY($1::text[])' : ''}`, keys ? [keys] : [])).rows;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const reason = (r) => {
  if (!r.ident) return 'BLOCKED_L1_IDENTITY_MISSING';
  if (!r.has_rev) return 'BLOCKED_L1_SOURCE_REVISION_MISSING';
  if (r.sha_conflict) return 'BLOCKED_L1_REVISION_HASH_CONFLICT';
  if (!r.has_summary) return 'BLOCKED_L2_NO_SUMMARY';
  if (!r.has_domain || !r.has_concepts) return 'BLOCKED_L3_CLASSIFICATION_MISSING';
  return 'EMBED_ALLOWED';
};
const decisions = rows.map((r) => ({
  packetKey: r.packet_key, sourceRef: r.source_ref, decision: reason(r),
  alreadyHasPlaceholderVector: r.emb_placeholder, alreadyHasRealVector: r.emb_real,
  keywordsMissingCpuDerivable: r.embed_allowed && !r.has_keywords,
}));
const tally = decisions.reduce((a, d) => { a[d.decision] = (a[d.decision] ?? 0) + 1; return a; }, {});
if (keys) { const found = new Set(rows.map((r) => r.packet_key)); tally.UNKNOWN_PACKET_KEY = keys.filter((k) => !found.has(k)).length; }
if (outPath) fs.writeFileSync(path.resolve(outPath), decisions.map((d) => JSON.stringify(d)).join('\n') + '\n');
const blocked = Object.entries(tally).filter(([k]) => k !== 'EMBED_ALLOWED').reduce((s, [, v]) => s + v, 0);
const summary = {
  guard: 'PRE_EMBEDDING_ENRICHMENT_GUARD_V1', mode: 'READ_ONLY', scope: all ? 'ALL_PACKETS' : `KEYS_FILE(${keys.length})`, evaluated: decisions.length,
  decisions: tally, allowed: tally.EMBED_ALLOWED ?? 0, blocked,
  allowedButPlaceholderPresent: decisions.filter((d) => d.decision === 'EMBED_ALLOWED' && d.alreadyHasPlaceholderVector).length,
  allowedKeywordsDerivable: decisions.filter((d) => d.keywordsMissingCpuDerivable).length,
  blockedButRealVectorPresent: decisions.filter((d) => d.decision !== 'EMBED_ALLOWED' && d.alreadyHasRealVector).length,
  strict, exitCode: strict && blocked > 0 ? 3 : 0,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.exitCode);
