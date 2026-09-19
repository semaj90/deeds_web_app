#!/usr/bin/env node
/**
 * Produce and optionally canary-apply canonical packet source lineage.
 *
 * The producer reads immutable Graphify V2 membership plus the admitted
 * workspace binding, re-hashes the actual source bytes, and refuses to write
 * anything unless the byte digest, source revision, and binding checksum all
 * agree. Legacy atlas_packets.workspace_revision is deliberately ignored;
 * the SHA-256 workspace identity is stored in workspace_revision_key.
 *
 * Default mode is read-only. Apply mode is a bounded transaction that rolls
 * back after exact readback, so it proves the upsert path without promoting a
 * live cohort. Durable promotion requires a separate explicit gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { resolveCanonicalPacketIdentity } from './lib/classify-packet-digest-bridge-v1.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const workspaceRevision = value('--workspace-revision');
const executionId = value('--execution-id');
const limit = Number(value('--limit') ?? 25);
const apply = args.includes('--apply');
const confirm = args.includes('--confirm-current-packet-digest-bridge-v1');
if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_VALID_WORKSPACE_REVISION_REQUIRED');
if (!executionId) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('BOUNDED_LIMIT_REQUIRED');
if (apply && !confirm) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED_FOR_CANARY_APPLY');

const producerRevision = 'current-packet-digest-bridge-v1';
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const reportPath = path.join(REPO_ROOT, 'docs/reports/current-packet-digest-producer-v1.json');
const counts = {};
const observations = [];
const bump = (key) => { counts[key] = (counts[key] ?? 0) + 1; };
try {
  await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ${apply ? '' : ' READ ONLY'}`);
  await client.query("SET LOCAL statement_timeout='30000'");
  const result = await client.query(`
    SELECT m.repository_relative_path, m.source_ref, m.code_source_revision,
           m.content_hash AS membership_content_digest,
           b.source_revision, b.content_digest AS binding_content_digest,
           b.binding_checksum
    FROM graphify_execution_file_membership_v2 m
    LEFT JOIN atlas_workspace_source_bindings b
      ON b.canonical_source_ref = m.source_ref
     AND b.workspace_revision = $2
    WHERE m.execution_id = $1
      AND m.workspace_revision = $2
      AND m.repository_id = 'repo:root'
    ORDER BY m.source_ref
    LIMIT $3`, [executionId, workspaceRevision, limit]);

  const sourceRefs = [...new Set(result.rows.map((row) => normalizeRef(row.source_ref)))];
  const packetResult = await client.query(`
    SELECT packet_key, source_ref, source_revision, content_hash,
           workspace_revision_key, lineage_binding_checksum
    FROM atlas_packets
    WHERE lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', ''))
      = ANY($1::text[])
    ORDER BY source_ref, packet_key`, [sourceRefs]);
  const packetsBySource = new Map();
  for (const packet of packetResult.rows) {
    const key = normalizeRef(packet.source_ref);
    const candidates = packetsBySource.get(key) ?? [];
    candidates.push(packet);
    packetsBySource.set(key, candidates);
  }

  for (const row of result.rows) {
    const sourcePath = path.resolve(REPO_ROOT, row.repository_relative_path);
    const observation = {
      sourceRef: row.source_ref,
      packetKey: null,
      workspaceRevision,
      sourceRevision: row.source_revision ?? null,
      sourcePath: path.relative(REPO_ROOT, sourcePath).replaceAll('\\', '/'),
      bindingChecksum: row.binding_checksum ?? null,
      membershipContentDigest: row.membership_content_digest ?? null,
      bindingContentDigest: row.binding_content_digest ?? null,
      producerRevision,
    };
    if (!row.source_revision || !row.binding_checksum || !row.binding_content_digest) {
      observation.status = 'UNQUALIFIED_BINDING'; bump(observation.status); observations.push(observation); continue;
    }
    if (!fs.existsSync(sourcePath)) {
      observation.status = 'SOURCE_BYTES_MISSING'; bump(observation.status); observations.push(observation); continue;
    }
    const byteDigest = digest(fs.readFileSync(sourcePath));
    observation.byteDigest = byteDigest;
    const expected = row.binding_content_digest;
    if (!row.membership_content_digest) {
      observation.status = 'SOURCE_MEMBERSHIP_DIGEST_MISSING'; bump(observation.status); observations.push(observation); continue;
    }
    if (byteDigest !== expected || byteDigest !== row.membership_content_digest) {
      observation.status = 'ADMITTED_SNAPSHOT_BYTES_DIFFER_FROM_CURRENT_WORKTREE';
      observation.expectedDigest = expected;
      observation.membershipDigest = row.membership_content_digest;
      observation.currentWorktreeDigest = byteDigest;
      observation.promotionEligible = false;
      bump(observation.status); observations.push(observation); continue;
    }
    observation.contentDigest = byteDigest;

    // Packet identity must come from the canonical PostgreSQL packet row.
    // A source-path hash is only a projection/index candidate and must never
    // be promoted to packet_key by this producer.
    const packetRows = packetsBySource.get(normalizeRef(row.source_ref)) ?? [];
    const packetIdentity = resolveCanonicalPacketIdentity(packetRows);
    if (packetIdentity.status === 'MISSING_PACKET') {
      observation.packetKey = null;
      observation.status = 'MISSING_PACKET';
      bump(observation.status); observations.push(observation); continue;
    }
    if (packetIdentity.status === 'PACKET_IDENTITY_AMBIGUOUS') {
      observation.packetKey = null;
      observation.packetIdentityCandidates = packetIdentity.candidates;
      observation.status = 'PACKET_IDENTITY_AMBIGUOUS';
      bump(observation.status); observations.push(observation); continue;
    }
    const packet = packetRows[0];
    observation.packetKey = packetIdentity.packetKey;
    const existing = await client.query(`
      SELECT packet_key, source_ref, source_revision, content_hash,
             workspace_revision_key, lineage_binding_checksum
      FROM atlas_packets WHERE packet_key = $1 LIMIT 1`, [observation.packetKey]);
    const current = existing.rows[0] ?? null;
    if (current) {
      const expected = {
        source_ref: row.source_ref,
        source_revision: row.source_revision,
        content_hash: byteDigest,
        workspace_revision_key: workspaceRevision,
        lineage_binding_checksum: row.binding_checksum,
      };
      const mismatchFields = Object.keys(expected).filter((field) => current[field] !== expected[field]);
      const missingFields = mismatchFields.filter((field) => current[field] == null);
      const conflictingFields = mismatchFields.filter((field) => current[field] != null);
      observation.current = {
        sourceRef: current.source_ref ?? null,
        sourceRevision: current.source_revision ?? null,
        contentHash: current.content_hash ?? null,
        workspaceRevisionKey: current.workspace_revision_key ?? null,
        lineageBindingChecksum: current.lineage_binding_checksum ?? null,
      };
      observation.expected = {
        sourceRef: expected.source_ref,
        sourceRevision: expected.source_revision,
        contentHash: expected.content_hash,
        workspaceRevisionKey: expected.workspace_revision_key,
        lineageBindingChecksum: expected.lineage_binding_checksum,
      };
      observation.mismatchFields = mismatchFields;
      observation.missingFields = missingFields;
      observation.conflictingFields = conflictingFields;
      const legacyContentHashOnly = current.source_revision == null &&
        current.workspace_revision_key == null &&
        current.lineage_binding_checksum == null &&
        current.content_hash != null &&
        current.source_ref === expected.source_ref;
      if (legacyContentHashOnly) {
        observation.status = 'LEGACY_CONTENT_HASH_UNQUALIFIED';
        bump(observation.status); observations.push(observation); continue;
      }
      if (conflictingFields.length > 0 || (mismatchFields.length > 0 && missingFields.length !== mismatchFields.length)) {
        observation.status = 'IDENTITY_COLLISION';
        bump(observation.status); observations.push(observation); continue;
      }
      if (missingFields.length > 0) {
        observation.status = 'LEGACY_LINEAGE_FIELDS_MISSING';
        bump(observation.status); observations.push(observation); continue;
      }
    }
    observation.status = current ? 'IDEMPOTENT_MATCH' : 'READY_INSERT'; bump(observation.status);
    observations.push(observation);
  }

  let mutation = { attempted: false, inserted: 0, updated: 0, readback: 'NOT_RUN', rolledBack: false };
  if (apply) {
    mutation = { attempted: true, inserted: 0, updated: 0, readback: 'NOT_RUN', rolledBack: false };
    for (const item of observations.filter((x) => x.status === 'READY_INSERT')) {
      await client.query(`INSERT INTO atlas_packets
        (packet_key, packet_id, source_ref, source_revision, content_hash,
         workspace_revision_key, lineage_binding_checksum, lineage_producer_revision)
        VALUES ($1,$1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (packet_key) DO NOTHING`, [item.packetKey, item.sourceRef, item.sourceRevision,
        item.contentDigest, item.workspaceRevision, item.bindingChecksum, producerRevision]);
      mutation.inserted += 1;
    }
    for (const item of observations.filter((x) => x.status === 'LEGACY_LINEAGE_FIELDS_MISSING')) {
      const updated = await client.query(`UPDATE atlas_packets
        SET source_revision = $3, content_hash = $4, workspace_revision_key = $5,
            lineage_binding_checksum = $6, lineage_producer_revision = $7
        WHERE packet_key = $1 AND source_ref = $2
          AND source_revision IS NULL AND content_hash IS NULL
          AND workspace_revision_key IS NULL AND lineage_binding_checksum IS NULL
        RETURNING packet_key`, [item.packetKey, item.sourceRef, item.sourceRevision,
        item.contentDigest, item.workspaceRevision, item.bindingChecksum, producerRevision]);
      mutation.updated += updated.rowCount;
    }
    const expectedItems = observations.filter((x) =>
      x.status === 'READY_INSERT' || x.status === 'LEGACY_LINEAGE_FIELDS_MISSING');
    const readback = await client.query(`SELECT packet_key, source_revision, content_hash,
        workspace_revision_key, lineage_binding_checksum
      FROM atlas_packets WHERE packet_key = ANY($1::text[])`, [expectedItems.map((x) => x.packetKey)]);
    const readbackByKey = new Map(readback.rows.map((row) => [row.packet_key, row]));
    const readbackOk = expectedItems.every((item) => {
      const row = readbackByKey.get(item.packetKey);
      return row && row.source_revision === item.sourceRevision &&
        row.content_hash === item.contentDigest &&
        row.workspace_revision_key === item.workspaceRevision &&
        row.lineage_binding_checksum === item.bindingChecksum;
    });
    mutation.readback = readbackOk && readback.rowCount === expectedItems.length ? 'PASS' : 'FAIL';
    await client.query('ROLLBACK');
    mutation.rolledBack = true;
  } else {
    await client.query('ROLLBACK');
  }
  const report = { schema: 'atlas.current-packet-digest-producer.v1', generatedAt: new Date().toISOString(),
    executionId, workspaceRevision, limit, mode: apply ? 'CANARY_ROLLBACK' : 'READ_ONLY_PLAN',
    counts, observations, mutation, writesPerformed: false,
    promotion: 'BLOCKED_UNTIL_READBACK_AND_PACKET_CHUNK_LINEAGE_GATE' };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const reportTempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(reportTempPath, reportPath);
  console.log(JSON.stringify({ status: apply ? 'CANARY_ROLLBACK_READBACK_PROVEN' : 'PACKET_DIGEST_PRODUCER_PLAN_READY', counts, mutation, writesPerformed: false, reportPath: path.relative(REPO_ROOT, reportPath) }, null, 2));
} finally { client.release(); await pool.end(); }
