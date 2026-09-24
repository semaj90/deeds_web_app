/**
 * Pure helpers for the durable packet source-revision repair gate owned by
 * produce-current-packet-digest-bridge-v1.mjs. Zero I/O.
 *
 * The producer's census freezes a target manifest (eligible packets only, with
 * their exact expected before-state), split into deterministic shards below the
 * repository's per-file size limit plus a small root manifest. The durable APPLY
 * path accepts only that root checksum, verifies every shard before the first
 * write, and writes each packet with a compare-and-set predicate on the frozen
 * before-state. A packet whose state drifted since the census is rejected, never
 * overwritten.
 *
 * Target columns are the lineage fields only. atlas_packets.content_hash is NOT
 * written: it holds a different historical recipe than the source-byte SHA-256
 * (proven 2026-09-24), and populating it here would mix two recipes in one column.
 * It stays part of the before-state guard (must still be NULL).
 *
 * Checksum recipe (`sorted-key-json-sha256-v1`): SHA-256 over JSON.stringify
 * with object keys sorted recursively; arrays keep their order.
 */
import crypto from 'node:crypto';

export const MANIFEST_SCHEMA = 'atlas.packet-source-revision-repair-manifest.v2';
export const SHARD_SCHEMA = 'atlas.packet-source-revision-repair-shard.v2';
export const CHECKSUM_RECIPE = 'sorted-key-json-sha256-v1';
export const REPAIRABLE_STATUS = 'LEGACY_LINEAGE_FIELDS_MISSING';
export const TARGET_COLUMNS = Object.freeze([
  'source_revision', 'workspace_revision_key', 'lineage_binding_checksum', 'lineage_producer_revision',
]);
/** Before-state guard: all four lineage-related fields, including content_hash, must be NULL. */
export const EXPECTED_BEFORE = Object.freeze({
  sourceRevision: null,
  contentHash: null,
  workspaceRevisionKey: null,
  lineageBindingChecksum: null,
});
export const DEFAULT_SHARD_SIZE = 2000;
export const INVERSE_MANIFEST_SCHEMA = 'atlas.packet-source-revision-rollback-manifest.v1';
export const INVERSE_SHARD_SCHEMA = 'atlas.packet-source-revision-rollback-shard.v1';
/** Exact pre-apply state of the four written fields (all NULL; verified live 2026-09-24). */
export const RESTORE_STATE = Object.freeze({
  sourceRevision: null,
  workspaceRevisionKey: null,
  lineageBindingChecksum: null,
  lineageProducerRevision: null,
});

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

export function canonicalJson(body) {
  return JSON.stringify(sortKeys(body));
}

export function sha256Of(body) {
  return crypto.createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex');
}

/** Eligible entries, sorted by packetKey. Only repairable rows qualify. */
export function buildRepairEntries(observations, { producerRevision }) {
  return observations
    .filter((o) => o.status === REPAIRABLE_STATUS)
    .map((o) => ({
      packetKey: o.packetKey,
      sourceRef: o.sourceRef,
      before: { ...EXPECTED_BEFORE },
      proposed: {
        sourceRevision: o.sourceRevision,
        workspaceRevisionKey: o.workspaceRevision,
        lineageBindingChecksum: o.bindingChecksum,
        lineageProducerRevision: producerRevision,
      },
      byteDigest: o.contentDigest,
      membershipContentDigest: o.membershipContentDigest,
      bindingChecksum: o.bindingChecksum,
    }))
    .sort((a, b) => (a.packetKey < b.packetKey ? -1 : a.packetKey > b.packetKey ? 1 : 0));
}

/** Splits entries into ordered shards and builds the root manifest that pins each shard's SHA-256. */
export function buildShardedManifest(entries, { executionId, workspaceRevision, accounting, shardSize = DEFAULT_SHARD_SIZE }) {
  if (!Number.isInteger(shardSize) || shardSize < 1) throw new Error('BOUNDED_SHARD_SIZE_REQUIRED');
  const shards = [];
  for (let i = 0; i < entries.length; i += shardSize) {
    const ordinal = shards.length;
    const body = { schema: SHARD_SCHEMA, executionId, workspaceRevision, ordinal, entries: entries.slice(i, i + shardSize) };
    shards.push({ name: `shard-${String(ordinal).padStart(4, '0')}.json`, body, sha256: sha256Of(body) });
  }
  const root = {
    schema: MANIFEST_SCHEMA,
    checksumRecipe: CHECKSUM_RECIPE,
    executionId,
    workspaceRevision,
    targetTable: 'atlas_packets',
    targetColumns: [...TARGET_COLUMNS],
    beforeStateGuard: { ...EXPECTED_BEFORE },
    entryCount: entries.length,
    shards: shards.map((s) => ({ name: s.name, sha256: s.sha256, entryCount: s.body.entries.length })),
    accounting: accounting ?? null,
  };
  return { root, rootSha256: sha256Of(root), shards };
}

function verifyEntry(entry, workspaceRevision) {
  if (!entry.packetKey) throw new Error('MANIFEST_EMPTY_PACKET_KEY');
  if (!/^sha256:[0-9a-f]{64}$/i.test(entry.proposed?.sourceRevision ?? '')) throw new Error('MANIFEST_INVALID_SOURCE_REVISION');
  if (entry.proposed.workspaceRevisionKey !== workspaceRevision) throw new Error('MANIFEST_ENTRY_WORKSPACE_MISMATCH');
  if ('contentHash' in entry.proposed) throw new Error('MANIFEST_MUST_NOT_WRITE_CONTENT_HASH');
}

/** Verifies the root and every shard against the operator-supplied root checksum; returns all entries in order. */
export function verifyShardedManifest(root, shardBodies, expectedRootSha256, { executionId, workspaceRevision }) {
  if (root?.schema !== MANIFEST_SCHEMA) throw new Error('MANIFEST_SCHEMA_MISMATCH');
  if (root.checksumRecipe !== CHECKSUM_RECIPE) throw new Error('MANIFEST_CHECKSUM_RECIPE_MISMATCH');
  if (sha256Of(root) !== String(expectedRootSha256).toLowerCase()) throw new Error('MANIFEST_ROOT_CHECKSUM_MISMATCH');
  if (root.executionId !== executionId) throw new Error('MANIFEST_EXECUTION_MISMATCH');
  if (root.workspaceRevision !== workspaceRevision) throw new Error('MANIFEST_WORKSPACE_MISMATCH');
  if (canonicalJson(root.targetColumns) !== canonicalJson([...TARGET_COLUMNS])) throw new Error('MANIFEST_TARGET_COLUMNS_MISMATCH');
  if (!Array.isArray(shardBodies) || shardBodies.length !== root.shards.length) throw new Error('MANIFEST_SHARD_COUNT_MISMATCH');
  const entries = [];
  const keys = new Set();
  root.shards.forEach((ref, i) => {
    const body = shardBodies[i];
    if (sha256Of(body) !== ref.sha256) throw new Error(`MANIFEST_SHARD_CHECKSUM_MISMATCH:${ref.name}`);
    if (body.schema !== SHARD_SCHEMA || body.ordinal !== i || body.executionId !== executionId ||
        body.workspaceRevision !== workspaceRevision || body.entries.length !== ref.entryCount) {
      throw new Error(`MANIFEST_SHARD_HEADER_MISMATCH:${ref.name}`);
    }
    for (const entry of body.entries) {
      verifyEntry(entry, workspaceRevision);
      if (keys.has(entry.packetKey)) throw new Error('MANIFEST_DUPLICATE_PACKET_KEY');
      keys.add(entry.packetKey);
      entries.push(entry);
    }
  });
  if (entries.length !== root.entryCount) throw new Error('MANIFEST_ENTRY_COUNT_MISMATCH');
  return entries;
}

function liveState(row) {
  return {
    sourceRevision: row.source_revision ?? null,
    contentHash: row.content_hash ?? null,
    workspaceRevisionKey: row.workspace_revision_key ?? null,
    lineageBindingChecksum: row.lineage_binding_checksum ?? null,
    lineageProducerRevision: row.lineage_producer_revision ?? null,
  };
}

/** Classifies a live row against a manifest entry before writing it. */
export function classifyApplyTarget(currentRow, entry) {
  if (!currentRow) return 'TARGET_MISSING';
  if (currentRow.source_ref !== entry.sourceRef) return 'TARGET_DRIFT';
  const now = liveState(currentRow);
  const p = entry.proposed;
  // content_hash is never written, so a qualified row still has the frozen (NULL) content_hash.
  if (now.sourceRevision === p.sourceRevision && now.workspaceRevisionKey === p.workspaceRevisionKey &&
      now.lineageBindingChecksum === p.lineageBindingChecksum &&
      now.lineageProducerRevision === p.lineageProducerRevision && now.contentHash === entry.before.contentHash) {
    return 'ALREADY_APPLIED';
  }
  const b = entry.before;
  // lineage_producer_revision is not in the frozen before-guard; it must be NULL so a rollback restores exactly.
  if (now.sourceRevision === b.sourceRevision && now.contentHash === b.contentHash &&
      now.workspaceRevisionKey === b.workspaceRevisionKey && now.lineageBindingChecksum === b.lineageBindingChecksum &&
      now.lineageProducerRevision === null) {
    return 'APPLY';
  }
  return 'TARGET_DRIFT';
}

export function planBatches(entries, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('BOUNDED_BATCH_SIZE_REQUIRED');
  const batches = [];
  for (let i = 0; i < entries.length; i += batchSize) batches.push(entries.slice(i, i + batchSize));
  return batches;
}

/** Inverse entries restore the exact pre-apply state, guarded on the exact post-apply state. */
export function buildInverseEntries(entries) {
  return entries.map((e) => ({
    packetKey: e.packetKey,
    sourceRef: e.sourceRef,
    restore: { ...RESTORE_STATE },
    guardEquals: { ...e.proposed },
    contentHashGuard: e.before.contentHash,
  }));
}

/** Sharded rollback manifest. inverseOf is inside the hashed root, so the root checksum pins it. */
export function buildInverseManifest(inverseEntries, { executionId, workspaceRevision, inverseOf, shardSize = DEFAULT_SHARD_SIZE }) {
  if (!Number.isInteger(shardSize) || shardSize < 1) throw new Error('BOUNDED_SHARD_SIZE_REQUIRED');
  const shards = [];
  for (let i = 0; i < inverseEntries.length; i += shardSize) {
    const ordinal = shards.length;
    const body = { schema: INVERSE_SHARD_SCHEMA, executionId, workspaceRevision, ordinal, entries: inverseEntries.slice(i, i + shardSize) };
    shards.push({ name: `shard-${String(ordinal).padStart(4, '0')}.json`, body, sha256: sha256Of(body) });
  }
  const root = {
    schema: INVERSE_MANIFEST_SCHEMA,
    checksumRecipe: CHECKSUM_RECIPE,
    executionId,
    workspaceRevision,
    inverseOf,
    targetTable: 'atlas_packets',
    targetColumns: [...TARGET_COLUMNS],
    entryCount: inverseEntries.length,
    shards: shards.map((s) => ({ name: s.name, sha256: s.sha256, entryCount: s.body.entries.length })),
  };
  return { root, rootSha256: sha256Of(root), shards };
}

const WRITTEN_FIELDS = canonicalJson(Object.keys(RESTORE_STATE).sort());

function verifyInverseEntry(entry, workspaceRevision) {
  if (!entry.packetKey || !entry.sourceRef) throw new Error('INVERSE_EMPTY_IDENTITY');
  if ('contentHash' in (entry.restore ?? {}) || 'contentHash' in (entry.guardEquals ?? {})) {
    throw new Error('INVERSE_MUST_NOT_WRITE_CONTENT_HASH');
  }
  if (canonicalJson(Object.keys(entry.restore ?? {}).sort()) !== WRITTEN_FIELDS ||
      canonicalJson(Object.keys(entry.guardEquals ?? {}).sort()) !== WRITTEN_FIELDS) {
    throw new Error('INVERSE_FIELD_SET_MISMATCH');
  }
  if (entry.guardEquals.workspaceRevisionKey !== workspaceRevision) throw new Error('INVERSE_ENTRY_WORKSPACE_MISMATCH');
}

/** Verifies the rollback root and every shard; returns all inverse entries in order. */
export function verifyInverseManifest(root, shardBodies, expectedRootSha256, { executionId, workspaceRevision, inverseOf }) {
  if (root?.schema !== INVERSE_MANIFEST_SCHEMA) throw new Error('INVERSE_SCHEMA_MISMATCH');
  if (root.checksumRecipe !== CHECKSUM_RECIPE) throw new Error('INVERSE_CHECKSUM_RECIPE_MISMATCH');
  if (sha256Of(root) !== String(expectedRootSha256).toLowerCase()) throw new Error('INVERSE_ROOT_CHECKSUM_MISMATCH');
  if (root.executionId !== executionId) throw new Error('INVERSE_EXECUTION_MISMATCH');
  if (root.workspaceRevision !== workspaceRevision) throw new Error('INVERSE_WORKSPACE_MISMATCH');
  if (inverseOf && root.inverseOf !== inverseOf) throw new Error('INVERSE_OF_MISMATCH');
  if (canonicalJson(root.targetColumns) !== canonicalJson([...TARGET_COLUMNS])) throw new Error('INVERSE_TARGET_COLUMNS_MISMATCH');
  if (!Array.isArray(shardBodies) || shardBodies.length !== root.shards.length) throw new Error('INVERSE_SHARD_COUNT_MISMATCH');
  const entries = [];
  const keys = new Set();
  root.shards.forEach((ref, i) => {
    const body = shardBodies[i];
    if (sha256Of(body) !== ref.sha256) throw new Error(`INVERSE_SHARD_CHECKSUM_MISMATCH:${ref.name}`);
    if (body.schema !== INVERSE_SHARD_SCHEMA || body.ordinal !== i || body.executionId !== executionId ||
        body.workspaceRevision !== workspaceRevision || body.entries.length !== ref.entryCount) {
      throw new Error(`INVERSE_SHARD_HEADER_MISMATCH:${ref.name}`);
    }
    for (const entry of body.entries) {
      verifyInverseEntry(entry, workspaceRevision);
      if (keys.has(entry.packetKey)) throw new Error('INVERSE_DUPLICATE_PACKET_KEY');
      keys.add(entry.packetKey);
      entries.push(entry);
    }
  });
  if (entries.length !== root.entryCount) throw new Error('INVERSE_ENTRY_COUNT_MISMATCH');
  return entries;
}

function sameWritten(now, state) {
  return now.sourceRevision === state.sourceRevision && now.workspaceRevisionKey === state.workspaceRevisionKey &&
    now.lineageBindingChecksum === state.lineageBindingChecksum && now.lineageProducerRevision === state.lineageProducerRevision;
}

/** Classifies a live row against an inverse entry: exact post-state rolls back, exact pre-state is idempotent. */
export function classifyRollbackTarget(currentRow, inverseEntry) {
  if (!currentRow) return 'TARGET_MISSING';
  if (currentRow.source_ref !== inverseEntry.sourceRef) return 'TARGET_DRIFT';
  const now = liveState(currentRow);
  if (now.contentHash !== (inverseEntry.contentHashGuard ?? null)) return 'TARGET_DRIFT';
  if (sameWritten(now, inverseEntry.restore)) return 'ALREADY_RESTORED';
  if (sameWritten(now, inverseEntry.guardEquals)) return 'ROLLBACK';
  return 'TARGET_DRIFT';
}

/**
 * Shared compare-and-set batch engine for apply and rollback. `store` is a
 * transaction-scoped adapter (pg in the producer, an in-memory fake in tests):
 * begin/commit/rollback/txid/lockRows(keys)/readRows(keys)/write(entry)->rowCount.
 * Every batch is one transaction: lock, classify, CAS-write, readback, commit.
 * Any drift or failed readback rolls that batch back and stops; earlier batches stay committed.
 */
export async function executeCasBatches({ entries, batchSize, store, classify, writeDecision, doneDecision, onBatch }) {
  const batches = planBatches(entries, batchSize);
  const run = { batches: [], written: 0, alreadyDone: 0, aborted: null };
  for (const [ordinal, batch] of batches.entries()) {
    const keys = batch.map((e) => e.packetKey);
    const record = { ordinal, intended: batch.length, applied: 0, alreadyApplied: 0, preChecksum: null,
      postChecksum: null, txid: null, readback: 'NOT_RUN', committed: false };
    await store.begin();
    try {
      record.txid = await store.txid();
      const live = await store.lockRows(keys);
      record.preChecksum = batchStateChecksum(live);
      const liveByKey = new Map(live.map((r) => [r.packet_key, r]));
      const decisions = batch.map((entry) => ({ entry, decision: classify(liveByKey.get(entry.packetKey), entry) }));
      const refused = decisions.find((d) => d.decision !== writeDecision && d.decision !== doneDecision);
      if (refused) throw Object.assign(new Error(refused.decision), { packetKey: refused.entry.packetKey });
      for (const { entry, decision } of decisions) {
        if (decision === doneDecision) { record.alreadyApplied += 1; continue; }
        const rowCount = await store.write(entry);
        if (rowCount !== 1) throw Object.assign(new Error('COMPARE_AND_SET_FAILED'), { packetKey: entry.packetKey });
        record.applied += 1;
      }
      const readback = await store.readRows(keys);
      const readbackByKey = new Map(readback.map((r) => [r.packet_key, r]));
      const failed = batch.find((e) => classify(readbackByKey.get(e.packetKey), e) !== doneDecision);
      if (failed) throw Object.assign(new Error('BATCH_READBACK_FAILED'), { packetKey: failed.packetKey });
      record.postChecksum = batchStateChecksum(readback);
      record.readback = 'PASS';
      await store.commit();
      record.committed = true;
      run.written += record.applied;
      run.alreadyDone += record.alreadyApplied;
    } catch (error) {
      await store.rollback();
      run.aborted = { code: error.message, packetKey: error.packetKey ?? null, atBatch: ordinal };
    }
    record.cumulativeQualified = run.written + run.alreadyDone;
    run.batches.push(record);
    if (onBatch) await onBatch(run);
    if (run.aborted) break;
  }
  run.committedBatches = run.batches.filter((b) => b.committed).length;
  return run;
}

/** Final rollback status, mirroring applyStatus. */
export function rollbackStatus({ aborted, committedBatches }) {
  if (!aborted) return 'SOURCE_REPAIR_ROLLBACK_COMPLETE';
  return committedBatches > 0 ? 'SOURCE_REPAIR_ROLLBACK_PARTIAL' : 'SOURCE_REPAIR_ROLLBACK_FAILED_NOTHING_COMMITTED';
}

/** SHA-256 of a batch's live rows (only the guarded/target fields), for pre/post receipts. */
export function batchStateChecksum(rows) {
  const state = [...rows]
    .map((r) => ({ packetKey: r.packet_key, sourceRef: r.source_ref, ...liveState(r) }))
    .sort((a, b) => (a.packetKey < b.packetKey ? -1 : a.packetKey > b.packetKey ? 1 : 0));
  return sha256Of(state);
}

/** Final status: complete, partial (some batches committed before an abort), or failed with nothing committed. */
export function applyStatus({ aborted, committedBatches }) {
  if (!aborted) return 'SOURCE_AUTHORITY_APPLY_COMPLETE';
  return committedBatches > 0 ? 'SOURCE_AUTHORITY_APPLY_PARTIAL' : 'SOURCE_AUTHORITY_APPLY_FAILED_NOTHING_COMMITTED';
}

// ── Packet admission (PACKET_ADMISSION_GAP) ───────────────────────────────────
export const ADMISSION_MANIFEST_SCHEMA = 'atlas.packet-admission-manifest.v1';
export const ADMISSION_SHARD_SCHEMA = 'atlas.packet-admission-shard.v1';
export const ADMISSION_CLASSES = Object.freeze([
  'ADMISSION_READY', 'WORKSPACE_BINDING_MISSING', 'REVISION_MISMATCH', 'SOURCE_BYTES_CHANGED',
  'IDENTITY_COLLISION', 'PACKET_NOW_EXISTS', 'OUT_OF_SCOPE',
]);
const PRODUCER_STATUS_TO_ADMISSION = Object.freeze({
  MISSING_PACKET: 'ADMISSION_READY',
  UNQUALIFIED_BINDING: 'WORKSPACE_BINDING_MISSING',
  REVISION_MISMATCH: 'REVISION_MISMATCH',
  SOURCE_BYTES_MISSING: 'SOURCE_BYTES_CHANGED',
  SOURCE_MEMBERSHIP_DIGEST_MISSING: 'SOURCE_BYTES_CHANGED',
  ADMITTED_SNAPSHOT_BYTES_DIFFER_FROM_CURRENT_WORKTREE: 'SOURCE_BYTES_CHANGED',
  PACKET_IDENTITY_AMBIGUOUS: 'IDENTITY_COLLISION',
  IDENTITY_COLLISION: 'IDENTITY_COLLISION',
});

/**
 * Classifies every membership row that has no canonical packet (plus rows of a prior gap that now
 * have one). Rows with a packet are not part of the admission gap. Nothing here mints a packet_key.
 */
export function classifyAdmission(observations, { priorGapSourceRefs = [], outOfScopeCount = 0 } = {}) {
  const prior = new Set(priorGapSourceRefs);
  const classes = Object.fromEntries(ADMISSION_CLASSES.map((c) => [c, 0]));
  const rows = [];
  for (const o of observations) {
    const packetless = o.packetKey == null;
    let admissionClass = null;
    if (packetless) admissionClass = PRODUCER_STATUS_TO_ADMISSION[o.status] ?? null;
    else if (prior.has(o.sourceRef)) admissionClass = 'PACKET_NOW_EXISTS';
    if (!admissionClass) continue;
    classes[admissionClass] += 1;
    rows.push({ sourceRef: o.sourceRef, producerStatus: o.status, admissionClass });
  }
  classes.OUT_OF_SCOPE += outOfScopeCount;
  return { classes, rows };
}

/** Frozen ADMISSION_READY targets. No packetKey: the key recipe is an owner decision. */
export function buildAdmissionManifest(readyObservations, { executionId, workspaceRevision, accounting, shardSize = DEFAULT_SHARD_SIZE }) {
  if (!Number.isInteger(shardSize) || shardSize < 1) throw new Error('BOUNDED_SHARD_SIZE_REQUIRED');
  const entries = readyObservations
    .map((o) => ({
      sourceRef: o.sourceRef,
      repositoryRelativePath: o.sourcePath,
      sourceRevision: o.sourceRevision,
      membershipCodeSourceRevision: o.membershipCodeSourceRevision,
      workspaceRevision: o.workspaceRevision,
      bindingChecksum: o.bindingChecksum,
      contentDigest: o.contentDigest,
    }))
    .sort((a, b) => (a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0));
  for (const e of entries) {
    if (!/^sha256:[0-9a-f]{64}$/i.test(e.sourceRevision ?? '') || e.sourceRevision !== e.membershipCodeSourceRevision) {
      throw new Error(`ADMISSION_ENTRY_REVISION_INVALID:${e.sourceRef}`);
    }
    if (`sha256:${e.contentDigest}` !== e.sourceRevision.toLowerCase()) throw new Error(`ADMISSION_ENTRY_DIGEST_MISMATCH:${e.sourceRef}`);
  }
  const shards = [];
  for (let i = 0; i < entries.length; i += shardSize) {
    const ordinal = shards.length;
    const body = { schema: ADMISSION_SHARD_SCHEMA, executionId, workspaceRevision, ordinal, entries: entries.slice(i, i + shardSize) };
    shards.push({ name: `shard-${String(ordinal).padStart(4, '0')}.json`, body, sha256: sha256Of(body) });
  }
  const root = {
    schema: ADMISSION_MANIFEST_SCHEMA,
    checksumRecipe: CHECKSUM_RECIPE,
    executionId,
    workspaceRevision,
    packetKeyRecipe: 'UNDECIDED_PACKET_ADMISSION_OWNER_DECISION_REQUIRED',
    writesAuthorized: false,
    entryCount: entries.length,
    shards: shards.map((s) => ({ name: s.name, sha256: s.sha256, entryCount: s.body.entries.length })),
    accounting: accounting ?? null,
  };
  return { root, rootSha256: sha256Of(root), shards };
}
