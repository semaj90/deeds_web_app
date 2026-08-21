#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  classifyRevisionOwnerProofV1,
  type RevisionSurfaceObservationV1,
} from '$lib/server/atlas/indexing/revision-owner-proof-v1.js';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = process.env.ATLAS_REVISION_OWNER_PROOF_OUT
  ? path.resolve(REPO_ROOT, process.env.ATLAS_REVISION_OWNER_PROOF_OUT)
  : path.resolve(REPO_ROOT, 'docs/reports/revision-owner-proof.json');
const DATABASE_URL = process.env.DATABASE_URL;
const PRODUCER_REVISION = 'atlas.revision-owner-proof.v1';

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

async function fileText(relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.resolve(REPO_ROOT, relativePath), 'utf8');
  } catch {
    return null;
  }
}

async function columnStats(table: string, column: string, meaningfulSql: string) {
  const exists = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
  `, [table, column]);
  if (exists.rowCount !== 1) {
    return { exists: false, totalRows: null, populatedRows: null, meaningfulRows: null, meaningfulCoveragePct: null };
  }
  const qTable = `"${table.replaceAll('"', '""')}"`;
  const qColumn = `"${column.replaceAll('"', '""')}"`;
  const result = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ${qColumn} IS NOT NULL)::bigint AS populated,
      COUNT(*) FILTER (WHERE ${meaningfulSql})::bigint AS meaningful
    FROM ${qTable}
  `);
  const totalRows = Number(result.rows[0]?.total ?? 0);
  const populatedRows = Number(result.rows[0]?.populated ?? 0);
  const meaningfulRows = Number(result.rows[0]?.meaningful ?? 0);
  return {
    exists: true,
    totalRows,
    populatedRows,
    meaningfulRows,
    meaningfulCoveragePct: totalRows > 0 ? Number(((meaningfulRows / totalRows) * 100).toFixed(2)) : 0,
  };
}

const semanticWriterPath = 'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts';
const symbolWriterPath = 'packages/parent-atlas/src/core/symbol-registry-repository.ts';
const nativeStructuralPath = 'sveltekit-frontend/scripts/atlas/native-structural-materializer.mts';
const indexEnginePath = 'scripts/atlas/index-engine.ts';

const [semanticWriter, symbolWriter, nativeStructuralWriter, indexEngine] = await Promise.all([
  fileText(semanticWriterPath),
  fileText(symbolWriterPath),
  fileText(nativeStructuralPath),
  fileText(indexEnginePath),
]);

await pool.query('BEGIN READ ONLY');
try {
  const observations: RevisionSurfaceObservationV1[] = [];

  {
    const stats = await columnStats('atlas_packets', 'workspace_revision', '"workspace_revision" IS NOT NULL AND "workspace_revision" <> 0');
    observations.push({
      surfaceId: 'workspace:atlas_packets.workspace_revision',
      table: 'atlas_packets',
      column: 'workspace_revision',
      role: 'DEFAULTED_SINK',
      ...stats,
      writerPath: semanticWriterPath,
      writerPresent: semanticWriter !== null,
      writerCreatesRevision: false,
      writerPassesRevisionThrough: false,
      writerEvidence: [
        'schema default is 0',
        'semantic-packet-writer persists representation lineage but does not assign workspaceRevision',
      ],
      notes: ['Non-zero coverage is observational only; defaulted storage is not an authority contract.'],
    });
  }

  {
    const stats = await columnStats('atlas_ast_nodes', 'source_revision', '"source_revision" IS NOT NULL AND btrim("source_revision"::text) <> \'\'');
    observations.push({
      surfaceId: 'source:atlas_ast_nodes.source_revision',
      table: 'atlas_ast_nodes',
      column: 'source_revision',
      role: (stats.meaningfulRows ?? 0) > 0 ? 'PASS_THROUGH_SINK' : 'UNPOPULATED_SINK',
      ...stats,
      writerPath: null,
      writerPresent: false,
      writerCreatesRevision: false,
      writerPassesRevisionThrough: false,
      writerEvidence: ['schema declares source_revision nullable and explicitly notes existing rows require re-analysis'],
      notes: ['No production origin writer was found by repository census.'],
    });
  }

  for (const column of ['source_revision', 'workspace_revision'] as const) {
    const meaningful = `"${column}" IS NOT NULL AND btrim("${column}"::text) <> ''`;
    const stats = await columnStats('atlas_symbol_versions', column, meaningful);
    observations.push({
      surfaceId: `${column === 'workspace_revision' ? 'workspace' : 'source'}:atlas_symbol_versions.${column}`,
      table: 'atlas_symbol_versions',
      column,
      role: stats.exists ? 'PASS_THROUGH_SINK' : 'NOT_PRESENT',
      ...stats,
      writerPath: symbolWriterPath,
      writerPresent: symbolWriter !== null,
      writerCreatesRevision: false,
      writerPassesRevisionThrough: Boolean(symbolWriter?.includes(`nomination.${column}`)),
      writerEvidence: [`symbol-registry-repository inserts nomination.${column}; it does not create the revision`],
      notes: ['Populated symbol-version rows therefore prove propagation, not origin authority.'],
    });
  }

  for (const column of ['commit_sha', 'corpus_version'] as const) {
    const stats = await columnStats('atlas_source_refs', column, `"${column}" IS NOT NULL AND btrim("${column}"::text) <> ''`);
    observations.push({
      surfaceId: `source:atlas_source_refs.${column}`,
      table: 'atlas_source_refs',
      column,
      role: 'ORIGIN_CANDIDATE',
      ...stats,
      writerPath: null,
      writerPresent: false,
      writerCreatesRevision: false,
      writerPassesRevisionThrough: false,
      writerEvidence: [`atlas_source_refs declares ${column}, but repository search did not identify a production writer that creates it`],
      notes: ['Candidate cannot pass until both a production origin writer and populated values are proven.'],
    });
  }

  {
    const stats = await columnStats('semantic_signals', 'workspace_revision', '"workspace_revision" IS NOT NULL AND btrim("workspace_revision"::text) <> \'\'');
    observations.push({
      surfaceId: 'workspace:semantic_signals.workspace_revision',
      table: 'semantic_signals',
      column: 'workspace_revision',
      role: stats.exists ? 'PASS_THROUGH_SINK' : 'NOT_PRESENT',
      ...stats,
      writerPath: 'sveltekit-frontend/drizzle/0115_phase109a_workspace_revision_and_purge_audit.sql',
      writerPresent: true,
      writerCreatesRevision: false,
      writerPassesRevisionThrough: true,
      writerEvidence: ['migration backfills workspace_revision from revision_id for semantic signal lifecycle only'],
      notes: ['This is semantic-signal lifecycle authority, not proven Graphify/code-source revision authority.'],
    });
  }

  observations.push({
    surfaceId: 'workspace:native-structural.git-head',
    table: null,
    column: null,
    role: 'ORIGIN_CANDIDATE',
    exists: nativeStructuralWriter !== null,
    totalRows: null,
    populatedRows: null,
    meaningfulRows: null,
    meaningfulCoveragePct: null,
    writerPath: nativeStructuralPath,
    writerPresent: nativeStructuralWriter !== null,
    writerCreatesRevision: Boolean(nativeStructuralWriter?.includes("git', ['rev-parse', 'HEAD']")),
    writerPassesRevisionThrough: false,
    writerEvidence: ['native structural dry-run can observe git HEAD or ATLAS_WORKSPACE_REVISION'],
    notes: ['Not proven because this value is not yet an accepted canonical workspace-revision store and native structural canonical writes remain blocked.'],
  });

  observations.push({
    surfaceId: 'source:graphify-index-engine.candidate-source-revision',
    table: null,
    column: null,
    role: 'PASS_THROUGH_SINK',
    exists: indexEngine !== null,
    totalRows: null,
    populatedRows: null,
    meaningfulRows: null,
    meaningfulCoveragePct: null,
    writerPath: indexEnginePath,
    writerPresent: indexEngine !== null,
    writerCreatesRevision: false,
    writerPassesRevisionThrough: Boolean(indexEngine?.includes('candidate.sourceRevision')),
    writerEvidence: ['index-engine accepts FileCandidate.sourceRevision from its caller and persists it'],
    notes: ['No caller was found in the repository census; caller-supplied values are not origin proof.'],
  });

  const proof = classifyRevisionOwnerProofV1({ observations, producerRevision: PRODUCER_REVISION });
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: proof.status, workspaceRevisionOwner: proof.workspaceRevisionOwner, sourceRevisionOwner: proof.sourceRevisionOwner, blockers: proof.blockers, output: OUT }, null, 2));
  if (proof.status !== 'REVISION_OWNER_PROVEN') process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
