#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  compileSearchRuntimeShadowV1,
  SearchRuntimeShadowCaptureV1Schema,
} from '../../src/lib/server/atlas/okf/search-runtime-shadow-v1.js';

const args = process.argv.slice(2);

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const INPUT = path.resolve(arg('input', 'docs/reports/search-runtime-shadow-captures.jsonl')!);
const OUTPUT_DIR = path.resolve(arg('output-dir', 'docs/reports/search-runtime-shadow-corpus')!);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function f32leBase64(values: Float32Array): string {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) buffer.writeFloatLE(values[index], index * 4);
  return buffer.toString('base64');
}

function parseInput(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const value = JSON.parse(trimmed);
    if (!Array.isArray(value)) throw new Error('SHADOW_CORPUS_INPUT_ARRAY_REQUIRED');
    return value;
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`SHADOW_CORPUS_INVALID_JSONL_LINE:${index + 1}:${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function main(): Promise<void> {
  const raw = await readFile(INPUT, 'utf8');
  const captures = parseInput(raw).map((value) => SearchRuntimeShadowCaptureV1Schema.parse(value));
  const queryIds = new Set<string>();
  const compilations = captures.map((capture) => {
    if (queryIds.has(capture.queryId)) throw new Error(`SHADOW_CORPUS_DUPLICATE_QUERY_ID:${capture.queryId}`);
    queryIds.add(capture.queryId);
    return compileSearchRuntimeShadowV1(capture);
  });

  const pairRows = compilations
    .flatMap((compilation) => compilation.pairJudgmentSeeds)
    .sort((a, b) => a.queryId.localeCompare(b.queryId) || a.retrieval.initialRank - b.retrieval.initialRank || a.candidatePacketKey.localeCompare(b.candidatePacketKey));
  const pairJsonl = pairRows.map((row) => canonicalJson(row)).join('\n') + (pairRows.length ? '\n' : '');

  const matrixManifest = compilations
    .map((compilation) => ({
      queryId: compilation.queryId,
      queryRevision: compilation.queryRevision,
      captureSha256: compilation.captureSha256,
      matrixRevision: compilation.matrix.matrixRevision,
      matrixSha256: compilation.matrix.matrixSha256,
      rowCount: compilation.matrix.rowCount,
      columnCount: compilation.matrix.columnCount,
      columnNames: compilation.matrix.columnNames,
      rowCanonicalIds: compilation.matrix.rowCanonicalIds,
      rowPacketKeys: compilation.matrix.rowPacketKeys,
      rowOrdinals: compilation.matrix.rowOrdinals,
      valuesF32LeBase64: f32leBase64(compilation.matrix.values),
      presenceMaskBase64: Buffer.from(
        compilation.matrix.presenceMask.buffer,
        compilation.matrix.presenceMask.byteOffset,
        compilation.matrix.presenceMask.byteLength,
      ).toString('base64'),
      cellEvidenceRefs: compilation.matrix.cellEvidenceRefs,
      rejectedCandidates: compilation.rejectedCandidates,
    }))
    .sort((a, b) => a.queryId.localeCompare(b.queryId));
  const matrixJsonl = matrixManifest.map((row) => canonicalJson(row)).join('\n') + (matrixManifest.length ? '\n' : '');

  const pairPath = path.join(OUTPUT_DIR, 'pair-judgment-seeds.jsonl');
  const matrixPath = path.join(OUTPUT_DIR, 'derived-feature-matrices.jsonl');
  const receiptPath = path.join(OUTPUT_DIR, 'receipt.json');
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(pairPath, pairJsonl, 'utf8');
  await writeFile(matrixPath, matrixJsonl, 'utf8');

  const receipt = {
    schema: 'atlas.search-runtime-shadow-corpus-receipt.v1',
    inputPath: INPUT,
    captureCount: captures.length,
    matrixCount: matrixManifest.length,
    acceptedCandidateCount: compilations.reduce((sum, value) => sum + value.acceptedRows.length, 0),
    rejectedCandidateCount: compilations.reduce((sum, value) => sum + value.rejectedCandidates.length, 0),
    pairJudgmentSeedCount: pairRows.length,
    trainingEligibleCount: pairRows.filter((row) => row.trainingEligible).length,
    expectedTrainingEligibleCount: 0,
    pairJudgmentSeedSha256: sha256(pairJsonl),
    matrixManifestSha256: sha256(matrixJsonl),
    pairJudgmentSeedPath: pairPath,
    matrixManifestPath: matrixPath,
    invariants: {
      allSeedsBlockedBeforeEnrichment: pairRows.every((row) => row.trainingEligible === false),
      noRankingMutation: compilations.every((value) => value.rankingMutationAllowed === false),
      noTrainingPromotion: compilations.every((value) => value.trainingPromotionAllowed === false),
      canonicalWritesAllowed: false,
      postgresWritesAttempted: false,
      qdrantWritesAttempted: false,
      valkeyWritesAttempted: false,
    },
    producerRevision: 'build-search-runtime-shadow-corpus.v1',
  };

  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.invariants.allSeedsBlockedBeforeEnrichment) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
