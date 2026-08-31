#!/usr/bin/env node
/** Freeze a bounded relationship apply plan without performing any writes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return path.resolve(ROOT, arg ? arg.slice(prefix.length) : fallback);
};
const materializationPath = argValue(
  'input',
  'docs/reports/feature-ontology-relationship-materialization-readonly-v1.json',
);
const graphPath = argValue(
  'graph',
  'docs/reports/current-feature-ontology-graph-revision-v1.json',
);
const reportPath = argValue(
  'report',
  'docs/reports/current-feature-ontology-relationship-apply-plan-v1.json',
);
const materialization = JSON.parse(fs.readFileSync(materializationPath, 'utf8'));
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const relationships = Array.isArray(materialization.prepared_relationships)
  ? materialization.prepared_relationships
  : [];
const ids = relationships.map((row) => String(row.relationship_id ?? '')).filter(Boolean).sort();
const checksum = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const allBound = materialization.canonical_binding?.accepted === ids.length;
const zeroRejected = (materialization.canonical_binding?.rejected ?? 0) === 0;
const ready =
  ids.length > 0 &&
  materialization.canonical_writes === false &&
  graph.replay?.reversedInputInvariant === true &&
  allBound &&
  zeroRejected;
const plan = {
  schema: 'atlas.current-feature-ontology-relationship-apply-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'NON_PRODUCTION_REVIEW_ONLY',
  sourceMaterializationReport: path.relative(ROOT, materializationPath).replaceAll('\\', '/'),
  sourceGraphRevisionReport: path.relative(ROOT, graphPath).replaceAll('\\', '/'),
  workspaceRevision: graph.workspaceRevision,
  relationshipGraphRevision: graph.relationshipGraphRevision,
  relationshipCount: ids.length,
  relationshipIds: ids,
  relationshipSelectionChecksum: checksum(ids),
  preconditions: {
    materializationCanonicalWrites: materialization.canonical_writes === false,
    graphRevisionReplayInvariant: graph.replay?.reversedInputInvariant === true,
    rejectedUnboundTuples: materialization.canonical_binding?.rejected ?? null,
    allSelectedRelationshipsCurrentBound: allBound,
    zeroRejectedUnboundTuples: zeroRejected,
  },
  writeBoundaries: {
    relationshipApplyAuthorized: false,
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    tupleRewrites: false,
    historicalRowsRewritten: false,
  },
  status: ready
    ? 'CURRENT_RELATIONSHIP_APPLY_PLAN_READY_FOR_EXPLICIT_AUTHORIZATION'
    : 'CURRENT_RELATIONSHIP_APPLY_PLAN_BLOCKED',
  nextGate: ready
    ? 'EXPLICIT_NON_PRODUCTION_RELATIONSHIP_APPLY_AUTHORIZATION'
    : 'CURRENT_RELATIONSHIP_BINDING_PRECONDITIONS_REQUIRED',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: plan.status,
  relationshipCount: plan.relationshipCount,
  relationshipGraphRevision: plan.relationshipGraphRevision,
  relationshipSelectionChecksum: plan.relationshipSelectionChecksum,
  preconditions: plan.preconditions,
  reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'),
}, null, 2));
