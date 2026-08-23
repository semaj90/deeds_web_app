#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function fileState(label: string, rawPath: string | undefined) {
  if (!rawPath) return { label, supplied: false, exists: false, path: null, bytes: null };
  const resolved = path.resolve(rawPath);
  try {
    const stat = await fs.stat(resolved);
    return { label, supplied: true, exists: stat.isFile(), path: resolved, bytes: stat.isFile() ? stat.size : null };
  } catch {
    return { label, supplied: true, exists: false, path: resolved, bytes: null };
  }
}

async function main() {
  const semanticDefault = path.resolve('..', '.tmp', 'atlas-vector-snapshots', 'vector-snapshot-5k-768.parquet');
  const states = await Promise.all([
    fileState('CandidateOrdinalMapV1', arg('ordinal-map')),
    fileState('semantic_768 parquet', arg('semantic-parquet', semanticDefault)),
    fileState('CandidateFeatureColumnarV1 JSON', arg('feature-columnar')),
    fileState('exact CandidateOrdinalSetV1 JSON', arg('exact-candidate-set')),
  ]);

  const missing = states.filter((state) => !state.exists).map((state) => state.label);
  const receipt = {
    schema: 'atlas.sample-query-corpus-readiness.v1',
    status: missing.length === 0 ? 'SAMPLE_QUERY_CORPUS_INPUTS_PRESENT_UNVALIDATED' : 'SAMPLE_QUERY_CORPUS_INPUTS_INCOMPLETE',
    files: states,
    missing,
    knownRepoProducers: {
      semanticParquet: 'scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts',
      candidateOrdinalMapJson: null,
      candidateFeatureColumnarCorpusJson: null,
      exactCandidateOrdinalSetJson: null,
    },
    blockers: [
      'semantic parquet row order is packet_key order and MUST be joined to CandidateOrdinal by packetKey',
      'an ANN-local ordinal receipt without candidateSnapshotRevision + ordinalMapChecksum cannot define target truth',
      'EXACT_TOP_K target requires CandidateOrdinalSetV1.approximate=false',
      'all four inputs must share the same frozen CandidateOrdinal world before measurement',
    ],
    noStoreAccess: true,
    canonicalWritesAttempted: false,
  };

  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = missing.length === 0 ? 0 : 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
