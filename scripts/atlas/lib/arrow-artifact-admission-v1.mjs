/**
 * Arrow artifact admission (M13 Phase B).
 *
 * Every check runs before any row data is returned. The order is fixed:
 *   1. SHA-256 of the whole file against the descriptor (verifyArtifactChecksum). Nothing is parsed before this.
 *   2. Arrow IPC parse.
 *   3. Schema: exact field names, order and types from the descriptor.
 *   4. Row range inside the artifact, and row_count matches.
 *   5. Source revision in the descriptor equals the revision the caller expects.
 *   6. Every numeric value is finite.
 * A refusal returns { ok:false, reason } and never a partial table. Only an ok result may reach tensor construction.
 */
import { readFileSync } from 'node:fs';
import { tableFromIPC } from 'apache-arrow';
import { verifyArtifactChecksum } from './arrow-artifact-checksum-v1.mjs';

const NUMERIC = 'Float';

/**
 * @param {string} filePath
 * @param {{ artifact_sha256: string, schema: string[], row_range: [number, number], row_count: number, source_revision: string }} descriptor
 * @param {string} expectedSourceRevision
 */
export async function admitArrowArtifact(filePath, descriptor, expectedSourceRevision) {
  if (!descriptor || typeof descriptor !== 'object') return { ok: false, reason: 'DESCRIPTOR_MISSING' };
  const check = await verifyArtifactChecksum(filePath, descriptor.artifact_sha256);
  if (!check.ok) return { ok: false, reason: check.reason };

  let table;
  try {
    table = tableFromIPC(readFileSync(filePath));
  } catch {
    return { ok: false, reason: 'ARROW_PARSE_FAILED' };
  }

  const names = table.schema.fields.map((f) => f.name);
  if (names.length !== descriptor.schema.length || names.some((n, i) => n !== descriptor.schema[i].split(':')[0])) {
    return { ok: false, reason: 'SCHEMA_MISMATCH' };
  }
  for (let i = 0; i < names.length; i++) {
    const declared = descriptor.schema[i].split(':')[1];
    const type = table.schema.fields[i].type;
    // apache-arrow dictionary-encodes string columns by default, so a Dictionary<Utf8> is an admitted utf8 column.
    const typeName = type.dictionary ? type.dictionary.toString() : type.toString();
    const ok = declared === 'utf8' ? typeName === 'Utf8' : declared === 'f32' ? typeName.startsWith(NUMERIC) : false;
    if (!ok) return { ok: false, reason: 'DTYPE_MISMATCH' };
  }

  const [start, end] = descriptor.row_range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > table.numRows || end - start !== descriptor.row_count) {
    return { ok: false, reason: 'ROW_RANGE_INVALID' };
  }

  if (descriptor.source_revision !== expectedSourceRevision) {
    return { ok: false, reason: 'SOURCE_REVISION_MISMATCH' };
  }

  for (let i = 1; i < names.length; i++) {
    const column = table.getChildAt(i);
    for (let r = start; r < end; r++) {
      const v = column.get(r);
      if (!Number.isFinite(v)) return { ok: false, reason: 'NON_FINITE_VALUE' };
    }
  }

  return { ok: true, rowCount: end - start, sha256: check.sha256, table };
}
