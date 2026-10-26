/**
 * REGISTRY-LUT-01d (design, dry-run only): packet_key-keyed replacement plan for the two label-keyed updaters
 * (`derive-openspec-ids.mjs` / `derive-gsd-ids.mjs`, which run `UPDATE atlas_packets ... WHERE title_id = $2`).
 *
 * PURE: takes fanout entries and an `atlas_packets` snapshot as arguments; no DB, no network, no writes, no SQL execution.
 * The statement shape it reports is DATA (`executable: false`); nothing here can be passed to a database client.
 * title_id is only a CONSISTENCY CHECK on the label, never the key. A plan entry is never apply-ready:
 * `sourceBindingEvidence` is NOT_PROVIDED (the fanout report carries no source_revision/source_digest), so the best status is
 * QUALIFIED_DRY_RUN_ONLY and `applyReady` is always false. An independent source-binding readback is a separate gate.
 */
export const PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1 = Object.freeze({
  executable: false,
  template: 'UPDATE atlas_packets SET <openspec_id|gsd_id> = $1 WHERE packet_key = $2 AND source_ref = $3',
  keyedBy: ['packet_key', 'source_ref'],
  labelUsedAsKey: false,
});

const text = (v) => (typeof v === 'string' && v.trim() ? v : null);

/**
 * @param {{files: Array<object>, packetRows: Array<{packet_key:string, source_ref:string|null, title_id:string|null}>,
 *          assign: (file:object)=>string|null, aliasKeys?: Set<string>}} input
 */
export function planPacketKeyIdUpdatesV1({ files, packetRows, assign, aliasKeys = new Set() }) {
  if (!Array.isArray(files) || !Array.isArray(packetRows) || typeof assign !== 'function') throw new TypeError('PLAN_INPUT_INVALID');
  const rowsByKey = new Map();
  const duplicateDbKeys = new Set();
  for (const row of packetRows) {
    if (rowsByKey.has(row.packet_key)) duplicateDbKeys.add(row.packet_key);
    rowsByKey.set(row.packet_key, row);
  }
  const seenInInput = new Map();
  const entries = [];
  const counts = {};
  const bump = (status) => { counts[status] = (counts[status] ?? 0) + 1; };

  for (const [index, file] of files.entries()) {
    const packetKey = text(file?.packet_key);
    const sourceRef = text(file?.source_ref);
    const value = assign(file);
    let status;
    let detail = null;
    if (!packetKey) status = 'BLOCKED_PACKET_KEY_MISSING';
    else if (!sourceRef) status = 'BLOCKED_SOURCE_REF_MISSING';
    else if (!value) status = 'BLOCKED_NO_ASSIGNMENT';
    else if (duplicateDbKeys.has(packetKey)) status = 'BLOCKED_DUPLICATE_PACKET_KEY_IN_DB';
    else {
      const prior = seenInInput.get(packetKey);
      if (prior && prior.value !== value) { status = 'BLOCKED_CONFLICTING_ASSIGNMENT_FOR_PACKET_KEY'; detail = { first: prior.value, second: value }; }
      else if (prior) status = 'BLOCKED_DUPLICATE_PACKET_KEY_IN_INPUT';
      else {
        const row = rowsByKey.get(packetKey);
        if (!row) status = aliasKeys.has(packetKey) ? 'BLOCKED_ALIAS_ONLY_NEEDS_RESOLVER' : 'BLOCKED_PACKET_KEY_NOT_FOUND';
        else if (row.source_ref !== sourceRef) { status = 'BLOCKED_SOURCE_REF_MISMATCH'; detail = { db: row.source_ref ?? null, input: sourceRef }; }
        else if (text(file.title_id) && text(row.title_id) && file.title_id !== row.title_id) { status = 'BLOCKED_TITLE_LABEL_STALE_OR_MISMATCHED'; detail = { db: row.title_id, input: file.title_id }; }
        else status = 'QUALIFIED_DRY_RUN_ONLY';
        seenInInput.set(packetKey, { value });
      }
    }
    if (packetKey && !seenInInput.has(packetKey) && status !== 'BLOCKED_DUPLICATE_PACKET_KEY_IN_DB') seenInInput.set(packetKey, { value });
    bump(status);
    entries.push({ index, packetKey, sourceRef, value, status, detail });
  }
  return {
    schema: 'atlas.packet-key-id-update-plan.v1',
    statementShape: PACKET_KEY_ID_UPDATE_STATEMENT_SHAPE_V1,
    counts,
    entries,
    sourceBindingEvidence: 'NOT_PROVIDED',
    applyReady: false,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}

/** Parse a read-only `atlas_packets` snapshot: TSV lines `packet_key<TAB>source_ref<TAB>title_id` (empty field = null). */
export function parsePacketsSnapshotTsvV1(textValue) {
  if (typeof textValue !== 'string') throw new TypeError('SNAPSHOT_TEXT_REQUIRED');
  return textValue.split(/\r?\n/).filter(Boolean).map((line, i) => {
    const [packet_key, source_ref = '', title_id = ''] = line.split('\t');
    if (!packet_key) throw new Error(`SNAPSHOT_LINE_INVALID:${i + 1}`);
    return { packet_key, source_ref: source_ref || null, title_id: title_id || null };
  });
}
