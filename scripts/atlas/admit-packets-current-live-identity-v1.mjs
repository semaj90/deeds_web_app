#!/usr/bin/env node
/**
 * admit-packets-current-live-identity-v1.mjs
 *
 * Mints new atlas_packets rows for the ADMISSION_READY entries frozen by
 * build-packet-key-v2-admission-manifest-v1.mjs's sibling read-only producer
 * (produce-current-packet-digest-bridge-v1.mjs --census), using the
 * CURRENT_LIVE_IDENTITY recipe already in production use by the 16,151+ packets
 * bound to the admitted workspace revision (confirmed live, 2026-09-28, against
 * 5 random sampled rows): packet_key = "packet:" + sha256(source_ref).slice(0,12).
 *
 * This is deliberately NOT packet-key-builder.ts::computePacketKey() (a different,
 * node-scoped 64-hex scheme, documented in that file as not what's live) and NOT
 * build-packet-key-v2-admission-manifest-v1.mjs's PACKET_KEY_V2_UUIDV5_REPOSITORY_SCOPED
 * scheme (a third, separate candidate). Operator decision (2026-09-28): reuse the
 * recipe that already produces the live majority of packet_key values.
 *
 * Hard checks before any write:
 *  - manifest root/shard checksums verified against root.json (frozen input, unmodified)
 *  - every source_revision matches ^sha256:[0-9a-f]{64}$ and equals contentDigest
 *  - computed packet_key checked for collision against the FULL atlas_packets table
 *    (not just the admitted-revision subset) -- any collision aborts with zero writes
 *  - duplicate packet_key within the admission set itself aborts with zero writes
 *
 * Default: rehearsal (per-row inserts inside one transaction, exact readback, ROLLBACK).
 * --apply: commits. --limit=N: bound row count for a first small apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { sha256Of, CHECKSUM_RECIPE } from './lib/packet-source-revision-repair-v1.mjs';

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const manifestDirArg = process.argv.find((a) => a.startsWith('--manifest-dir='));
if (!manifestDirArg) throw new Error('MANIFEST_DIR_REQUIRED');
const manifestDir = path.resolve(REPO_ROOT, manifestDirArg.slice('--manifest-dir='.length));

const root = JSON.parse(fs.readFileSync(path.join(manifestDir, 'root.json'), 'utf8'));
if (root.schema !== 'atlas.packet-admission-manifest.v1') throw new Error('UNEXPECTED_MANIFEST_SCHEMA');
if (root.checksumRecipe !== CHECKSUM_RECIPE) throw new Error('MANIFEST_CHECKSUM_RECIPE_MISMATCH');
if (root.writesAuthorized !== false) throw new Error('UNEXPECTED_MANIFEST_AUTH_FLAG');

let entries = [];
for (const shard of root.shards) {
  const body = JSON.parse(fs.readFileSync(path.join(manifestDir, shard.name), 'utf8'));
  const actual = sha256Of(body);
  if (actual !== shard.sha256) throw new Error(`SHARD_CHECKSUM_MISMATCH:${shard.name}:${actual}!=${shard.sha256}`);
  entries.push(...body.entries);
}
if (entries.length !== root.entryCount) throw new Error(`ENTRY_COUNT_MISMATCH:${entries.length}!=${root.entryCount}`);

const sha = /^sha256:[0-9a-f]{64}$/i;
for (const e of entries) {
  if (!sha.test(e.sourceRevision)) throw new Error(`BAD_SOURCE_REVISION:${e.sourceRef}`);
  if (e.sourceRevision !== e.membershipCodeSourceRevision) throw new Error(`REVISION_MEMBERSHIP_MISMATCH:${e.sourceRef}`);
  if (`sha256:${e.contentDigest}`.toLowerCase() !== e.sourceRevision.toLowerCase()) throw new Error(`DIGEST_MISMATCH:${e.sourceRef}`);
  if (e.workspaceRevision !== root.workspaceRevision) throw new Error(`WORKSPACE_REVISION_MISMATCH:${e.sourceRef}`);
}

// CURRENT_LIVE_IDENTITY recipe, confirmed live 2026-09-28.
const computeLivePacketKey = (sourceRef) => `packet:${crypto.createHash('sha256').update(sourceRef).digest('hex').slice(0, 12)}`;

const minted = entries.slice(0, Number.isFinite(LIMIT) ? LIMIT : entries.length).map((e) => ({
  ...e,
  packetKey: computeLivePacketKey(e.sourceRef),
}));

// Collision check: within the minted set itself.
const seen = new Map();
for (const m of minted) {
  if (seen.has(m.packetKey)) throw new Error(`INTRA_BATCH_PACKET_KEY_COLLISION:${m.packetKey}:${seen.get(m.packetKey)}+${m.sourceRef}`);
  seen.set(m.packetKey, m.sourceRef);
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, statement_timeout: 120000 });

// Collision check: against the full live table.
const { rows: existingCollisions } = await pool.query(
  `SELECT packet_key, source_ref FROM atlas_packets WHERE packet_key = ANY($1::text[])`,
  [minted.map((m) => m.packetKey)],
);
if (existingCollisions.length > 0) {
  await pool.end();
  throw new Error(`LIVE_TABLE_PACKET_KEY_COLLISION:${JSON.stringify(existingCollisions.slice(0, 5))}`);
}

const report = {
  schema: 'atlas.admit-packets-current-live-identity.v1',
  mode: APPLY ? 'apply' : 'rehearsal',
  manifestDir: path.relative(REPO_ROOT, manifestDir),
  manifestEntryCount: entries.length,
  mintedCount: minted.length,
  packetKeyRecipe: 'CURRENT_LIVE_IDENTITY: packet:' + '<sha256(source_ref).slice(0,12)>',
  intraBatchCollisions: 0,
  liveTableCollisions: 0,
};

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let inserted = 0;
  for (const m of minted) {
    const res = await client.query(
      `INSERT INTO atlas_packets
         (packet_id, packet_key, source_ref, canonical_source_ref, source_revision,
          workspace_revision_key, lineage_binding_checksum, content_hash,
          lineage_producer_revision, source_kind, workspace_revision, representation_revision)
       VALUES ($1,$1,$2,$2,$3,$4,$5,$6,$7,'repo_index',0,0)
       ON CONFLICT (packet_key) DO NOTHING
       RETURNING packet_key`,
      [m.packetKey, m.sourceRef, m.sourceRevision, m.workspaceRevision, m.bindingChecksum, m.contentDigest, 'admit-packets-current-live-identity-v1'],
    );
    if (res.rowCount === 0) throw new Error(`UNEXPECTED_CONFLICT_MID_TRANSACTION:${m.packetKey}`);
    inserted += 1;
  }
  const { rows: [rb] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM atlas_packets WHERE packet_key = ANY($1::text[])`,
    [minted.map((m) => m.packetKey)],
  );
  report.inserted = inserted;
  report.readback = rb.n;
  if (inserted !== minted.length || rb.n !== minted.length) throw new Error(`READBACK_MISMATCH:${inserted}/${rb.n}/${minted.length}`);
  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
  report.committed = APPLY;
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  report.error = String(e.message ?? e);
  report.committed = false;
} finally {
  client.release();
  await pool.end();
}

const outPath = path.join(REPO_ROOT, `docs/reports/admit-packets-current-live-identity-v1-${APPLY ? 'apply' : 'rehearsal'}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.error) process.exit(1);
