#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { candidateOrdinalMapV1Schema } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { candidateFeatureColumnarV1Schema } from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import { CandidateOrdinalSetV1Schema } from '../../src/lib/server/atlas/kernel/candidate-ordinal-set-v1.js';
import {
  adaptCandidateFeatureColumnarToSampleQueryMatrixV1,
  adaptExactCandidateOrdinalSetToSamplingTargetSetV1,
  adaptSemanticRowsToRowL2SampleQueryMatrixV1,
} from '../../src/lib/server/atlas/sampling/sample-query-artifact-adapters-v1.js';
import {
  compareSamplingMatricesV1,
  samplingCorpusChecksum,
} from '../../src/lib/server/atlas/sampling/sample-query-corpus-evaluation-v1.js';

const PRODUCER_REVISION = 'atlas.sample-query-corpus-evaluator.2026-08-22.v1';
const DEFAULT_SEEDS = [1, 7, 42, 99, 2026, 65537, 104729];

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

function parsePositiveInt(name: string, fallback: number): number {
  const raw = arg(name, String(fallback))!;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`SAMPLE_QUERY_CORPUS_INTEGER_INVALID:${name}:${raw}`);
  return value;
}

function parseSeeds(): number[] {
  const raw = arg('seeds');
  if (!raw) return [...DEFAULT_SEEDS];
  const seeds = raw.split(',').map((value) => Number(value.trim()));
  if (seeds.length === 0 || seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error(`SAMPLE_QUERY_CORPUS_SEEDS_INVALID:${raw}`);
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('SAMPLE_QUERY_CORPUS_SEEDS_DUPLICATE');
  return seeds;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseSemanticSource(ndjson: string): Array<{
  canonical_id: string;
  canonical_revision: string;
  source_ref: string;
  representation_id: 'semantic_768';
  representation_revision: string;
  workspace_revision: string;
  embedding: number[];
}> {
  const rows = ndjson.split(/\r?\n/).filter(Boolean).map((line, index) => {
    const row = JSON.parse(line) as Record<string, unknown>;
    if (typeof row.canonical_id !== 'string' || !row.canonical_id) throw new Error(`SAMPLING_SEMANTIC_CANONICAL_ID_REQUIRED:${index}`);
    if (typeof row.canonical_revision !== 'string' || !row.canonical_revision) throw new Error(`SAMPLING_SEMANTIC_CANONICAL_REVISION_REQUIRED:${index}`);
    if (typeof row.source_ref !== 'string' || !row.source_ref) throw new Error(`SAMPLING_SEMANTIC_SOURCE_REF_REQUIRED:${index}`);
    if (row.representation_id !== 'semantic_768') throw new Error(`SAMPLING_SEMANTIC_REPRESENTATION_ID_INVALID:${index}`);
    if (typeof row.representation_revision !== 'string' || !row.representation_revision) throw new Error(`SAMPLING_SEMANTIC_REPRESENTATION_REVISION_REQUIRED:${index}`);
    if (typeof row.workspace_revision !== 'string' || !row.workspace_revision) throw new Error(`SAMPLING_SEMANTIC_WORKSPACE_REVISION_REQUIRED:${index}`);
    if (!Array.isArray(row.embedding) || row.embedding.length !== 768 || row.embedding.some((value) => !Number.isFinite(Number(value)))) {
      throw new Error(`SAMPLING_SEMANTIC_EMBEDDING_INVALID:${index}`);
    }
    return {
      canonical_id: row.canonical_id,
      canonical_revision: row.canonical_revision,
      source_ref: row.source_ref,
      representation_id: 'semantic_768' as const,
      representation_revision: row.representation_revision,
      workspace_revision: row.workspace_revision,
      embedding: row.embedding.map(Number),
    };
  });
  if (rows.length === 0) throw new Error('SAMPLING_SEMANTIC_SOURCE_EMPTY');
  return rows;
}

async function main(): Promise<void> {
  const ordinalMapPath = path.resolve(requireArg('ordinal-map'));
  const semanticSourcePath = path.resolve(requireArg('semantic-source'));
  const semanticReceiptPath = path.resolve(requireArg('semantic-receipt'));
  const featureColumnarPath = path.resolve(requireArg('feature-columnar'));
  const exactCandidateSetPath = path.resolve(requireArg('exact-candidate-set'));
  const outputPath = path.resolve(requireArg('output'));
  const sampleSize = parsePositiveInt('sample-size', 64);
  const targetK = parsePositiveInt('target-k', 10);
  const seeds = parseSeeds();

  const ordinalMap = candidateOrdinalMapV1Schema.parse(await readJson(ordinalMapPath));
  const columnar = candidateFeatureColumnarV1Schema.parse(await readJson(featureColumnarPath));
  const exactCandidateSet = CandidateOrdinalSetV1Schema.parse(await readJson(exactCandidateSetPath));
  const semanticReceipt = await readJson(semanticReceiptPath) as Record<string, unknown>;
  const semanticSourceText = await fs.readFile(semanticSourcePath, 'utf8');
  const semanticSourceChecksum = sha256(semanticSourceText);

  if (semanticReceipt.schema !== 'atlas.frozen-semantic-v2-source-export.v1') {
    throw new Error(`SAMPLING_SEMANTIC_RECEIPT_SCHEMA_MISMATCH:${String(semanticReceipt.schema)}`);
  }
  if (semanticReceipt.status !== 'REVISION_QUALIFIED_SOURCE_EXPORTED') {
    throw new Error(`SAMPLING_SEMANTIC_RECEIPT_NOT_PROVEN:${String(semanticReceipt.status)}`);
  }
  if (semanticReceipt.ndjsonSha256 !== semanticSourceChecksum) {
    throw new Error(`SAMPLING_SEMANTIC_SOURCE_CHECKSUM_MISMATCH:${String(semanticReceipt.ndjsonSha256)}:${semanticSourceChecksum}`);
  }
  if (semanticReceipt.workspaceRevision !== ordinalMap.workspaceRevision) {
    throw new Error('SAMPLING_SEMANTIC_WORKSPACE_REVISION_MISMATCH');
  }
  if (semanticReceipt.representationId !== 'semantic_768') {
    throw new Error('SAMPLING_SEMANTIC_RECEIPT_REPRESENTATION_MISMATCH');
  }

  const semanticSource = parseSemanticSource(semanticSourceText);
  if (semanticSource.length !== ordinalMap.rowCount) {
    throw new Error(`SAMPLING_SEMANTIC_ROW_COUNT_MISMATCH:${semanticSource.length}:${ordinalMap.rowCount}`);
  }

  const candidateByPacket = new Map(ordinalMap.candidates.map((candidate) => [candidate.packetKey, candidate] as const));
  const sourcePacketKeys = new Set<string>();
  for (const row of semanticSource) {
    if (sourcePacketKeys.has(row.canonical_id)) throw new Error(`SAMPLING_SEMANTIC_DUPLICATE_PACKET_KEY:${row.canonical_id}`);
    sourcePacketKeys.add(row.canonical_id);
    const candidate = candidateByPacket.get(row.canonical_id);
    if (!candidate) throw new Error(`SAMPLING_SEMANTIC_PACKET_NOT_IN_ORDINAL_MAP:${row.canonical_id}`);
    if (candidate.sourceRevision !== row.canonical_revision) {
      throw new Error(`SAMPLING_SEMANTIC_SOURCE_REVISION_MISMATCH:${row.canonical_id}`);
    }
    if (candidate.workspaceRevision !== row.workspace_revision) {
      throw new Error(`SAMPLING_SEMANTIC_ROW_WORKSPACE_MISMATCH:${row.canonical_id}`);
    }
    if (candidate.semanticRevision !== row.representation_revision) {
      throw new Error(`SAMPLING_SEMANTIC_REPRESENTATION_REVISION_MISMATCH:${row.canonical_id}`);
    }
  }

  if (sampleSize > ordinalMap.rowCount) {
    throw new Error(`SAMPLE_QUERY_CORPUS_SAMPLE_SIZE_EXCEEDS_CANDIDATES:${sampleSize}:${ordinalMap.rowCount}`);
  }

  const semanticMatrix = adaptSemanticRowsToRowL2SampleQueryMatrixV1({
    ordinalMap,
    semanticRows: semanticSource.map((row) => ({ packetKey: row.canonical_id, values: row.embedding })),
    expectedDimension: 768,
    sourceMatrixRevision: String(semanticReceipt.representationRevision),
    sourceArtifactChecksum: semanticSourceChecksum,
    producerRevision: PRODUCER_REVISION,
  });

  const featureMatrix = adaptCandidateFeatureColumnarToSampleQueryMatrixV1({
    ordinalMap,
    columnar,
    mode: 'COLUMN_STANDARDIZED_WITH_PRESENCE',
    producerRevision: PRODUCER_REVISION,
  });

  const targetSet = adaptExactCandidateOrdinalSetToSamplingTargetSetV1({
    candidateSet: exactCandidateSet,
    topK: targetK,
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

  const receiptPayload = {
    schema: 'atlas.sample-query-real-corpus-proof.v1',
    status: 'SAMPLE_QUERY_REAL_CORPUS_MEASURED_NOT_PROMOTED',
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    rowCount: ordinalMap.rowCount,
    semanticRepresentation: 'semantic_768',
    semanticRepresentationRevision: semanticReceipt.representationRevision,
    semanticSourceChecksum,
    semanticRowBinding: 'PACKET_KEY_TO_CANDIDATE_ORDINAL',
    sourceRowNumberUsedAsIdentity: false,
    featureProjection: 'COLUMN_STANDARDIZED_WITH_PRESENCE',
    exactTargetRequired: true,
    targetK,
    sampleSize,
    seeds,
    comparison,
    interpretation: {
      semanticLengthSquaredDegeneratesTowardUniform: comparison.left.lengthSquaredDegeneratesTowardUniform,
      featureLengthSquaredBeatsUniform: comparison.right.lengthSquaredDeltaVsUniformMean > 0,
      lowRankPromotionAuthorized: false,
      rtxAccelerationAuthorized: false,
    },
    measurementOnly: true,
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    postgresAccessed: false,
    qdrantAccessed: false,
    neo4jAccessed: false,
    valkeyAccessed: false,
    promotionAuthorized: false,
    producerRevision: PRODUCER_REVISION,
  } as const;

  const receipt = { ...receiptPayload, receiptChecksum: samplingCorpusChecksum(receiptPayload) };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
