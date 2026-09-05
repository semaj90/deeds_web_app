#!/usr/bin/env node
/** Read-only replay of the fresh-origin bounded cohort against graphify_files. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = path.join(root, 'docs/reports/fresh-origin-bounded-cohort-plan-v1.json');
const outPath = path.join(root, 'docs/reports/fresh-origin-bounded-cohort-lineage-v1.json');
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
if (!plan.authorizationRequired || plan.writes?.postgres !== false) throw new Error('COHORT_PLAN_NOT_READ_ONLY');
const rows = Array.isArray(plan.rows) ? plan.rows : [];
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
let actual = [];
let databaseError = null;
try { actual = (await pool.query('select source_ref, workspace_revision, code_source_revision, source_revision, content_hash, byte_length from public.graphify_files where source_ref = any($1::text[]) order by source_ref', [rows.map((row) => row.sourceRef)])).rows; }
catch (error) { databaseError = error instanceof Error ? error.message : String(error); }
finally { await pool.end(); }
const byRef = new Map(actual.map((row) => [String(row.source_ref).replaceAll('\\', '/'), row]));
const checks = rows.map((expected) => { const observed = byRef.get(expected.sourceRef) ?? null; return { sourceRef: expected.sourceRef, present: Boolean(observed), workspaceRevisionMatch: observed?.workspace_revision === expected.workspaceRevision, sourceRevisionMatch: (observed?.code_source_revision ?? observed?.source_revision) === expected.sourceRevision, contentHashMatch: observed?.content_hash === expected.contentHash, byteLengthMatch: Number(observed?.byte_length) === Number(expected.byteLength) }; });
const report = { schema: 'atlas.fresh-origin-bounded-cohort-lineage.v1', plan: 'docs/reports/fresh-origin-bounded-cohort-plan-v1.json', originWorkspaceRevision: plan.originWorkspaceRevision ?? null, status: databaseError ? 'DATABASE_READ_ERROR' : checks.length === 0 ? 'EMPTY_PROPOSAL' : checks.every((row) => row.present && row.workspaceRevisionMatch && row.sourceRevisionMatch && row.contentHashMatch && row.byteLengthMatch) ? 'FRESH_ORIGIN_COHORT_READBACK_PROVEN' : 'FRESH_ORIGIN_COHORT_READBACK_BLOCKED', counts: { proposed: checks.length, present: checks.filter((row) => row.present).length, workspaceRevisionMatches: checks.filter((row) => row.workspaceRevisionMatch).length, sourceRevisionMatches: checks.filter((row) => row.sourceRevisionMatch).length, contentHashMatches: checks.filter((row) => row.contentHashMatch).length, byteLengthMatches: checks.filter((row) => row.byteLengthMatch).length }, checks, databaseError, authorization: false, writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, cache: false, modelCalls: false }, nextGate: 'PACKET_CHUNK_EXACT_JOIN_READBACK' };
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, outPath).replaceAll('\\', '/'), status: report.status, counts: report.counts, authorization: false }, null, 2));
