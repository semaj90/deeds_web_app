#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { candidateOrdinalMapV1Schema } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { candidateFeatureColumnarV1Schema } from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import { CandidateOrdinalSetV1Schema } from '../../src/lib/server/atlas/kernel/candidate-ordinal-set-v1.js';
import {
  adaptCandidateFeatureColumnarToSampleQueryMatrixV1,
  adaptExactCandidateOrdinalSetToSamplingTargetSetV1,
  adaptSemanticRowsToRowL2SampleQueryMatrixV1,
  SamplingFeatureProjectionModeSchema,
} from '../../src/lib/server/atlas/sampling/sample-query-artifact-adapters-v1.js';
import {
  compareSamplingMatricesV1,
  samplingCorpusChecksum,
} from '../../src/lib/server/atlas/sampling/sample-query-corpus-evaluation-v1.js';
import {
  createAtlasDuckDB,
  parsePgVector,
} from '../../../packages/atlas-duckdb/src/index.ts';

const PRODUCER_REVISION = 'sample-query-corpus-measurement:v1';
const DEFAULT_SEEDS = [1, 7, 42, 99, 1337, 4096, 65537, 104729];

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : null;
}

function requiredArg(name: string): string {
  const value = arg(name)?.trim();
  if (!value) throw new Error(`SAMPLE_QUERY_MEASURE_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = arg(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`SAMPLE_QUERY_MEASURE_INTEGER_INVALID:${name}:${raw}`);
  return value;
}

function parseSeeds(): number[] {
  const raw = arg('seeds');
  if (!raw) return [...DEFAULT_SEEDS];
  const seeds = raw.split(',').map((value) => Number(value.trim()));
  if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error(`SAMPLE_QUERY_MEASURE_SEEDS_INVALID:${raw}`);
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('SAMPLE_QUERY_MEASURE_SEEDS_DUPLICATE');
  return seeds;
}

function sqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readSemanticParquet(filePath: string): Promise<Array<{ packetKey: string; values: number[] }>> {
  const db = await createAtlasDuckDB({ databasePath: ':memory:' });
  try {
    const rows = await db.connection.query(`
      SELECT packet_key, semantic_embedding_768
      FROM read_parquet('${sqlLiteral(path.resolve(filePath))}')
      ORDER BY packet_key
    `);
    return rows.map((row) => ({
      packetKey: String(row.packet_key ?? '').trim(),
      values: parsePgVector(row.semantic_embedding_768),
    }));
  } finally {
    await db.close();
  }
}

async function main() {
  const ordinalMapPath = path.resolve(requiredArg('ordinal-map'));
  const semanticParquetPath = path.resolve(requiredArg('semantic-parquet'));
  const featureColumnarPath = path.resolve(requiredArg('feature-columnar'));
  const exactCandidateSetPath = path.resolve(requiredArg('exact-candidate-set'));
  const outputPath = path.resolve(requiredArg('output'));
  const sampleSize = parsePositiveInt('sample-size', 128);
  const targetTopK = parsePositiveInt('target-top-k', 10);
  const seeds = parseSeeds();
  const featureMode = SamplingFeatureProjectionModeSchema.parse(
    arg('feature-mode') ?? 'COLUMN_STANDARDIZED_WITH_PRESENCE',
  );

  const ordinalMap = candidateOrdinalMapV1Schema.parse(await readJson(ordinalMapPath));
  const columnar = candidateFeatureColumnarV1Schema.parse(await readJson(featureColumnarPath));
  const exactCandidateSet = CandidateOrdinalSetV1Schema.parse(await readJson(exactCandidateSetPath));

  if (sampleSize > ordinalMap.rowCount) {
    throw new Error(`SAMPLE_QUERY_MEASURE_SAMPLE_SIZE_EXCEEDS_WORLD:${sampleSize}:${ordinalMap.rowCount}`);
  }

  const semanticArtifactChecksum = await sha256File(semanticParquetPath);
  const semanticRows = await readSemanticParquet(semanticParquetPath);
  if (semanticRows.length !== ordinalMap.rowCount) {
    throw new Error(`SAMPLE_QUERY_MEASURE_SEMANTIC_ROW_COUNT_MISMATCH:${semanticRows.length}:${ordinalMap.rowCount}`);
  }

  const semanticMatrix = adaptSemanticRowsToRowL2SampleQueryMatrixV1({
    ordinalMap,
    semanticRows,
    expectedDimension: 768,
    sourceMatrixRevision: `semantic_768:${semanticArtifactChecksum.slice(0, 16)}`,
    sourceArtifactChecksum: semanticArtifactChecksum,
    producerRevision: PRODUCER_REVISION,
  });

  const featureMatrix = adaptCandidateFeatureColumnarToSampleQueryMatrixV1({
    ordinalMap,
    columnar,
    mode: featureMode,
    producerRevision: PRODUCER_REVISION,
  });

  const targetSet = adaptExactCandidateOrdinalSetToSamplingTargetSetV1({
    candidateSet: exactCandidateSet,
    topK: targetTopK,
    producerRevision: PRODUCER_REVISION,
  });

  const comparison = compareSamplingMatricesV1({
    left: semanticMatrix,
    right: featureMatrix,
    targetSet,
    sampleSize,
    seeds,
    producerRevision: PRODUCER_REVISION,
  });

  const inputFiles = {
    ordinalMap: { path: ordinalMapPath, checksum: await sha256File(ordinalMapPath) },
    semanticParquet: { path: semanticParquetPath, checksum: semanticArtifactChecksum },
    featureColumnar: { path: featureColumnarPath, checksum: await sha256File(featureColumnarPath) },
    exactCandidateSet: { path: exactCandidateSetPath, checksum: await sha256File(exactCandidateSetPath) },
  };

  const receiptPayload = {
    schema: 'atlas.sample-query-real-corpus-proof.v1',
    status: 'SAMPLE_QUERY_REAL_CORPUS_MEASURED_NOT_PROMOTED',
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    rowCount: ordinalMap.rowCount,
    semanticDimension: semanticMatrix.columnCount,
    featureDimension: featureMatrix.columnCount,
    featureMode,
    targetKind: targetSet.targetKind,
    targetCount: targetSet.targetOrdinals.length,
    sampleSize,
    seeds,
    inputFiles,
    comparison,
    semanticRowBinding: 'PACKET_KEY_TO_CANDIDATE_ORDINAL',
    sourceRowNumberUsedAsIdentity: false,
    exactTargetRequired: true,
    measurementOnly: true,
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    promotionAuthorized: false,
    producerRevision: PRODUCER_REVISION,
  } as const;

  const receipt = {
    ...receiptPayload,
    receiptChecksum: samplingCorpusChecksum(receiptPayload),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
