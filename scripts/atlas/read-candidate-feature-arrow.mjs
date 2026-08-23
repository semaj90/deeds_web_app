/**
 * FEAT-03C-JS — immutable file-backed readback verification for
 * CandidateFeatureColumnarV1 Arrow IPC FILE artifacts.
 *
 * Important: Node does not expose an OS mmap primitive here. This verifier reads
 * the immutable Arrow file from its ArtifactAddressV1 locator, verifies checksum
 * + revision lineage, parses the IPC FILE, and proves exact ordinal / selected
 * feature readback. A separate Python/PyArrow proof owns the true mmap gate.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { tableFromIPC } from 'apache-arrow';

export const CANDIDATE_FEATURE_ARROW_SCHEMA = 'atlas.candidate-feature-arrow-ipc.v1';
export const CANDIDATE_FEATURE_ARROW_READBACK_SCHEMA = 'atlas.candidate-feature-arrow-readback-receipt.v1';

export const CANDIDATE_FEATURE_ARROW_FEATURE_NAMES = Object.freeze([
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
]);

const IDENTITY_COLUMNS = Object.freeze([
  ['canonical_id', 'canonicalIds'],
  ['packet_key', 'packetKeys'],
  ['tree_node_id', 'treeNodeIds'],
  ['symbol_version_id', 'symbolVersionIds'],
  ['source_revision', 'sourceRevisions'],
  ['graph_revision', 'graphRevisions'],
  ['semantic_revision', 'semanticRevisions'],
  ['degraded_identity', 'degradedIdentity'],
  ['lane_mask_u16', 'laneMaskU16'],
]);

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
    throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_INVALID_CHECKSUM:${name}`);
  }
}

function artifactFromEnvelope(input) {
  return input?.artifact ?? input;
}

export function validateCandidateFeatureArrowArtifact(artifactInput) {
  const artifact = artifactFromEnvelope(artifactInput);
  if (!artifact || artifact.schema !== 'atlas.artifact-address.v1') {
    throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_ARTIFACT_ADDRESS_REQUIRED');
  }
  if (artifact.schemaId !== CANDIDATE_FEATURE_ARROW_SCHEMA) {
    throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_SCHEMA_MISMATCH:${artifact.schemaId}`);
  }
  if (artifact.locator?.storage !== 'ARROW_IPC' || typeof artifact.locator.path !== 'string' || !artifact.locator.path) {
    throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_ARROW_LOCATOR_REQUIRED');
  }
  for (const name of ['artifactHash', 'checksum', 'revisionSetHash']) assertChecksum(artifact[name], name);
  if (!artifact.revisions || typeof artifact.revisions !== 'object' || Array.isArray(artifact.revisions)) {
    throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_REVISIONS_REQUIRED');
  }

  const revisionSetHash = sha256(canonicalJson(artifact.revisions));
  if (revisionSetHash !== artifact.revisionSetHash) {
    throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_REVISION_SET_HASH_MISMATCH:${revisionSetHash}:${artifact.revisionSetHash}`);
  }
  const artifactHash = sha256(canonicalJson({
    schemaId: artifact.schemaId,
    checksum: artifact.checksum,
    revisionSetHash: artifact.revisionSetHash,
  }));
  if (artifactHash !== artifact.artifactHash || artifact.artifactId !== `sha256:${artifactHash}`) {
    throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_ARTIFACT_HASH_MISMATCH');
  }
  return artifact;
}

function vectorValue(vector, index) {
  const value = vector?.get(index);
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function assertSame(actual, expected, errorCode) {
  if (actual !== expected) throw new Error(`${errorCode}:expected=${String(expected)}:actual=${String(actual)}`);
}

function assertExpectedColumnar(table, expected) {
  if (!expected) return;
  if (expected.schema !== 'atlas.candidate-feature-columnar.v1') {
    throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_EXPECTED_COLUMNAR_SCHEMA_REQUIRED');
  }
  assertSame(table.numRows, expected.rowCount, 'CANDIDATE_FEATURE_ARROW_READBACK_EXPECTED_ROW_COUNT_MISMATCH');

  const ordinals = table.getChild('candidate_ordinal');
  for (let row = 0; row < expected.rowCount; row += 1) {
    assertSame(Number(ordinals?.get(row)), expected.candidateOrdinals[row], `CANDIDATE_FEATURE_ARROW_READBACK_ORDINAL_MISMATCH:${row}`);
  }

  for (const [arrowName, expectedName] of IDENTITY_COLUMNS) {
    const vector = table.getChild(arrowName);
    if (!vector) throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_COLUMN_MISSING:${arrowName}`);
    const expectedValues = expected[expectedName];
    if (!Array.isArray(expectedValues) || expectedValues.length !== expected.rowCount) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_EXPECTED_COLUMN_INVALID:${expectedName}`);
    }
    for (let row = 0; row < expected.rowCount; row += 1) {
      const actual = vectorValue(vector, row);
      const expectedValue = expectedValues[row];
      const normalizedActual = typeof expectedValue === 'boolean' ? Boolean(actual) : actual;
      assertSame(normalizedActual, expectedValue, `CANDIDATE_FEATURE_ARROW_READBACK_IDENTITY_MISMATCH:${arrowName}:${row}`);
    }
  }
}

function selectedFeatureRows(table, expected, selectedOrdinals, selectedFeatures) {
  const rows = [];
  for (const ordinal of selectedOrdinals) {
    const canonicalId = vectorValue(table.getChild('canonical_id'), ordinal);
    const features = {};
    for (const featureName of selectedFeatures) {
      const valueVector = table.getChild(featureName);
      const presenceVector = table.getChild(`${featureName}_present`);
      if (!valueVector || !presenceVector) {
        throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_FEATURE_COLUMN_MISSING:${featureName}`);
      }
      const value = Number(valueVector.get(ordinal));
      const present = Number(presenceVector.get(ordinal));
      if (!Number.isFinite(value) || (present !== 0 && present !== 1)) {
        throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_FEATURE_CELL_INVALID:${ordinal}:${featureName}`);
      }
      if (expected) {
        const featureIndex = expected.featureNames.indexOf(featureName);
        if (featureIndex < 0) throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_EXPECTED_FEATURE_MISSING:${featureName}`);
        const cell = ordinal * expected.featureCount + featureIndex;
        assertSame(Math.fround(value), Math.fround(expected.featureValues[cell]), `CANDIDATE_FEATURE_ARROW_READBACK_FEATURE_VALUE_MISMATCH:${ordinal}:${featureName}`);
        assertSame(present, expected.featurePresence[cell], `CANDIDATE_FEATURE_ARROW_READBACK_FEATURE_PRESENCE_MISMATCH:${ordinal}:${featureName}`);
      }
      features[featureName] = { value, present: present === 1 };
    }
    rows.push({ candidateOrdinal: ordinal, canonicalId, features });
  }
  return rows;
}

export async function readCandidateFeatureArrowFile(input) {
  const artifact = validateCandidateFeatureArrowArtifact(input.artifact);
  const selectedFeatures = input.selectedFeatures?.length
    ? [...new Set(input.selectedFeatures)]
    : [...CANDIDATE_FEATURE_ARROW_FEATURE_NAMES];
  for (const featureName of selectedFeatures) {
    if (!CANDIDATE_FEATURE_ARROW_FEATURE_NAMES.includes(featureName)) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_UNKNOWN_FEATURE:${featureName}`);
    }
  }

  const resolvedPath = path.resolve(artifact.locator.path);
  const handle = await fs.open(resolvedPath, 'r');
  let bytes;
  let stat;
  try {
    stat = await handle.stat();
    if (!stat.isFile()) throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_NOT_REGULAR_FILE');
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }

  const checksum = sha256(bytes);
  if (checksum !== artifact.checksum) {
    throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_FILE_CHECKSUM_MISMATCH:${checksum}:${artifact.checksum}`);
  }
  if (bytes.byteLength < 12) throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_FILE_TOO_SMALL');
  const prefix = bytes.subarray(0, 6).toString('ascii');
  const suffix = bytes.subarray(bytes.byteLength - 6).toString('ascii');
  if (prefix !== 'ARROW1' || suffix !== 'ARROW1') {
    throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_NOT_IPC_FILE:${prefix}:${suffix}`);
  }

  const table = tableFromIPC(bytes);
  const ordinalVector = table.getChild('candidate_ordinal');
  if (!ordinalVector) throw new Error('CANDIDATE_FEATURE_ARROW_READBACK_ORDINAL_COLUMN_MISSING');
  for (let ordinal = 0; ordinal < table.numRows; ordinal += 1) {
    if (Number(ordinalVector.get(ordinal)) !== ordinal) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_NON_DENSE_ORDINAL:${ordinal}:${String(ordinalVector.get(ordinal))}`);
    }
  }

  assertExpectedColumnar(table, input.expectedColumnar ?? null);
  const selectedOrdinals = input.selectedOrdinals?.length
    ? [...new Set(input.selectedOrdinals)]
    : Array.from({ length: table.numRows }, (_, index) => index);
  for (const ordinal of selectedOrdinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= table.numRows) {
      throw new Error(`CANDIDATE_FEATURE_ARROW_READBACK_ORDINAL_OUT_OF_RANGE:${ordinal}`);
    }
  }
  const rows = selectedFeatureRows(table, input.expectedColumnar ?? null, selectedOrdinals, selectedFeatures);

  return {
    artifact,
    rows,
    receipt: {
      schema: CANDIDATE_FEATURE_ARROW_READBACK_SCHEMA,
      artifactId: artifact.artifactId,
      checksum: artifact.checksum,
      revisionSetHash: artifact.revisionSetHash,
      candidateSnapshotRevision: artifact.revisions.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: artifact.revisions.ordinalMapChecksum ?? null,
      featureSnapshotChecksum: artifact.revisions.featureSnapshotChecksum ?? null,
      columnarChecksum: artifact.revisions.columnarChecksum ?? null,
      rowCount: table.numRows,
      selectedRowCount: rows.length,
      selectedFeatures,
      fileByteLength: stat.size,
      ipcFileMagicVerified: true,
      denseOrdinalVerified: true,
      identityColumnsVerified: Boolean(input.expectedColumnar),
      selectedFeatureColumnsVerified: Boolean(input.expectedColumnar),
      randomAccessCapableFormat: true,
      readMode: 'NODE_FILE_BYTES_ARROW_IPC',
      osMmap: false,
      identityAuthority: false,
      canonicalOwnerChanged: false,
    },
  };
}

async function main() {
  const artifactPath = parseArg('artifact');
  const expectedPath = parseArg('expected');
  const featuresArg = parseArg('features');
  const ordinalsArg = parseArg('ordinals');
  if (!artifactPath) {
    console.error('Usage: node scripts/atlas/read-candidate-feature-arrow.mjs --artifact=<artifact-or-receipt.json> [--expected=<columnar.json>] [--features=a,b] [--ordinals=0,1]');
    process.exitCode = 2;
    return;
  }
  const artifactEnvelope = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const expectedColumnar = expectedPath ? JSON.parse(await fs.readFile(expectedPath, 'utf8')) : null;
  const selectedFeatures = featuresArg ? featuresArg.split(',').filter(Boolean) : undefined;
  const selectedOrdinals = ordinalsArg ? ordinalsArg.split(',').filter(Boolean).map((value) => Number(value)) : undefined;
  const result = await readCandidateFeatureArrowFile({
    artifact: artifactEnvelope,
    expectedColumnar,
    selectedFeatures,
    selectedOrdinals,
  });
  console.log(JSON.stringify(result.receipt, null, 2));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('read-candidate-feature-arrow.mjs')) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
