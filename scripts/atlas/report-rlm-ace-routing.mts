#!/usr/bin/env node
/**
 * Build a read-only RLM navigation + ACE prefetch receipt from the existing
 * revision-qualified QAS candidate feature export.
 *
 * This script never mutates Postgres, Qdrant, Neo4j, Valkey/BitFrost, GPU
 * indexes, Kanban state, or canonical packet identity. It only writes a report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildRlmAceRoutingReceipt,
  buildRlmRoutingPrefill,
  type RlmCandidateSeed,
} from '../../sveltekit-frontend/src/lib/server/atlas/rlm/rlm-ace-routing.js';
import { QueryAdaptiveFeatureRowV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-feature-compiler.js';

const ROOT = resolve(import.meta.dirname, '../..');
const inputIndex = process.argv.indexOf('--input');
const outputIndex = process.argv.indexOf('--output');
const queryIndex = process.argv.indexOf('--query');
const inputPath = resolve(ROOT, inputIndex >= 0 ? process.argv[inputIndex + 1] : 'docs/reports/atlas-qas-candidate-features.jsonl');
const outputPath = resolve(ROOT, outputIndex >= 0 ? process.argv[outputIndex + 1] : 'docs/reports/rlm-ace-routing-receipt.json');
const query = queryIndex >= 0 ? process.argv[queryIndex + 1] : 'daily Graphify evidence review and agentic error-fixing recommendations';

const report = {
  schema: 'atlas.rlm-ace.daily-report.v1',
  status: 'MISSING_INPUT' as 'MISSING_INPUT' | 'PROVEN' | 'DEGRADED',
  inputPath,
  outputPath,
  rowsRead: 0,
  rowsAccepted: 0,
  rowsRejected: 0,
  canonicalWrites: false,
  cacheWrites: false,
  receipt: null as unknown,
  rejected: [] as Array<{ line: number; reason: string }>,
};

if (existsSync(inputPath)) {
  const rows = readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean);
  report.rowsRead = rows.length;
  const seeds: RlmCandidateSeed[] = [];
  let workspaceRevision: string | null = null;
  let requestId: string | null = null;
  let taskKind: string | null = null;
  let somRevision: string | null = null;

  for (const [index, line] of rows.entries()) {
    try {
      const row = QueryAdaptiveFeatureRowV1Schema.parse(JSON.parse(line));
      workspaceRevision ??= row.workspaceRevision;
      requestId ??= row.requestId;
      taskKind ??= row.taskKind;
      somRevision ??= row.somRevision;
      if (row.workspaceRevision !== workspaceRevision || row.requestId !== requestId) {
        throw new Error('mixed requestId/workspaceRevision in one routing receipt');
      }
      seeds.push({
        requestId: row.requestId,
        canonicalId: row.canonicalId,
        packetKey: row.packetKey,
        symbolVersionId: row.symbolVersionId,
        treeNodeId: null,
        sourceRef: row.sourceRef,
        workspaceRevision: row.workspaceRevision,
        sourceRevision: row.sourceRevision,
        graphRevision: row.graphRevision,
        representationRevision: row.representationRevision,
        taskKind: row.taskKind,
        semanticAffinity: row.features.semanticAffinity,
        lexicalAffinity: row.features.lexicalAffinity,
        astAffinity: row.features.astAffinity,
        graphAuthority: row.features.graphAuthority,
        executionUtility: row.features.priorExecutionSuccess,
        domainAffinity: row.features.domainAffinity,
        evidenceRefs: row.evidenceRefs,
      });
    } catch (error) {
      report.rejected.push({ line: index + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  report.rowsAccepted = seeds.length;
  report.rowsRejected = report.rejected.length;
  if (seeds.length > 0 && workspaceRevision && requestId) {
    // SOM coordinates and KMeans centroid IDs are intentionally not fabricated.
    // They remain null/empty until their existing owners provide revisioned routing metadata.
    const routingPrefill = buildRlmRoutingPrefill({
      requestId,
      query,
      workspaceRevision,
      taskKind,
      som: null,
      centroidIds: [],
      cachedIntentState: somRevision ? { somRevision } : null,
    });
    report.receipt = buildRlmAceRoutingReceipt({ routingPrefill, seeds });
    report.status = report.rowsRejected === 0 ? 'PROVEN' : 'DEGRADED';
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
