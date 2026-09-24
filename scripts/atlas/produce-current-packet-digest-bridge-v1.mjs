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
 * live cohort.
 *
 * --census     read-only full scan of the selected execution (no 500-row cap);
 *              accounts for every membership row of the execution and freezes a
 *              sharded target manifest under
 *              docs/reports/packet-source-revision-repair-v1/<rootSha256>/.
 * --apply-durable  the separate explicit durable gate. Requires
 *              --manifest-root-sha256, --batch-size and
 *              --confirm-durable-packet-source-revision-apply; verifies the root
 *              and every shard before the first write, writes a sharded inverse
 *              manifest, then writes ONLY the frozen packets' lineage columns
 *              (never content_hash) with a compare-and-set predicate, one COMMIT
 *              per batch, with readback and a per-batch receipt. An abort after
 *              any committed batch reports SOURCE_AUTHORITY_APPLY_PARTIAL.
 *              --max-entries N limits the run to the first N frozen entries (canary).
 * --rollback-durable  consumes a sharded rollback manifest written by an apply run.
 *              Requires --manifest-root-sha256, --inverse-root-sha256, --batch-size and
 *              --confirm-durable-packet-source-revision-rollback. Restores only rows whose
 *              four lineage fields exactly equal the post-apply state (content_hash must be
 *              unchanged); already-restored rows are idempotent; any other state is drift
 *              and aborts. Reports SOURCE_REPAIR_ROLLBACK_PARTIAL after a later-batch abort.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { resolveCanonicalPacketIdentity } from './lib/classify-packet-digest-bridge-v1.mjs';
import {
  buildRepairEntries, buildShardedManifest, verifyShardedManifest, classifyApplyTarget,
  buildInverseEntries, buildInverseManifest, verifyInverseManifest, classifyRollbackTarget,
  executeCasBatches, applyStatus, rollbackStatus, classifyAdmission, buildAdmissionManifest,
} from './lib/packet-source-revision-repair-v1.mjs';

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
const census = args.includes('--census');
const applyDurable = args.includes('--apply-durable');
const rollbackDurable = args.includes('--rollback-durable');
if (census && (apply || applyDurable || rollbackDurable)) throw new Error('CENSUS_IS_READ_ONLY');
if ([apply, applyDurable, rollbackDurable].filter(Boolean).length > 1) throw new Error('CHOOSE_ONE_WRITE_MODE');
if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_VALID_WORKSPACE_REVISION_REQUIRED');
if (!executionId) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
if (!census && !applyDurable && !rollbackDurable && (!Number.isInteger(limit) || limit < 1 || limit > 500)) throw new Error('BOUNDED_LIMIT_REQUIRED');
if (apply && !confirm) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED_FOR_CANARY_APPLY');

const producerRevision = 'current-packet-digest-bridge-v1';
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
const reportPath = path.join(REPO_ROOT, 'docs/reports/current-packet-digest-producer-v1.json');
const manifestRootDir = path.join(REPO_ROOT, 'docs/reports/packet-source-revision-repair-v1');
const writeJsonAtomic = (target, content) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
};

const LINEAGE_COLUMNS = `packet_key, source_ref, source_revision, content_hash,
  workspace_revision_key, lineage_binding_checksum, lineage_producer_revision`;

/** pg adapter for executeCasBatches; `write` is the mode-specific compare-and-set UPDATE. */
function pgStore(write) {
  return {
    begin: async () => { await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='30000'"); },
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    txid: async () => (await client.query('SELECT txid_current()::text AS txid')).rows[0].txid,
    lockRows: async (keys) => (await client.query(
      `SELECT ${LINEAGE_COLUMNS} FROM atlas_packets WHERE packet_key = ANY($1::text[]) FOR UPDATE`, [keys])).rows,
    readRows: async (keys) => (await client.query(
      `SELECT ${LINEAGE_COLUMNS} FROM atlas_packets WHERE packet_key = ANY($1::text[])`, [keys])).rows,
    write,
  };
}

// content_hash is deliberately NOT in either SET list (different historical recipe); it is only guarded.
const applyWrite = async (entry) => {
  const p = entry.proposed;
  return (await client.query(`UPDATE atlas_packets
    SET source_revision = $3, workspace_revision_key = $4,
        lineage_binding_checksum = $5, lineage_producer_revision = $6
    WHERE packet_key = $1 AND source_ref = $2
      AND source_revision IS NULL AND content_hash IS NULL
      AND workspace_revision_key IS NULL AND lineage_binding_checksum IS NULL
      AND lineage_producer_revision IS NULL`,
  [entry.packetKey, entry.sourceRef, p.sourceRevision, p.workspaceRevisionKey,
    p.lineageBindingChecksum, p.lineageProducerRevision])).rowCount;
};

const rollbackWrite = async (entry) => {
  const g = entry.guardEquals;
  const r = entry.restore;
  return (await client.query(`UPDATE atlas_packets
    SET source_revision = $7, workspace_revision_key = $8,
        lineage_binding_checksum = $9, lineage_producer_revision = $10
    WHERE packet_key = $1 AND source_ref = $2
      AND source_revision = $3 AND workspace_revision_key = $4
      AND lineage_binding_checksum = $5 AND lineage_producer_revision = $6
      AND content_hash IS NOT DISTINCT FROM $11`,
  [entry.packetKey, entry.sourceRef, g.sourceRevision, g.workspaceRevisionKey, g.lineageBindingChecksum,
    g.lineageProducerRevision, r.sourceRevision, r.workspaceRevisionKey, r.lineageBindingChecksum,
    r.lineageProducerRevision, entry.contentHashGuard ?? null])).rowCount;
};

function readShardedDir(dir) {
  const root = JSON.parse(fs.readFileSync(path.join(dir, 'root.json'), 'utf8'));
  return { root, shardBodies: root.shards.map((ref) => JSON.parse(fs.readFileSync(path.join(dir, ref.name), 'utf8'))) };
}

function requireRoot(flag) {
  const v = value(flag);
  if (!/^[0-9a-f]{64}$/i.test(v ?? '')) throw new Error(`EXPLICIT_${flag.replace(/^--/, '').replaceAll('-', '_').toUpperCase()}_REQUIRED`);
  return v.toLowerCase();
}

async function runDurableApply() {
  const expectedRoot = requireRoot('--manifest-root-sha256');
  const batchSize = Number(value('--batch-size'));
  const maxEntries = value('--max-entries') === null ? null : Number(value('--max-entries'));
  if (!args.includes('--confirm-durable-packet-source-revision-apply')) throw new Error('EXPLICIT_DURABLE_APPLY_CONFIRMATION_REQUIRED');
  if (maxEntries !== null && (!Number.isInteger(maxEntries) || maxEntries < 1)) throw new Error('BOUNDED_MAX_ENTRIES_REQUIRED');
  const dir = path.join(manifestRootDir, expectedRoot);
  const { root, shardBodies } = readShardedDir(dir);
  // Every shard is verified before the first write.
  const allEntries = verifyShardedManifest(root, shardBodies, expectedRoot, { executionId, workspaceRevision });
  const entries = maxEntries === null ? allEntries : allEntries.slice(0, maxEntries);
  const runId = `${Date.now()}-${process.pid}`;
  // The rollback manifest is written (and its root checksum reported) before the first write.
  const inverse = buildInverseManifest(buildInverseEntries(entries), { executionId, workspaceRevision, inverseOf: expectedRoot });
  const inverseDir = path.join(dir, `inverse-${inverse.rootSha256}`);
  for (const shard of inverse.shards) writeJsonAtomic(path.join(inverseDir, shard.name), shard.body);
  writeJsonAtomic(path.join(inverseDir, 'root.json'), inverse.root);
  const receipt = { schema: 'atlas.packet-source-revision-repair-apply-receipt.v1', manifestRootSha256: expectedRoot,
    executionId, workspaceRevision, batchSize, maxEntries, intendedTotal: entries.length, batches: [], committedPackets: 0,
    alreadyAppliedPackets: 0, aborted: null, inverseRootSha256: inverse.rootSha256, inverseDir: path.relative(REPO_ROOT, inverseDir) };
  const receiptPath = path.join(dir, `apply-receipt-${runId}.json`);
  const sync = (run) => {
    Object.assign(receipt, { batches: run.batches, committedPackets: run.written, alreadyAppliedPackets: run.alreadyDone, aborted: run.aborted });
    writeJsonAtomic(receiptPath, receipt);
  };
  const run = await executeCasBatches({ entries, batchSize, store: pgStore(applyWrite), classify: classifyApplyTarget,
    writeDecision: 'APPLY', doneDecision: 'ALREADY_APPLIED', onBatch: sync });
  sync(run);
  receipt.status = applyStatus({ aborted: run.aborted, committedBatches: run.committedBatches });
  writeJsonAtomic(receiptPath, receipt);
  console.log(JSON.stringify({ status: receipt.status, manifestRootSha256: expectedRoot, intendedTotal: entries.length,
    committedPackets: receipt.committedPackets, alreadyAppliedPackets: receipt.alreadyAppliedPackets, batches: run.batches.length,
    aborted: run.aborted, inverseRootSha256: inverse.rootSha256, receiptPath: path.relative(REPO_ROOT, receiptPath) }, null, 2));
}

async function runDurableRollback() {
  const manifestRoot = requireRoot('--manifest-root-sha256');
  const inverseRoot = requireRoot('--inverse-root-sha256');
  const batchSize = Number(value('--batch-size'));
  if (!args.includes('--confirm-durable-packet-source-revision-rollback')) throw new Error('EXPLICIT_DURABLE_ROLLBACK_CONFIRMATION_REQUIRED');
  const inverseDir = path.join(manifestRootDir, manifestRoot, `inverse-${inverseRoot}`);
  const { root, shardBodies } = readShardedDir(inverseDir);
  const entries = verifyInverseManifest(root, shardBodies, inverseRoot, { executionId, workspaceRevision, inverseOf: manifestRoot });
  const runId = `${Date.now()}-${process.pid}`;
  const receipt = { schema: 'atlas.packet-source-revision-rollback-receipt.v1', manifestRootSha256: manifestRoot,
    inverseRootSha256: inverseRoot, executionId, workspaceRevision, batchSize, intendedTotal: entries.length, batches: [],
    restoredPackets: 0, alreadyRestoredPackets: 0, aborted: null };
  const receiptPath = path.join(inverseDir, `rollback-receipt-${runId}.json`);
  const sync = (run) => {
    Object.assign(receipt, { batches: run.batches, restoredPackets: run.written, alreadyRestoredPackets: run.alreadyDone, aborted: run.aborted });
    writeJsonAtomic(receiptPath, receipt);
  };
  const run = await executeCasBatches({ entries, batchSize, store: pgStore(rollbackWrite), classify: classifyRollbackTarget,
    writeDecision: 'ROLLBACK', doneDecision: 'ALREADY_RESTORED', onBatch: sync });
  sync(run);
  receipt.status = rollbackStatus({ aborted: run.aborted, committedBatches: run.committedBatches });
  writeJsonAtomic(receiptPath, receipt);
  console.log(JSON.stringify({ status: receipt.status, inverseRootSha256: inverseRoot, intendedTotal: entries.length,
    restoredPackets: receipt.restoredPackets, alreadyRestoredPackets: receipt.alreadyRestoredPackets, batches: run.batches.length,
    aborted: run.aborted, receiptPath: path.relative(REPO_ROOT, receiptPath) }, null, 2));
}

if (applyDurable || rollbackDurable) {
  try {
    await (applyDurable ? runDurableApply() : runDurableRollback());
  } finally { client.release(); await pool.end(); }
  process.exit(0);
}
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
    ${census ? '' : 'LIMIT $3'}`, census ? [executionId, workspaceRevision] : [executionId, workspaceRevision, limit]);

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
      membershipCodeSourceRevision: row.code_source_revision ?? null,
      bindingChecksum: row.binding_checksum ?? null,
      membershipContentDigest: row.membership_content_digest ?? null,
      bindingContentDigest: row.binding_content_digest ?? null,
      producerRevision,
    };
    if (!row.source_revision || !row.binding_checksum || !row.binding_content_digest) {
      observation.status = 'UNQUALIFIED_BINDING'; bump(observation.status); observations.push(observation); continue;
    }
    // The admitted binding must carry the same revision the Graphify membership recorded.
    if (String(row.code_source_revision ?? '').toLowerCase() !== String(row.source_revision).toLowerCase()) {
      observation.status = 'REVISION_MISMATCH'; bump(observation.status); observations.push(observation); continue;
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
    // Same row, same REPEATABLE READ snapshot as the batched lookup above.
    const current = packet ?? null;
    if (current) {
      // content_hash is not part of the lineage identity: it holds a different historical recipe and
      // the durable repair never writes it (legacy content_hash-only rows are classified below).
      const expected = {
        source_ref: row.source_ref,
        source_revision: row.source_revision,
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
  let manifestSummary = null;
  let admissionSummary = null;
  if (census) {
    // Account for every membership row of the execution, not only the repo:root/workspace scope.
    const scope = (await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE repository_id = 'repo:root' AND workspace_revision = $2)::int AS in_scope,
             count(*) FILTER (WHERE repository_id <> 'repo:root')::int AS out_of_scope_repository,
             count(*) FILTER (WHERE repository_id = 'repo:root' AND workspace_revision <> $2)::int AS workspace_scope_mismatch
      FROM graphify_execution_file_membership_v2 WHERE execution_id = $1`, [executionId, workspaceRevision])).rows[0];
    const outcomes = { ...counts, OUT_OF_SCOPE_REPOSITORY: scope.out_of_scope_repository,
      WORKSPACE_SCOPE_MISMATCH: scope.workspace_scope_mismatch };
    const outcomeSum = Object.values(outcomes).reduce((a, b) => a + b, 0);
    const accounting = { membershipTotal: scope.total, inScope: scope.in_scope, outcomes, outcomeSum,
      fullyAccounted: outcomeSum === scope.total };
    const entries = buildRepairEntries(observations, { producerRevision });
    const manifest = buildShardedManifest(entries, { executionId, workspaceRevision, accounting });
    const dir = path.join(manifestRootDir, manifest.rootSha256);
    for (const shard of manifest.shards) writeJsonAtomic(path.join(dir, shard.name), shard.body);
    writeJsonAtomic(path.join(dir, 'root.json'), manifest.root);
    const inconsistent = entries.filter((e) => e.byteDigest !== e.membershipContentDigest ||
      !/^sha256:[0-9a-f]{64}$/i.test(e.proposed.sourceRevision)).length;
    manifestSummary = { manifestDir: path.relative(REPO_ROOT, dir), manifestRootSha256: manifest.rootSha256,
      shardCount: manifest.shards.length, targetColumns: manifest.root.targetColumns,
      exactRepairEligible: entries.length, internallyInconsistentEntries: inconsistent,
      packetAdmissionGap: counts.MISSING_PACKET ?? 0, alreadyQualified: counts.IDEMPOTENT_MATCH ?? 0, accounting };

    // PACKET_ADMISSION_GAP: classify every packetless membership row; freeze ADMISSION_READY only.
    const censusPath = reportPath.replace(/\.json$/, '.census.json');
    let priorGapSourceRefs = [];
    try {
      const prior = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
      priorGapSourceRefs = (prior.observations ?? []).filter((o) => o.status === 'MISSING_PACKET').map((o) => o.sourceRef);
    } catch { /* no prior census */ }
    const admission = classifyAdmission(observations, { priorGapSourceRefs,
      outOfScopeCount: scope.out_of_scope_repository + scope.workspace_scope_mismatch });
    const ready = observations.filter((o) => o.packetKey == null && o.status === 'MISSING_PACKET');
    const admissionManifest = buildAdmissionManifest(ready, { executionId, workspaceRevision,
      accounting: { classes: admission.classes, priorGapSize: priorGapSourceRefs.length } });
    const admissionDir = path.join(REPO_ROOT, 'docs/reports/packet-admission-v1', admissionManifest.rootSha256);
    for (const shard of admissionManifest.shards) writeJsonAtomic(path.join(admissionDir, shard.name), shard.body);
    writeJsonAtomic(path.join(admissionDir, 'root.json'), admissionManifest.root);
    writeJsonAtomic(path.join(admissionDir, 'classification.json'), { schema: 'atlas.packet-admission-classification.v1',
      executionId, workspaceRevision, classes: admission.classes, rows: admission.rows });
    admissionSummary = { manifestDir: path.relative(REPO_ROOT, admissionDir), manifestRootSha256: admissionManifest.rootSha256,
      admissionReady: ready.length, classes: admission.classes, priorGapSize: priorGapSourceRefs.length,
      packetKeyRecipe: admissionManifest.root.packetKeyRecipe, writesAuthorized: false };
  }
  const report = { schema: 'atlas.current-packet-digest-producer.v1', generatedAt: new Date().toISOString(),
    executionId, workspaceRevision, limit: census ? null : limit,
    mode: census ? 'READ_ONLY_CENSUS' : apply ? 'CANARY_ROLLBACK' : 'READ_ONLY_PLAN',
    counts, manifest: manifestSummary, admission: admissionSummary,
    // A census report keeps only rejected rows; eligible rows live in the frozen manifest.
    observations: census ? observations.filter((o) => o.status !== 'LEGACY_LINEAGE_FIELDS_MISSING') : observations,
    mutation, writesPerformed: false,
    promotion: 'BLOCKED_UNTIL_READBACK_AND_PACKET_CHUNK_LINEAGE_GATE' };
  writeJsonAtomic(census ? reportPath.replace(/\.json$/, '.census.json') : reportPath, report);
  console.log(JSON.stringify({ status: census ? 'PACKET_DIGEST_PRODUCER_CENSUS_READY' : apply ? 'CANARY_ROLLBACK_READBACK_PROVEN' : 'PACKET_DIGEST_PRODUCER_PLAN_READY', counts, manifest: manifestSummary, admission: admissionSummary, mutation, writesPerformed: false }, null, 2));
} finally { client.release(); await pool.end(); }
