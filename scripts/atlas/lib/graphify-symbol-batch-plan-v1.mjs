import { createHash } from 'node:crypto';

const SCHEMA = 'atlas.graphify-symbol-batch-plan.v1';
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const KINDS = ['ts_js', 'markdown', 'text', 'json'];
const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// A plan freezes work selection only. The existing extractor must still join every row to
// current canonical admission, verify source bytes, and use its existing transaction guards.
export function buildSymbolBatchPlan({ workspaceRevision, sourceSnapshotChecksum, producerRevision, useLsp, rows }) {
  if (!SHA256.test(workspaceRevision) || !SHA256.test(sourceSnapshotChecksum) || !SHA256.test(producerRevision)) {
    throw new Error('SYMBOL_PLAN_REVISION_INVALID');
  }
  if (typeof useLsp !== 'boolean' || !Array.isArray(rows)) throw new Error('SYMBOL_PLAN_SHAPE_INVALID');
  const refs = new Set();
  const ids = new Set();
  const normalized = rows.map(row => {
    if (typeof row.sourceRef !== 'string' || !row.sourceRef || /[\\:\x00-\x1f]/.test(row.sourceRef)
      || row.sourceRef.startsWith('/') || row.sourceRef.split('/').some(p => !p || p === '.' || p === '..')) {
      throw new Error('SYMBOL_PLAN_SOURCE_REF_INVALID');
    }
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.fileId)
      || !SHA256.test(row.sourceRevision) || !KINDS.includes(row.fileKind)) {
      throw new Error('SYMBOL_PLAN_ROW_INVALID');
    }
    if (refs.has(row.sourceRef) || ids.has(row.fileId)) throw new Error('SYMBOL_PLAN_DUPLICATE_IDENTITY');
    refs.add(row.sourceRef); ids.add(row.fileId);
    return { fileId: row.fileId, sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, fileKind: row.fileKind };
  }).sort((a, b) => KINDS.indexOf(a.fileKind) - KINDS.indexOf(b.fileKind)
    || Number(b.sourceRef.startsWith('sveltekit-frontend/src/')) - Number(a.sourceRef.startsWith('sveltekit-frontend/src/'))
    || compare(a.sourceRef, b.sourceRef));
  const content = { schema: SCHEMA, workspaceRevision, sourceSnapshotChecksum, producerRevision, useLsp, rowCount: normalized.length, rows: normalized };
  return { ...content, planChecksum: digest(content) };
}

export function validateSymbolBatchPlan(plan, expected) {
  if (!plan || plan.schema !== SCHEMA) throw new Error('SYMBOL_PLAN_SCHEMA_INVALID');
  const rebuilt = buildSymbolBatchPlan(plan);
  if (plan.rowCount !== rebuilt.rowCount || plan.planChecksum !== rebuilt.planChecksum
    || JSON.stringify(plan.rows) !== JSON.stringify(rebuilt.rows)) throw new Error('SYMBOL_PLAN_CHECKSUM_MISMATCH');
  for (const key of ['workspaceRevision', 'sourceSnapshotChecksum', 'producerRevision', 'useLsp']) {
    if (plan[key] !== expected[key]) throw new Error(`SYMBOL_PLAN_${key.toUpperCase()}_MISMATCH`);
  }
  return rebuilt;
}

export function buildSymbolBaselineShards(plan, size = 250) {
  validateSymbolBatchPlan(plan, plan);
  if (!Number.isSafeInteger(size) || size < 1 || size > 1000) throw new Error('SYMBOL_SHARD_SIZE_INVALID');
  const shards = [];
  for (let offset = 0; offset < plan.rowCount; offset += size) {
    const rows = plan.rows.slice(offset, offset + size);
    const shardChecksum = digest({ manifestChecksum: plan.planChecksum, offset, rows });
    shards.push({
      shardId: `GRAPHIFY-BASELINE-${plan.planChecksum.slice(7, 19)}-${String(shards.length + 1).padStart(4, '0')}`,
      manifestChecksum: plan.planChecksum, workspaceRevision: plan.workspaceRevision,
      extractorRevision: plan.producerRevision, offset, maxFiles: rows.length, shardChecksum,
      mutationPolicy: 'GRAPHIFY_STRUCTURAL_ONLY', queueStatus: 'PLANNED_NOT_ENQUEUED',
    });
  }
  return { schema: 'atlas.graphify-symbol-shards.v1', manifestChecksum: plan.planChecksum, sourceCount: plan.rowCount, shardSize: size, shards };
}

export function selectLiveSymbolPlanRows(plannedRows, liveRows, workspaceRevision, verifyProcessed = false) {
  const liveByRef = new Map();
  for (const row of liveRows) {
    const matches = liveByRef.get(row.source_ref) ?? [];
    matches.push(row); liveByRef.set(row.source_ref, matches);
  }
  const candidates = [];
  const outcomes = [];
  for (const expected of plannedRows) {
    const matches = liveByRef.get(expected.sourceRef) ?? [];
    const row = matches[0];
    let status;
    if (!matches.length) status = 'LIVE_ADMITTED_BINDING_MISSING';
    else if (matches.length !== 1) status = 'AMBIGUOUS_LIVE_IDENTITY';
    else if (row.file_id !== expected.fileId || row.source_revision !== expected.sourceRevision
      || row.workspace_revision !== workspaceRevision) status = 'LIVE_IDENTITY_OR_REVISION_MISMATCH';
    else if (row.parse_status === 'PROCESSED') {
      status = 'ALREADY_PROCESSED';
      if (verifyProcessed) candidates.push(row);
    }
    else if (row.parse_status !== 'UNPROCESSED') status = `DEFERRED_${row.parse_status ?? 'UNKNOWN_STATUS'}`;
    else { status = 'PENDING_BYTE_CHECK'; candidates.push(row); }
    outcomes.push({ ...expected, status });
  }
  return { candidates, outcomes };
}

/** Readback compares concrete stored observations, never count-only self-report. */
export function findSymbolIdentityConflicts(symbols) {
  const seen = new Map();
  const conflicts = [];
  for (const row of symbols) {
    const previous = seen.get(row.stable_symbol_key);
    if (previous && ['source_text_hash', 'ast_fingerprint', 'start_byte', 'end_byte']
      .some(field => previous[field] !== row[field])) conflicts.push(row.stable_symbol_key);
    seen.set(row.stable_symbol_key, row);
  }
  return [...new Set(conflicts)];
}

/**
 * A Graphify symbol row is a source occurrence (it has one authoritative span), while the
 * canonical symbol registry/version owner is the logical cross-revision identity. When one
 * file contains repeated declarations with the same legacy file/kind/qualified-name key,
 * retain the legacy key for the first source occurrence and derive deterministic occurrence
 * keys for the rest. Exact duplicate observations keep the same key and remain idempotent.
 */
export function disambiguateSymbolOccurrenceKeysV1(symbols) {
  if (!Array.isArray(symbols)) throw new Error('SYMBOL_OCCURRENCE_LIST_REQUIRED');
  const groups = new Map();
  symbols.forEach((row, index) => {
    if (!row || typeof row.stable_symbol_key !== 'string' || !row.stable_symbol_key) {
      throw new Error(`SYMBOL_OCCURRENCE_KEY_REQUIRED:${index}`);
    }
    const evidenceKey = JSON.stringify([
      row.start_byte ?? null,
      row.end_byte ?? null,
      row.source_text_hash ?? null,
      row.ast_fingerprint ?? null,
    ]);
    const group = groups.get(row.stable_symbol_key) ?? new Map();
    const evidence = group.get(evidenceKey) ?? { startByte: row.start_byte, endByte: row.end_byte, rows: [] };
    evidence.rows.push(index);
    group.set(evidenceKey, evidence);
    groups.set(row.stable_symbol_key, group);
  });

  const keysByIndex = symbols.map(row => row.stable_symbol_key);
  for (const [baseKey, evidenceByKey] of groups) {
    const evidence = [...evidenceByKey.entries()].sort(([keyA, a], [keyB, b]) =>
      Number(a.startByte ?? -1) - Number(b.startByte ?? -1)
      || Number(a.endByte ?? -1) - Number(b.endByte ?? -1)
      || compare(keyA, keyB));
    if (evidence.length < 2) continue;

    evidence.forEach(([, item], occurrenceIndex) => {
      const key = occurrenceIndex === 0
        ? baseKey
        : createHash('sha256').update(`${baseKey}:occurrence:${occurrenceIndex}`).digest('hex');
      for (const index of item.rows) keysByIndex[index] = key;
    });
  }

  return symbols.map((row, index) => ({ ...row, stable_symbol_key: keysByIndex[index] }));
}

/** Keep repeated structural nodes distinct in the existing qualified-symbol identity column. */
export function disambiguateAstOccurrenceNamesV1(nodes) {
  if (!Array.isArray(nodes)) throw new Error('AST_OCCURRENCE_LIST_REQUIRED');
  const groups = new Map();
  nodes.forEach((node, index) => {
    if (!node || typeof node.node_kind !== 'string' || typeof node.qualified_symbol !== 'string') {
      throw new Error(`AST_OCCURRENCE_IDENTITY_REQUIRED:${index}`);
    }
    const baseKey = `${node.node_kind}\u0000${node.qualified_symbol}`;
    const occurrenceKey = JSON.stringify([node.start_byte ?? null, node.end_byte ?? null]);
    const group = groups.get(baseKey) ?? new Map();
    const occurrence = group.get(occurrenceKey) ?? { startByte: node.start_byte, endByte: node.end_byte, rows: [] };
    occurrence.rows.push(index);
    group.set(occurrenceKey, occurrence);
    groups.set(baseKey, group);
  });

  const names = nodes.map(node => node.qualified_symbol);
  for (const [baseKey, occurrenceByKey] of groups) {
    const separator = baseKey.indexOf('\u0000');
    const baseName = baseKey.slice(separator + 1);
    const occurrences = [...occurrenceByKey.entries()].sort(([keyA, a], [keyB, b]) =>
      Number(a.startByte ?? -1) - Number(b.startByte ?? -1)
      || Number(a.endByte ?? -1) - Number(b.endByte ?? -1)
      || compare(keyA, keyB));
    if (occurrences.length < 2) continue;
    occurrences.forEach(([, occurrence], ordinal) => {
      const name = ordinal === 0 ? baseName : `${baseName}#occurrence:${ordinal}`;
      for (const index of occurrence.rows) names[index] = name;
    });
  }
  return nodes.map((node, index) => ({ ...node, qualified_symbol: names[index] }));
}

export function verifySymbolObservationReadback(expected, observed) {
  const rejects = [];
  if (observed.bindings?.length !== 1 || observed.bindings[0]?.parse_status !== 'PROCESSED') {
    rejects.push('CURRENT_ADMITTED_PROCESSED_BINDING_REQUIRED');
  }
  for (const [family, fields] of [
    ['symbols', ['stable_symbol_key', 'source_text_hash', 'ast_fingerprint', 'start_byte', 'end_byte']],
    ['ast', ['node_kind', 'qualified_symbol', 'source_revision', 'source_content_hash', 'parser_name', 'parser_version', 'start_byte', 'end_byte']],
  ]) {
    const key = row => family === 'symbols' ? row.stable_symbol_key : `${row.node_kind}\u0000${row.qualified_symbol}`;
    const wanted = new Map();
    for (const row of expected[family]) {
      const id = key(row);
      const previous = wanted.get(id);
      if (previous && fields.some(field => previous[field] !== row[field])) rejects.push(`${family}:CONFLICTING_EXPECTED_IDENTITY`);
      wanted.set(id, row);
    }
    const found = new Map();
    for (const row of observed[family]) {
      const id = key(row);
      if (found.has(id)) rejects.push(`${family}:DUPLICATE_STORED_IDENTITY`);
      found.set(id, row);
    }
    for (const [id, row] of wanted) {
      const actual = found.get(id);
      if (!actual || fields.some(field => String(actual[field]) !== String(row[field]))) {
        rejects.push(`${family}:OBSERVATION_MISSING_OR_MISMATCH:${id}`);
      }
    }
    for (const id of found.keys()) if (!wanted.has(id)) rejects.push(`${family}:UNEXPECTED_OBSERVATION:${id}`);
  }
  return { proven: rejects.length === 0, rejects,
    codeSymbolCount: observed.symbols.length, astNodeCount: observed.ast.length };
}

export function requireSymbolBatchHeadroom(availableBytes, minimumBytes = 2 * 1024 ** 3) {
  if (!Number.isFinite(availableBytes) || !Number.isFinite(minimumBytes) || minimumBytes < 1024 ** 3) {
    throw new Error('SYMBOL_BATCH_HEADROOM_CONFIG_INVALID');
  }
  if (availableBytes < minimumBytes) throw new Error('SYMBOL_BATCH_DISK_HEADROOM_REQUIRED');
}
