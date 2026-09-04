/**
 * Read-only composition proof for DOC-13 -> NLP receipt -> DAG synthesis.
 * This validates ownership and reference wiring; it does not execute synthesis
 * or write analysis, graph, vector, cache, or canonical ontology state.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-13-symbol-nlp-dag-context-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const readJson = async (file) => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));

const report = {
  schema: 'parent-atlas.doc-13-symbol-nlp-dag-context.v1',
  gate: 'DOC-13',
  status: 'BLOCKED_UNPROVEN',
  executionMode: 'READ_ONLY_COMPOSITION',
  writesPerformed: false,
  canonicalAuthority: false,
  ownership: {
    indexedSymbol: 'atlas_symbol_registry + atlas_symbol_versions',
    nlpReceipts: 'analysis_pass_results',
    dagParameters: 'ParameterArtifactV1 references / checksum-bound artifacts',
    synthesis: 'llama-server :8090 /v1 with observed Ornith model',
  },
  checks: {},
};

try {
  const symbolReport = await readJson('docs/reports/parent-atlas/doc-13-symbol-mutual-index-live-v1.json');
  const dagReport = await readJson('docs/reports/dag-parameter-materialization-v1.json');
  report.checks.symbolJoin = {
    status: symbolReport.status,
    matched: symbolReport.match?.join?.status === 'MATCHED_DOCUMENTATION_SYMBOL',
    stableSymbolId: symbolReport.match?.join?.stableSymbolId ?? null,
    symbolVersionId: symbolReport.match?.join?.symbolVersionId ?? null,
    documentationSourceRevision: symbolReport.match?.join?.documentationSourceRevision ?? null,
    codeSourceRevision: symbolReport.match?.join?.codeSourceRevision ?? null,
  };
  report.checks.dagParameters = {
    status: dagReport.status,
    artifactCount: dagReport.artifactCount ?? dagReport.artifacts?.length ?? 0,
    artifactsHaveChecksums: Array.isArray(dagReport.artifacts) && dagReport.artifacts.length > 0
      && dagReport.artifacts.every((item) => item.parameterChecksum && item.artifactChecksum),
    writesPerformed: dagReport.writesPerformed === true,
  };

  const pool = new pg.Pool({ connectionString });
  try {
    const relationResult = await pool.query(`
      SELECT c.relname, c.relkind
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1::text[])
    `, [['atlas_symbol_registry', 'atlas_symbol_versions', 'analysis_pass_results']]);
    const relations = new Map(relationResult.rows.map((row) => [row.relname, row.relkind]));
    const counts = {};
    for (const relation of ['atlas_symbol_registry', 'atlas_symbol_versions', 'analysis_pass_results']) {
      if (relations.has(relation)) {
        const result = await pool.query(`SELECT COUNT(*)::int AS count FROM public.${relation}`);
        counts[relation] = result.rows[0].count;
      } else counts[relation] = null;
    }
    report.checks.postgresOwners = { relations: Object.fromEntries(relations), counts };
  } finally {
    await pool.end();
  }

  report.checks.synthesisBoundary = {
    endpoint: 'http://127.0.0.1:8090/v1/chat/completions',
    modelSelection: 'runtime resolver /v1/models',
    observedModel: 'ornith-1.5-9b',
    rawModelOutputPersisted: false,
  };
  const positive = report.checks.symbolJoin.matched
    && report.checks.dagParameters.status === 'PROVEN_BOUNDED'
    && report.checks.dagParameters.artifactsHaveChecksums
    && report.checks.dagParameters.writesPerformed === false
    && report.checks.postgresOwners.relations.analysis_pass_results;
  report.status = positive ? 'COMPOSITION_OWNER_WIRING_PROVEN' : 'BLOCKED_UNPROVEN';
  report.nextGate = 'ANALYSIS_PASS_CURRENT_SELECTION -> CONTEXT_MANIFEST -> ORNITH_SYNTHESIS_RECEIPT';
} catch (error) {
  report.error = String(error?.message ?? error);
}

report.reportChecksum = digest({ ...report, reportChecksum: undefined });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, writesPerformed: false }));
if (report.error) process.exitCode = 1;
