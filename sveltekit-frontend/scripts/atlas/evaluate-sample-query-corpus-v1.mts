#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { createAtlasDuckDB, parsePgVector } from '../../../packages/atlas-duckdb/src/index.ts';
import { candidateOrdinalMapV1Schema } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { candidateFeatureColumnarV1Schema } from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import { CandidateOrdinalSetV1Schema } from '../../src/lib/server/atlas/kernel/candidate-ordinal-set-v1.js';
import {
  adaptCandidateFeatureColumnarToSampleQueryMatrixV1,
  adaptExactCandidateOrdinalSetToSamplingTargetSetV1,
  adaptSemanticRowsToRowL2SampleQueryMatrixV1,
} from '../../src/lib/server/atlas/sampling/sample-query-artifact-adapters-v1.js';
import { compareSamplingMatricesV1 } from '../../src/lib/server/atlas/sampling/sample-query-corpus-evaluation-v1.js';

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requireArg(name: string): string {
  const value = arg(name)?.trim();
  if (!value) throw new Error(`SAMPLE_QUERY_CORPUS_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function seedsFromArg(value: string | undefined): number[] {
  const raw = value ?? '1,7,42,99,2026,65537,104729';
  const seeds = raw.split(',').map((item) => Number.parseInt(item.trim(), 10));
  if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error('SAMPLE_QUERY_CORPUS_SEEDS_INVALID');
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('SAMPLE_QUERY_CORPUS_SEEDS_DUPLICATE');
  return seeds;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function assertReadable(filePath: string, code: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(code);
  } catch {
    throw new Error(`${code}:${filePath}`);
  }
}

async function loadSemanticRows(parquetPath: string): Promise<Array<{ packetKey: string; values: number[] }>> {
  const db = await createAtlasDuckDB({ databasePath: ':memory:' });
  try {
    const rows = await db.connection.query(`
      SELECT packet_key, semantic_embedding_768
      FROM read_parquet('${escapeSqlLiteral(path.resolve(parquetPath))}')
      ORDER BY packet_key
    `);
    if (rows.length === 0) throw new Error('SAMPLE_QUERY_SEMANTIC_PARQUET_EMPTY');
    return rows.map((row) => ({
      packetKey: String(row.packet_key ?? '').trim(),
      values: parsePgVector(row.semantic_embedding_768),
    }));
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const ordinalMapPath = path.resolve(requireArg('ordinal-map'));
  const semanticParquetPath = path.resolve(requireArg('semantic-parquet'));
  const featureColumnarPath = path.resolve(requireArg('feature-columnar'));
  const exactCandidateSetPath = path.resolve(requireArg('exact-candidate-set'));
  const outputPath = path.resolve(requireArg('output'));
  const sampleSize = Number.parseInt(arg('sample-size', '64')!, 10);
  const topK = Number.parseInt(arg('target-k', '10')!, 10);
  const seeds = seedsFromArg(arg('seeds'));
  const producerRevision = arg('producer-revision', 'sample-query-corpus-evaluator:v1')!;

  if (!Number.isInteger(sampleSize) || sampleSize <= 0) throw new Error('SAMPLE_QUERY_CORPUS_SAMPLE_SIZE_INVALID');
  if (!Number.isInteger(topK) || topK <= 0) throw new Error('SAMPLE_QUERY_CORPUS_TARGET_K_INVALID');

  await Promise.all([
    assertReadable(ordinalMapPath, 'SAMPLE_QUERY_ORDINAL_MAP_NOT_FOUND'),
    assertReadable(semanticParquetPath, 'SAMPLE_QUERY_SEMANTIC_PARQUET_NOT_FOUND'),
    assertReadable(featureColumnarPath, 'SAMPLE_QUERY_FEATURE_COLUMNAR_NOT_FOUND'),
    assertReadable(exactCandidateSetPath, 'SAMPLE_QUERY_EXACT_CANDIDATE_SET_NOT_FOUND'),
  ]);

  const ordinalMap = candidateOrdinalMapV1Schema.parse(await readJson(ordinalMapPath));
  const columnar = candidateFeatureColumnarV1Schema.parse(await readJson(featureColumnarPath));
  const exactCandidateSet = CandidateOrdinalSetV1Schema.parse(await readJson(exactCandidateSetPath));
  const semanticRows = await loadSemanticRows(semanticParquetPath);
  const semanticArtifactChecksum = await sha256File(semanticParquetPath);

  const semanticMatrix = adaptSemanticRowsToRowL2SampleQueryMatrixV1({
    ordinalMap,
    semanticRows,
    expectedDimension: 768,
    sourceMatrixRevision: exactCandidateSet.representationRevision,
    sourceArtifactChecksum: semanticArtifactChecksum,
    producerRevision,
  });

  const featureMatrix = adaptCandidateFeatureColumnarToSampleQueryMatrixV1({
    ordinalMap,
    columnar,
    mode: 'COLUMN_STANDARDIZED_WITH_PRESENCE',
    producerRevision,
  });

  const targetSet = adaptExactCandidateOrdinalSetToSamplingTargetSetV1({
    candidateSet: exactCandidateSet,
    topK,
    producerRevision,
  });

  if (sampleSize > ordinalMap.rowCount) {
    throw new Error(`SAMPLE_QUERY_CORPUS_SAMPLE_SIZE_EXCEEDS_CANDIDATES:${sampleSize}:${ordinalMap.rowCount}`);
  }

  const comparison = compareSamplingMatricesV1({
    left: semanticMatrix,
    right: featureMatrix,
    targetSet,
    sampleSize,
    seeds,
    producerRevision,
  });

  const receipt = {
    schema: 'atlas.sample-query-real-corpus-proof.v1',
    status: 'SAMPLE_QUERY_REAL_CORPUS_MEASURED_NOT_PROMOTED',
    inputs: {
      ordinalMapPath,
      semanticParquetPath,
      semanticArtifactChecksum,
      featureColumnarPath,
      exactCandidateSetPath,
      candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      rowCount: ordinalMap.rowCount,
      targetK: topK,
      sampleSize,
      seeds,
    },
    semantic: {
      matrixChecksum: semanticMatrix.matrixChecksum,
      rowNormCoefficientOfVariation: semanticMatrix.rowNormCoefficientOfVariation,
      lengthSquaredDegeneratesTowardUniform: semanticMatrix.lengthSquaredDegeneratesTowardUniform,
      columnCount: semanticMatrix.columnCount,
    },
    feature: {
      matrixChecksum: featureMatrix.matrixChecksum,
      rowNormCoefficientOfVariation: featureMatrix.rowNormCoefficientOfVariation,
      lengthSquaredDegeneratesTowardUniform: featureMatrix.lengthSquaredDegeneratesTowardUniform,
      columnCount: featureMatrix.columnCount,
      featureProjection: 'COLUMN_STANDARDIZED_WITH_PRESENCE',
    },
    comparison,
    interpretation: {
      lengthSquaredBeatsUniformOnFeatureMatrix: comparison.right.lengthSquaredDeltaVsUniformMean > 0,
      lowRankPromotionAuthorized: false,
      rtxAccelerationAuthorized: false,
      retrievalVoteProduced: false,
    },
    canonicalWritesAttempted: false,
    postgresAccessed: false,
    qdrantAccessed: false,
    neo4jAccessed: false,
    valkeyAccessed: false,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
