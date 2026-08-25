#!/usr/bin/env node
/**
 * Opt-in, read-only derived-context lane for daily Graphify.
 *
 * This composes existing owners only: AST identity enrichment, taxonomy
 * suggestions, contextual-tree readiness, and latent/SOM join audits. It
 * never promotes domains, ontology tuples, topology coordinates, clusters,
 * or cache entries.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/atlas-derived-context-read-v1.json');
const node = process.execPath;
const python = process.env.ATLAS_PYTHON?.trim() || 'python';

const steps = [
  {
    id: 'AST_IDENTITY_READ',
    command: node,
    args: ['scripts/atlas/enrich-ast-entity-prefill-identity.mjs'],
  },
  {
    id: 'DOMAIN_SUGGESTIONS_READ',
    command: node,
    args: ['node_modules/tsx/dist/cli.mjs', 'scripts/atlas/classify-ast-entities-okf-dry-run.mts'],
  },
  {
    id: 'CONTEXTUAL_TREE_AUDIT',
    command: node,
    args: ['scripts/atlas/audit-contextual-tree-readiness.mjs'],
  },
  {
    id: 'LATENT_SOM_JOIN_AUDIT',
    command: node,
    args: ['scripts/atlas/audit-latent-som-join-keys.mjs'],
  },
  {
    id: 'RUNTIME_CAPABILITY_READ',
    command: python,
    args: ['python/atlas_kernel_session.py'],
    parseJson: true,
  },
  {
    id: 'SOURCE_LINEAGE_READ',
    command: node,
    args: ['scripts/atlas/audit-live-source-lineage-tables.mjs'],
  },
];

const results = [];
for (const step of steps) {
  const started = Date.now();
  try {
    const output = execFileSync(step.command, step.args, {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = { id: step.id, status: 'PASS', durationMs: Date.now() - started, outputTail: output.slice(-2000) };
    if (step.parseJson) {
      try { result.manifest = JSON.parse(output); } catch { result.status = 'DEGRADED'; result.parseError = 'RUNTIME_MANIFEST_NOT_JSON'; }
    }
    results.push(result);
  } catch (error) {
    results.push({
      id: step.id,
      status: 'DEGRADED',
      durationMs: Date.now() - started,
      error: String(error?.message ?? error).slice(-2000),
    });
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

const contextual = readJson('docs/reports/contextual-tree-readiness-report.json');
const latentSom = readJson('docs/reports/latent-som-join-key-audit.json');
const sourceLineage = readJson('docs/reports/live-source-lineage-table-audit.json');
const derivedReadiness = {
  contextualTree: contextual?.summary?.overall ?? contextual?.overall ?? contextual?.status ?? 'NOT_REPORTED',
  latentCoveragePct: latentSom?.latent_coverage?.coverage_pct ?? null,
  somCoveragePct: latentSom?.som_coverage?.coverage_pct ?? null,
  sourceLineage: sourceLineage?.status ?? 'NOT_REPORTED',
  databaseContext: sourceLineage?.databaseConnection?.status ?? 'NOT_REPORTED',
};
const degraded = results.some((step) => step.status !== 'PASS')
  || derivedReadiness.contextualTree !== 'READY'
  || Number(derivedReadiness.latentCoveragePct ?? 0) < 100
  || Number(derivedReadiness.somCoveragePct ?? 0) < 100
  || derivedReadiness.databaseContext !== 'READBACK_PROVEN';
const receipt = {
  schema: 'atlas.derived-context-read.v1',
  generatedAt: new Date().toISOString(),
  status: degraded ? 'DEGRADED_READ_ONLY' : 'READ_ONLY_COMPLETE',
  readOnly: true,
  canonicalWrites: false,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  readiness: derivedReadiness,
  databaseConnection: sourceLineage?.databaseConnection ?? null,
  projectionOwners: {
    contextualTree: 'packages/parent-atlas/src/core/contextual-tree-snapshot.ts',
    topology: 'packages/parent-atlas/src/core/atlas-topology-v1.ts',
    featureAlignment: 'packages/parent-atlas/src/core/feature-signal-alignment.ts',
    ontology: 'packages/parent-atlas/src/core/hypergraph-retrieval.ts',
    runtime: 'python/atlas_kernel_session.py',
  },
  runtimePolicy: {
    networkx: 'CPU_DERIVED_GRAPH_ORACLE',
    nxCugraph: 'SEPARATE_RAPIDS_EXECUTOR',
    freeThreadedPython: 'CAPABILITY_PROBE_ONLY',
    defaultParallelism: 'PROCESS_POOL_OR_EXTERNAL_GPU_RUNTIME',
    canonicalAuthority: false,
  },
  results,
  fallbackPolicy: 'CONTINUE_WITH_EXISTING_GRAPHIFY_RECEIPT',
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: receipt.status, reportPath, steps: results.map(({ id, status }) => ({ id, status })) }, null, 2));
