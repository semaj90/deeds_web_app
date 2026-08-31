#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  candidateOrdinalMapV1Schema,
} from '$lib/server/atlas/features/canonical-candidate-v1.js';
import {
  CANDIDATE_FEATURE_ROW_SCHEMA,
} from '$lib/server/atlas/features/candidate-feature-row-v1.js';
import {
  materializeCandidateFeatureSnapshot,
} from '$lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import {
  materializeCandidateFeatureColumnar,
} from '$lib/server/atlas/features/candidate-feature-columnar-v1.js';

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
  const snapshotOutput = arg('snapshot-output');
  const queryOrdinal = Number(arg('query-ordinal', '0'));
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

  const byPacketKey = new Map(semanticRows.map((row) => [row.canonical_id, row]));
  const queryCandidate = ordinalMap.candidates[queryOrdinal]!;
  if (!queryCandidate.packetKey) throw new Error('QUERY_CANDIDATE_PACKET_KEY_REQUIRED');
  const queryRow = byPacketKey.get(queryCandidate.packetKey);
  if (!queryRow) throw new Error(`QUERY_SEMANTIC_ROW_NOT_FOUND:${queryCandidate.packetKey}`);

  const featureRevision = `sample-query-semantic-control:${ordinalMap.candidateSnapshotRevision}:v1`;

  const rows = ordinalMap.candidates.map((candidate) => {
    if (!candidate.packetKey) throw new Error(`CANDIDATE_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    const semantic = byPacketKey.get(candidate.packetKey);
    if (!semantic) throw new Error(`SEMANTIC_PACKET_KEY_NOT_FOUND:${candidate.packetKey}`);
    if (semantic.canonical_revision !== candidate.sourceRevision) {
      throw new Error(`SEMANTIC_SOURCE_REVISION_MISMATCH:${candidate.packetKey}`);
    }
    if (semantic.representation_revision !== candidate.semanticRevision) {
      throw new Error(`SEMANTIC_REPRESENTATION_REVISION_MISMATCH:${candidate.packetKey}`);
    }

    return {
      schema: CANDIDATE_FEATURE_ROW_SCHEMA,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision,
      featureRevision,

      semanticRelevance: cosine(queryRow.embedding, semantic.embedding),
      lexicalRelevance: null,
      astAffinity: null,
      graphAuthority: null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,

      laneMask: ['semantic'],
      degradedIdentity: candidate.degradedIdentity,
      evidenceRefs: [
        `semantic-control-query-ordinal:${queryOrdinal}`,
        `semantic-source:${semantic.source_ref}`,
      ],
    };
  });

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows,
    featureRevision,
    producerRevision: 'sample-query-feature-snapshot-producer-v1',
  });
  const columnar = materializeCandidateFeatureColumnar({
    snapshot,
    producerRevision: 'sample-query-feature-columnar-producer-v1',
  });

  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(columnar, null, 2)}\n`, 'utf8');
  if (snapshotOutput) {
    await fs.mkdir(path.dirname(path.resolve(snapshotOutput)), { recursive: true });
    await fs.writeFile(path.resolve(snapshotOutput), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    status: 'CANDIDATE_FEATURE_COLUMNAR_V1_WRITTEN',
    rowCount: columnar.rowCount,
    featureCount: columnar.featureCount,
    queryOrdinal,
    semanticOnlyControl: true,
    columnarChecksum: columnar.columnarChecksum,
    output: path.resolve(output),
    snapshotOutput: snapshotOutput ? path.resolve(snapshotOutput) : null,
    storeWritesAttempted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
