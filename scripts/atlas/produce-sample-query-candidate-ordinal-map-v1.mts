#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  materializeCandidateOrdinalMap,
} from '$lib/server/atlas/features/canonical-candidate-v1.js';

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

async function readNdjson(filePath: string): Promise<SemanticSourceRow[]> {
  const text = await fs.readFile(filePath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as SemanticSourceRow);
}

async function main() {
  const source = arg('semantic-source');
  const output = arg('output');
  const limit = Math.max(2, Math.min(100000, Number(arg('limit', '512'))));
  if (!source || !output) throw new Error('REQUIRED: --semantic-source --output');

  const rows = (await readNdjson(path.resolve(source))).slice(0, limit);
  if (rows.length < 2) throw new Error(`SEMANTIC_ROWS_INSUFFICIENT:${rows.length}`);

  const workspaceRevisions = new Set(rows.map((r) => r.workspace_revision));
  const representationRevisions = new Set(rows.map((r) => r.representation_revision));
  if (workspaceRevisions.size !== 1) throw new Error('SEMANTIC_SOURCE_MIXED_WORKSPACE_REVISIONS');
  if (representationRevisions.size !== 1) throw new Error('SEMANTIC_SOURCE_MIXED_REPRESENTATION_REVISIONS');

  for (const row of rows) {
    if (row.representation_id !== 'semantic_768') throw new Error(`SEMANTIC_REPRESENTATION_ID_INVALID:${row.canonical_id}`);
    if (!Array.isArray(row.embedding) || row.embedding.length !== 768 || row.embedding.some((v) => !Number.isFinite(v))) {
      throw new Error(`SEMANTIC_VECTOR_INVALID:${row.canonical_id}`);
    }
  }

  const workspaceRevision = rows[0]!.workspace_revision;
  const representationRevision = rows[0]!.representation_revision;

  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `sample-query:${workspaceRevision}:${representationRevision}:v1`,
    workspaceRevision,
    producerRevision: 'sample-query-candidate-ordinal-map-producer-v1',
    candidates: rows.map((row) => ({
      canonicalId: row.canonical_id,
      packetKey: row.canonical_id,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: row.workspace_revision,
      sourceRevision: row.canonical_revision,
      graphRevision: null,
      semanticRevision: row.representation_revision,
      degradedIdentity: false,
      evidenceRefs: [`semantic-source:${row.source_ref}`],
    })),
  });

  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(ordinalMap, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'CANDIDATE_ORDINAL_MAP_V1_WRITTEN',
    rowCount: ordinalMap.rowCount,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    output: path.resolve(output),
    storeWritesAttempted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
