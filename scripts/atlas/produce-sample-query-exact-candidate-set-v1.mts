#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  candidateOrdinalMapV1Schema,
} from '$lib/server/atlas/features/canonical-candidate-v1.js';
import {
  buildCandidateOrdinalSetV1,
} from '$lib/server/atlas/kernel/candidate-ordinal-set-v1.js';

function arg(name: string, fallback: string | null = null): string | null {
  const inline = process.argv.slice(2).find((v) => v.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

interface SemanticSourceRow {
  canonical_id: string;
  canonical_revision: string;
  source_ref: string;
  representation_id: 'semantic_768';
  representation_revision: string;
  workspace_revision: string;
  embedding: number[];
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!, y = b[i]!;
    dot += x * y; aa += x * x; bb += y * y;
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  return denom > 0 ? dot / denom : 0;
}

async function readNdjson(filePath: string): Promise<SemanticSourceRow[]> {
  const text = await fs.readFile(filePath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as SemanticSourceRow);
}

async function main() {
  const semanticSource = arg('semantic-source');
  const ordinalMapPath = arg('ordinal-map');
  const output = arg('output');
  const queryOrdinal = Number(arg('query-ordinal', '0'));
  const topK = Math.max(1, Number(arg('top-k', '25')));
  if (!semanticSource || !ordinalMapPath || !output) {
    throw new Error('REQUIRED: --semantic-source --ordinal-map --output');
  }

  const semanticRows = await readNdjson(path.resolve(semanticSource));
  const ordinalMap = candidateOrdinalMapV1Schema.parse(
    JSON.parse(await fs.readFile(path.resolve(ordinalMapPath), 'utf8')),
  );

  if (!Number.isInteger(queryOrdinal) || queryOrdinal < 0 || queryOrdinal >= ordinalMap.rowCount) {
    throw new Error(`QUERY_ORDINAL_OUT_OF_RANGE:${queryOrdinal}`);
  }
  if (topK > ordinalMap.rowCount) throw new Error(`TOP_K_OUT_OF_RANGE:${topK}:${ordinalMap.rowCount}`);

  const byPacketKey = new Map(semanticRows.map((row) => [row.canonical_id, row]));
  const queryCandidate = ordinalMap.candidates[queryOrdinal]!;
  if (!queryCandidate.packetKey) throw new Error('QUERY_PACKET_KEY_REQUIRED');
  const query = byPacketKey.get(queryCandidate.packetKey);
  if (!query) throw new Error(`QUERY_SEMANTIC_ROW_NOT_FOUND:${queryCandidate.packetKey}`);

  const scored = ordinalMap.candidates.map((candidate) => {
    if (!candidate.packetKey) throw new Error(`CANDIDATE_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    const row = byPacketKey.get(candidate.packetKey);
    if (!row) throw new Error(`SEMANTIC_PACKET_KEY_NOT_FOUND:${candidate.packetKey}`);
    if (row.canonical_revision !== candidate.sourceRevision) {
      throw new Error(`SEMANTIC_SOURCE_REVISION_MISMATCH:${candidate.packetKey}`);
    }
    if (row.representation_revision !== candidate.semanticRevision) {
      throw new Error(`SEMANTIC_REPRESENTATION_REVISION_MISMATCH:${candidate.packetKey}`);
    }
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      score: cosine(query.embedding, row.embedding),
    };
  }).sort((a, b) => b.score - a.score || a.candidateOrdinal - b.candidateOrdinal);

  const hits = scored.slice(0, topK).map((hit, index) => ({
    candidateOrdinal: hit.candidateOrdinal,
    score: hit.score,
    rank: index + 1,
    executor: 'CUVS_EXACT' as const,
    evidenceRefs: [
      `exact-cosine-cpu-control:query-ordinal:${queryOrdinal}`,
      `semantic-source:${queryCandidate.packetKey}`,
    ],
  }));

  const candidateSet = buildCandidateOrdinalSetV1({
    requestId: `sample-query-exact-control:q${queryOrdinal}:k${topK}`,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationRevision: query.representation_revision,
    hits,
    approximate: false,
  });

  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(candidateSet, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'EXACT_CANDIDATE_ORDINAL_SET_V1_WRITTEN',
    queryOrdinal,
    topK,
    exact: true,
    resultChecksum: candidateSet.resultChecksum,
    output: path.resolve(output),
    storeWritesAttempted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
