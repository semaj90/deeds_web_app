#!/usr/bin/env node
/**
 * DOC-13 broad ambiguity replay. Reads the complete revision-qualified active
 * symbol cohort in a READ ONLY transaction and exercises the existing exact
 * resolver for every duplicate name/code-revision group. No extraction call,
 * canonical write, or symbol materialization occurs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { matchApiRuleToSymbols } from './lib/doc-symbol-mutual-index-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-13-broad-ambiguity-live-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
let report;

try {
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT r.stable_symbol_id, r.canonical_key, r.canonical_name, r.canonical_qualified_name,
           v.symbol_version_id, v.source_ref, v.source_revision, v.workspace_revision
      FROM public.atlas_symbol_registry r
      JOIN public.atlas_symbol_versions v ON v.stable_symbol_id = r.stable_symbol_id
     WHERE r.status = 'active'
       AND v.source_revision ~ '^sha256:[0-9a-f]{64}$'
       AND v.workspace_revision ~ '^sha256:[0-9a-f]{64}$'
     ORDER BY r.canonical_key, v.source_ref, v.symbol_version_id
  `);
  const groups = new Map();
  for (const row of result.rows) {
    for (const name of new Set([row.canonical_qualified_name, row.canonical_name, row.canonical_key].filter(Boolean))) {
      const key = JSON.stringify([name, row.source_revision]);
      const group = groups.get(key) ?? { name, sourceRevision: row.source_revision, rows: [] };
      if (!group.rows.some((item) => item.symbol_version_id === row.symbol_version_id)) group.rows.push(row);
      groups.set(key, group);
    }
  }

  const ambiguousGroups = [...groups.values()].filter((group) => group.rows.length > 1);
  const syntheticDocumentationRevision = `sha256:${'e'.repeat(64)}`;
  const replays = ambiguousGroups.map((group) => {
    const outcome = matchApiRuleToSymbols({
      apiSymbol: group.name,
      evidenceSpan: { sourceRevision: syntheticDocumentationRevision },
      targetSourceRevision: group.sourceRevision,
    }, result.rows);
    return {
      sourceRevision: group.sourceRevision,
      symbolVersionCandidates: group.rows.length,
      resolverStatus: outcome.status,
      resolverCandidateCount: outcome.candidateCount ?? outcome.matches?.length ?? 0,
      passed: outcome.status === 'AMBIGUOUS',
    };
  });

  report = {
    schema: 'parent-atlas.doc-13-broad-ambiguity-live.v1',
    gate: 'DOC-13',
    status: replays.length > 0 && replays.every((item) => item.passed)
      ? 'DOC_13_BROAD_AMBIGUITY_REPLAY_PROVEN'
      : 'DOC_13_BROAD_AMBIGUITY_REPLAY_FAILED',
    readOnly: true,
    transactionMode: 'READ ONLY',
    sourceOwners: ['atlas_symbol_registry', 'atlas_symbol_versions'],
    activeRevisionQualifiedRowsRead: result.rowCount,
    nameRevisionGroups: groups.size,
    ambiguousNameRevisionGroups: ambiguousGroups.length,
    resolverReplays: replays,
    syntheticDocumentationRevisionUsedOnlyForSchemaValidation: syntheticDocumentationRevision,
    documentationRevisionComparedToCodeRevision: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, rows: report.activeRevisionQualifiedRowsRead, ambiguousGroups: report.ambiguousNameRevisionGroups, replayFailures: report.resolverReplays.filter((item) => !item.passed).length, writesPerformed: false }));
if (report.status !== 'DOC_13_BROAD_AMBIGUITY_REPLAY_PROVEN') process.exitCode = 1;
