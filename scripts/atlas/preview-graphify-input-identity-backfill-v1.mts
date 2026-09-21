#!/usr/bin/env node
/**
 * GRAPHIFY-INPUT-IDENTITY-BACKFILL-01 PREVIEW (read-only). Computes atlas.graphify-input-identity.v1 for every
 * graphify_executions row and reports the grouping. It NEVER writes to any datastore; its only write is its own report file.
 *
 * Frozen recipe (operator-approved 2026-09-21): a fixed six-field payload in a CONTRACTUAL property order,
 *   { schema, workspaceId, workspaceRevision, parserContractVersion, extractionContractVersion, graphAlgorithmRevision }
 * serialized with JSON.stringify in exactly that order, UTF-8, SHA-256, lowercase hex, prefixed "sha256:".
 * Excluded on purpose: executionId, timestamps, scheduler/environment revision, authority state, status.
 * The identity means "the requested logical Graphify computation"; it is NOT proof that an old output is reusable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const SCHEMA = 'atlas.graphify-input-identity.v1';
const reportPath = path.join(REPO_ROOT, 'docs/reports/graphify-input-identity-backfill-preview-v1.json');

interface Payload {
  schema: string;
  workspaceId: string;
  workspaceRevision: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  graphAlgorithmRevision: string;
}

/** The one canonical serializer. Callers must not build their own. Property order is part of the contract. */
export function canonicalInputIdentityPayload(p: Omit<Payload, 'schema'>): string {
  return JSON.stringify({
    schema: SCHEMA,
    workspaceId: p.workspaceId,
    workspaceRevision: p.workspaceRevision,
    parserContractVersion: p.parserContractVersion,
    extractionContractVersion: p.extractionContractVersion,
    graphAlgorithmRevision: p.graphAlgorithmRevision,
  });
}
export const inputIdentityV1 = (p: Omit<Payload, 'schema'>) =>
  `sha256:${crypto.createHash('sha256').update(canonicalInputIdentityPayload(p), 'utf8').digest('hex')}`;

/** Independent second implementation (manual assembly) used only to prove the serialization does not depend on the code path. */
function independentSerialization(p: Omit<Payload, 'schema'>): string {
  const q = (v: string) => JSON.stringify(v);
  return `{"schema":${q(SCHEMA)},"workspaceId":${q(p.workspaceId)},"workspaceRevision":${q(p.workspaceRevision)},` +
    `"parserContractVersion":${q(p.parserContractVersion)},"extractionContractVersion":${q(p.extractionContractVersion)},` +
    `"graphAlgorithmRevision":${q(p.graphAlgorithmRevision)}}`;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
let rows: any[] = [];
let databaseError: string | null = null;
const groups = new Map<string, any[]>();
const incomplete: string[] = [];
let conflictingSerializations = 0;

try {
  rows = (await pool.query(`
    SELECT execution_id::text AS execution_id, workspace_id::text AS workspace_id, workspace_revision, status,
           canonical_authority, parser_contract_version, extraction_contract_version, graph_algorithm_revision,
           started_at, completed_at
      FROM public.graphify_executions ORDER BY started_at`)).rows;

  for (const r of rows) {
    const complete = r.workspace_id && r.workspace_revision && r.parser_contract_version && r.extraction_contract_version && r.graph_algorithm_revision;
    if (!complete) { incomplete.push(r.execution_id); continue; }
    const input = {
      workspaceId: r.workspace_id, workspaceRevision: r.workspace_revision, parserContractVersion: r.parser_contract_version,
      extractionContractVersion: r.extraction_contract_version, graphAlgorithmRevision: r.graph_algorithm_revision,
    };
    if (canonicalInputIdentityPayload(input) !== independentSerialization(input)) conflictingSerializations += 1;
    const id = inputIdentityV1(input);
    (groups.get(id) ?? groups.set(id, []).get(id)!).push(r);
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
}

async function compareOutputs(a: string, b: string) {
  const res = await pool.query(`
    SELECT (SELECT count(*) FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid)::int AS total_a,
           (SELECT count(*) FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $2::uuid)::int AS total_b,
           (SELECT count(*) FROM public.graphify_execution_file_membership_v2 x
              JOIN public.graphify_execution_file_membership_v2 y ON y.source_ref = x.source_ref AND y.execution_id = $2::uuid
             WHERE x.execution_id = $1::uuid AND x.content_hash = y.content_hash AND x.code_source_revision = y.code_source_revision
               AND x.workspace_revision = y.workspace_revision AND x.byte_length = y.byte_length)::int AS matched`, [a, b]);
  const { total_a, total_b, matched } = res.rows[0];
  if (total_a === 0 && total_b === 0) return 'NO_MEMBERSHIP_ROWS_TO_COMPARE';
  return total_a === total_b && matched === total_a ? 'EQUIVALENT_MEMBERSHIP' : 'MEMBERSHIP_DIFFERS';
}

const groupReports: any[] = [];
if (!databaseError) {
  for (const [identity, members] of groups) {
    const canonical = members.filter((m) => m.canonical_authority === true);
    let outputs: string | null = null;
    if (members.length > 1) {
      const results = new Set<string>();
      for (const m of members.slice(1)) results.add(await compareOutputs(members[0].execution_id, m.execution_id));
      outputs = results.size === 1 ? [...results][0] : 'MIXED:' + [...results].join(',');
    }
    groupReports.push({
      inputIdentity: identity,
      count: members.length,
      workspaceRevision: members[0].workspace_revision,
      contracts: [members[0].parser_contract_version, members[0].extraction_contract_version, members[0].graph_algorithm_revision],
      executions: members.map((m) => ({ executionId: m.execution_id, status: m.status, canonicalAuthority: m.canonical_authority })),
      canonicalCount: canonical.length,
      canonicalExecutionId: canonical.length === 1 ? canonical[0].execution_id : null,
      outputsEquivalent: outputs,
    });
  }
}
await pool.end();
groupReports.sort((a, b) => b.count - a.count);

const report = {
  schema: 'atlas.graphify-input-identity-backfill-preview.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PREVIEW',
  recipeSchema: SCHEMA,
  databaseError,
  executionsExamined: rows.length,
  recipeInputsComplete: rows.length - incomplete.length,
  incompleteExecutionIds: incomplete,
  distinctInputIdentities: groups.size,
  duplicateGroups: groupReports.filter((g) => g.count > 1).length,
  conflictingCanonicalSerializations: conflictingSerializations,
  groups: groupReports,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false, filesystem: true },
  backfillApplied: false,
  status: databaseError ? 'PREVIEW_FAILED' : incomplete.length > 0 || conflictingSerializations > 0 ? 'PREVIEW_BLOCKED' : 'PREVIEW_READY_NO_WRITES',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, groups: report.groups.map((g) => ({ ...g, executions: g.executions.map((e: any) => `${e.executionId.slice(0, 8)} ${e.status} canon=${e.canonicalAuthority}`) })) }, null, 2));
