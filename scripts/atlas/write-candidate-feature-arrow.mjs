#!/usr/bin/env node

/**
 * FEAT-03B — serialize CandidateFeatureColumnarV1 into Arrow IPC FILE format.
 *
 * Input JSON is the output of materializeCandidateFeatureColumnar(). This root-workspace
 * writer intentionally reuses the repository's existing apache-arrow dependency and
 * ArtifactAddressV1 vocabulary rather than introducing a second Arrow/artifact owner.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { tableFromArrays, tableFromIPC, tableToIPC } from 'apache-arrow';

export const CANDIDATE_FEATURE_ARROW_SCHEMA = 'atlas.candidate-feature-arrow-ipc.v1';

const FEATURE_NAMES = [
  'semanticRelevance',
  'lexicalRelevance',
  'astAffinity',
  'graphAuthority',
  'personalizedPageRank',
  'communityAffinity',
  'manifold4OrientationSimilarity',
  'crossEncoderRawScore',
  'crossEncoderCalibratedScore',
  'domainAffinity',
  'executionUtility',
  'memoryUtility',
];

function parseArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertChecksum(value, name) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`CANDIDATE_FEATURE_ARROW_INVALID_CHECKSUM:${name}`);
  }
}

export function validateCandidateFeatureColumnar(input) {
  if (!input || input.schema !== 'atlas.candidate-feature-columnar.v1') {
    throw new Error('CANDIDATE_FEATURE_ARROW_COLUMNAR_SCHEMA_REQUIRED');
  }
  if (input.byteOrder !== 'little-endian' || input.featureDtype !== 'float32' || input.presenceDtype !== 'uint8') {
    throw new Error('CANDIDATE_FEATURE_ARROW_PHYSICAL_TYPE_MISMATCH');
  }
  if (input.ordinalDtype !== 'uint32' || input.laneMaskDtype !== 'uint16') {
    throw new Error('CANDIDATE_FEATURE_ARROW_INDEX_TYPE_MISMATCH');
  }
  if (input.logicalRowsOnly !== true || input.identityAuthority !== false || input.canonicalOwnerChanged !== false) {
    throw new Error('CANDIDATE_FEATURE_ARROW_OWNERSHIP_INVARIANT_VIOLATION');
  }
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) throw new Error('CANDIDATE_FEATURE_ARROW_ROW_COUNT_INVALID');
  if (input.featureCount !== FEATURE_NAMES.length) throw new Error('CANDIDATE_FEATURE_ARROW_FEATURE_COUNT_MISMATCH');
  if (JSON.stringify(input.featureNames) !== JSON.stringify(FEATURE_NAMES)) throw new Error('CANDIDATE_FEATURE_ARROW_FEATURE_ORDER_MISMATCH');

  const rowColumns = [
    input.candidateOrdinals,
    input.canonicalIds,
    input.packetKeys,
    input.treeNodeIds,
    input.symbolVersionIds,
    input.sourceRevisions,
    input.graphRevisions,
    input.semanticRevisions,
    input.degradedIdentity,
    input.laneMaskU16,
  ];
  for (const column of rowColumns) {
    if (!Array.isArray(column) || column.length !== input.rowCount) {
      throw new Error('CANDIDATE_FEATURE_ARROW_ROW_COLUMN_LENGTH_MISMATCH');
    }
  }

  const cells = input.rowCount * input.featureCount;
  if (!Array.isArray(input.featureValues) || input.featureValues.length !== cells) {
    throw new Error('CANDIDATE_FEATURE_ARROW_VALUE_LENGTH_MISMATCH');
  }
  if (!Array.isArray(input.featurePresence) || input.featurePresence.length !== cells) {
    throw new Error('CANDIDATE_FEATURE_ARROW_PRESENCE_LENGTH_MISMATCH');
  }
  if (input.featureValues.some((value) => !Number.isFinite(value))) {
    throw new Error('CANDIDATE_FEATURE_ARROW_NON_FINITE_VALUE');
  }
  if (input.featurePresence.some((value) => value !== 0 && value !== 1)) {
    throw new Error('CANDIDATE_FEATURE_ARROW_INVALID_PRESENCE');
  }
  for (let ordinal = 0; ordinal < input.rowCount; ordinal += 1) {
    if (input.candidateOrdinals[ordinal] !== ordinal) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_NON_DENSE_ORDINAL:${ordinal}:${input.candidateOrdinals[ordinal]}`);
    }
  }

  for (const key of [
    'ordinalMapChecksum',
    'featureSnapshotChecksum',
    'candidateOrdinalsChecksum',
    'featureValuesChecksum',
    'featurePresenceChecksum',
    'rowIdentityChecksum',
    'columnarChecksum',
  ]) assertChecksum(input[key], key);

  return input;
}

export function buildCandidateFeatureArrowTable(columnarInput) {
  const input = validateCandidateFeatureColumnar(columnarInput);
  const columns = {
    candidate_ordinal: Uint32Array.from(input.candidateOrdinals),
    canonical_id: input.canonicalIds,
    packet_key: input.packetKeys,
    tree_node_id: input.treeNodeIds,
    symbol_version_id: input.symbolVersionIds,
    source_revision: input.sourceRevisions,
    graph_revision: input.graphRevisions,
    semantic_revision: input.semanticRevisions,
    degraded_identity: Uint8Array.from(input.degradedIdentity),
    lane_mask_u16: Uint16Array.from(input.laneMaskU16),
  };

  for (let featureIndex = 0; featureIndex < FEATURE_NAMES.length; featureIndex += 1) {
    const name = FEATURE_NAMES[featureIndex];
    const values = new Float32Array(input.rowCount);
    const presence = new Uint8Array(input.rowCount);
    for (let row = 0; row < input.rowCount; row += 1) {
      const cell = row * input.featureCount + featureIndex;
      values[row] = input.featureValues[cell];
      presence[row] = input.featurePresence[cell];
    }
    columns[name] = values;
    columns[`${name}_present`] = presence;
  }

  return tableFromArrays(columns);
}

export function serializeCandidateFeatureArrowFile(columnarInput, outputPath = 'candidate-features.arrow') {
  const input = validateCandidateFeatureColumnar(columnarInput);
  const table = buildCandidateFeatureArrowTable(input);
  if (table.numRows !== input.rowCount) throw new Error('CANDIDATE_FEATURE_ARROW_TABLE_ROW_COUNT_MISMATCH');

  const bytes = tableToIPC(table, 'file');
  const roundtrip = tableFromIPC(bytes);
  if (roundtrip.numRows !== input.rowCount) throw new Error('CANDIDATE_FEATURE_ARROW_ROUNDTRIP_ROW_COUNT_MISMATCH');
  const roundtripOrdinals = roundtrip.getChild('candidate_ordinal');
  for (let ordinal = 0; ordinal < input.rowCount; ordinal += 1) {
    if (Number(roundtripOrdinals?.get(ordinal)) !== ordinal) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_ROUNDTRIP_ORDINAL_MISMATCH:${ordinal}`);
    }
  }

  const checksum = sha256(bytes);
  const revisions = {
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    featureSnapshotChecksum: input.featureSnapshotChecksum,
    featureRevision: input.featureRevision,
    workspaceRevision: input.workspaceRevision,
    columnarChecksum: input.columnarChecksum,
  };
  const revisionSetHash = sha256(canonicalJson(revisions));
  const artifactHash = sha256(canonicalJson({
    schemaId: CANDIDATE_FEATURE_ARROW_SCHEMA,
    checksum,
    revisionSetHash,
  }));
  const artifactId = `sha256:${artifactHash}`;

  return {
    bytes,
    artifact: {
      schema: 'atlas.artifact-address.v1',
      artifactId,
      artifactHash,
      schemaId: CANDIDATE_FEATURE_ARROW_SCHEMA,
      checksum,
      revisionSetHash,
      revisions,
      locator: {
        storage: 'ARROW_IPC',
        path: outputPath,
        recordBatch: 0,
      },
    },
    receipt: {
      schema: 'atlas.candidate-feature-arrow-ipc-write-receipt.v1',
      ipcFormat: 'ARROW_IPC_FILE',
      rowCount: input.rowCount,
      featureCount: input.featureCount,
      byteLength: bytes.byteLength,
      checksum,
      revisionSetHash,
      artifactId,
      ordinalMapChecksum: input.ordinalMapChecksum,
      featureSnapshotChecksum: input.featureSnapshotChecksum,
      columnarChecksum: input.columnarChecksum,
      roundtripRowCount: roundtrip.numRows,
      logicalRowsOnly: true,
      identityAuthority: false,
      canonicalOwnerChanged: false,
    },
  };
}

async function main() {
  const inputPath = parseArg('input');
  const outputPath = parseArg('output');
  const receiptPath = parseArg('receipt', outputPath ? `${outputPath}.receipt.json` : null);
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/atlas/write-candidate-feature-arrow.mjs --input=<columnar.json> --output=<snapshot.arrow> [--receipt=<receipt.json>]');
    process.exitCode = 2;
    return;
  }

  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const { bytes, artifact, receipt } = serializeCandidateFeatureArrowFile(input, outputPath);
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, bytes);

  const fullReceipt = { ...receipt, artifact };
  if (receiptPath) {
    await fs.mkdir(path.dirname(path.resolve(receiptPath)), { recursive: true });
    await fs.writeFile(receiptPath, `${JSON.stringify(fullReceipt, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(fullReceipt, null, 2));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('write-candidate-feature-arrow.mjs')) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
