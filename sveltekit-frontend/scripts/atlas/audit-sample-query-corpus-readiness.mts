#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : null;
}

async function fileState(label: string, rawPath: string | null) {
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
  const states = await Promise.all([
    fileState('CandidateOrdinalMapV1 JSON', arg('ordinal-map')),
    fileState('revision-qualified semantic_768 NDJSON', arg('semantic-source')),
    fileState('semantic source export receipt', arg('semantic-receipt')),
    fileState('CandidateFeatureColumnarV1 JSON', arg('feature-columnar')),
    fileState('exact CandidateOrdinalSetV1 JSON', arg('exact-candidate-set')),
  ]);

  const missing = states.filter((state) => !state.exists).map((state) => state.label);
  const receipt = {
    schema: 'atlas.sample-query-corpus-readiness.v2',
    status: missing.length === 0
      ? 'SAMPLE_QUERY_CORPUS_INPUTS_PRESENT_UNVALIDATED'
      : 'SAMPLE_QUERY_CORPUS_INPUTS_INCOMPLETE',
    files: states,
    missing,
    knownRepoProducers: {
      semanticSource: 'sveltekit-frontend/scripts/atlas/export-frozen-semantic-v2-source.mts',
      semanticSourceReceipt: 'sveltekit-frontend/scripts/atlas/export-frozen-semantic-v2-source.mts',
      candidateOrdinalMap: 'materializeCandidateOrdinalMap() exists; durable real-corpus JSON exporter not yet identified',
      candidateFeatureColumnar: 'materializeCandidateFeatureColumnar() + Arrow writer exist; corpus-wide producer not yet proven',
      exactCandidateOrdinalSet: 'buildCandidateOrdinalSetV1() exists; exact real-corpus receipt/export must be supplied',
    },
    requiredBindings: [
      'semantic canonical_id/packet_key must join exactly to CandidateOrdinalMapV1.packetKey',
      'semantic canonical_revision must equal CandidateOrdinalMapV1.sourceRevision',
      'semantic representation_revision must equal CandidateOrdinalMapV1.semanticRevision',
      'feature columnar candidateSnapshotRevision and ordinalMapChecksum must match the ordinal map',
      'EXACT_TOP_K target requires CandidateOrdinalSetV1.approximate=false and matching ordinalMapChecksum',
      'no artifact row number or executor-local ordinal may be treated as CandidateOrdinal without this binding',
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
