#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { materializeCandidateOrdinalMap } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  evaluateSamplingPoliciesV1,
  materializeSampleQueryMatrixV1,
  sampleCandidateOrdinalsV1,
} from '../../src/lib/server/atlas/sampling/sample-query-matrix-v1.js';

const OUTPUT_ARG = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = OUTPUT_ARG ? resolve(process.cwd(), OUTPUT_ARG.slice('--output='.length)) : null;
const producerRevision = 'prove-sample-query-matrix-v1:2026-08-22';
const seed = 0xa71a5;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function makeOrdinalMap(rowCount: number) {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:ewintang-fixture:v1',
    workspaceRevision: 'workspace:ewintang-fixture:v1',
    producerRevision,
    candidates: Array.from({ length: rowCount }, (_, index) => ({
      canonicalId: `fixture:canonical:${String(index).padStart(2, '0')}`,
      packetKey: `fixture:packet:${index}`,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: 'workspace:ewintang-fixture:v1',
      sourceRevision: `fixture:source:${index}`,
      graphRevision: 'fixture:graph:v1',
      semanticRevision: 'fixture:semantic:v1',
      degradedIdentity: false,
      evidenceRefs: [`fixture:evidence:${index}`],
    })),
  });
}

const equalNormRows = [
  [1, 0],
  [0, 1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
] as const;

const unequalNormRows = [
  [0.1, 0],
  [0.2, 0],
  [3, 0],
  [6, 0],
] as const;

const ordinalMap = makeOrdinalMap(equalNormRows.length);

const normalizedMatrix = materializeSampleQueryMatrixV1({
  ordinalMap,
  rows: equalNormRows.map((values, candidateOrdinal) => ({ candidateOrdinal, values })),
  sourceMatrixRevision: 'fixture:row-l2:v1',
  sourceMatrixChecksum: sha256(JSON.stringify(equalNormRows)),
  matrixRole: 'SEMANTIC_RESIDUAL',
  normalization: 'ROW_L2',
  producerRevision,
});

const unequalMatrix = materializeSampleQueryMatrixV1({
  ordinalMap,
  rows: unequalNormRows.map((values, candidateOrdinal) => ({ candidateOrdinal, values })),
  sourceMatrixRevision: 'fixture:unequal-norm:v1',
  sourceMatrixChecksum: sha256(JSON.stringify(unequalNormRows)),
  matrixRole: 'CANDIDATE_FEATURE',
  normalization: 'NONE',
  producerRevision,
});

const normalizedLengthSquared = sampleCandidateOrdinalsV1({
  matrix: normalizedMatrix,
  policy: 'LENGTH_SQUARED',
  sampleSize: 2,
  seed,
  producerRevision,
});
const normalizedUniform = sampleCandidateOrdinalsV1({
  matrix: normalizedMatrix,
  policy: 'UNIFORM',
  sampleSize: 2,
  seed,
  producerRevision,
});

if (!normalizedMatrix.lengthSquaredDegeneratesTowardUniform) {
  throw new Error('EWINTANG_NORMALIZED_UNIFORMITY_GATE_FAILED');
}
if (JSON.stringify(normalizedLengthSquared.selectedOrdinals) !== JSON.stringify(normalizedUniform.selectedOrdinals)) {
  throw new Error('EWINTANG_EQUAL_NORM_LENGTH_SQUARED_DIVERGED_FROM_UNIFORM');
}

const unequalEvaluation = evaluateSamplingPoliciesV1({
  matrix: unequalMatrix,
  targetOrdinals: [2, 3],
  sampleSize: 2,
  seed,
  producerRevision,
});

if (unequalMatrix.lengthSquaredDegeneratesTowardUniform) {
  throw new Error('EWINTANG_UNEQUAL_NORM_MATRIX_FALSELY_CLASSIFIED_UNIFORM');
}

const receipt = {
  schema: 'atlas.sample-query-matrix-proof-receipt.v1',
  status: 'SAMPLE_QUERY_MATRIX_FIXTURE_PROVEN',
  seed,
  normalizedCase: {
    matrixChecksum: normalizedMatrix.matrixChecksum,
    normalization: normalizedMatrix.normalization,
    rowNormCoefficientOfVariation: normalizedMatrix.rowNormCoefficientOfVariation,
    lengthSquaredDegeneratesTowardUniform: normalizedMatrix.lengthSquaredDegeneratesTowardUniform,
    lengthSquaredOrdinals: normalizedLengthSquared.selectedOrdinals,
    uniformOrdinals: normalizedUniform.selectedOrdinals,
    sameSelection: true,
  },
  unequalNormCase: {
    matrixChecksum: unequalMatrix.matrixChecksum,
    normalization: unequalMatrix.normalization,
    rowNormCoefficientOfVariation: unequalMatrix.rowNormCoefficientOfVariation,
    lengthSquaredDegeneratesTowardUniform: unequalMatrix.lengthSquaredDegeneratesTowardUniform,
    evaluation: unequalEvaluation,
  },
  guarantees: {
    candidateOrdinalAligned: true,
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    promotionAuthorized: false,
    databaseReadAttempted: false,
    qdrantReadAttempted: false,
    neo4jReadAttempted: false,
    valkeyReadAttempted: false,
  },
  producerRevision,
};

const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (outputPath) {
  await writeFile(outputPath, serialized, 'utf8');
}
process.stdout.write(serialized);
