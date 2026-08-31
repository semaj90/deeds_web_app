#!/usr/bin/env node
/** Derive a read-only relationship graph revision from the admitted read-only cohort. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphRevisionV1 } from './lib/graph-revision-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return path.resolve(ROOT, arg ? arg.slice(prefix.length) : fallback);
};
const inputPath = argValue(
  'input',
  'docs/reports/feature-ontology-relationship-materialization-readonly-v1.json',
);
const reportPath = argValue(
  'report',
  'docs/reports/current-feature-ontology-graph-revision-v1.json',
);
const { featureRelationshipToKernel } = await import('../../packages/parent-atlas/dist/core/relationship-kernel.js');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const relationships = Array.isArray(input.prepared_relationships) ? input.prepared_relationships : [];
const workspaceRevision = input.canonical_binding?.workspace_revision ?? null;
if (input.canonical_writes === true) throw new Error('GRAPH_REVISION_PROOF_REQUIRES_READ_ONLY_MATERIALIZATION');
if (input.mode !== 'READ_ONLY_SNAPSHOT') throw new Error(`GRAPH_REVISION_PROOF_REQUIRES_READ_ONLY_SNAPSHOT:${input.mode ?? 'missing'}`);
if (input.transactionReadOnly !== true || input.isolationLevel !== 'REPEATABLE READ') {
  throw new Error('GRAPH_REVISION_PROOF_REQUIRES_REPEATABLE_READ_READ_ONLY_RECEIPT');
}
if (!workspaceRevision) throw new Error('GRAPH_REVISION_PROOF_WORKSPACE_REQUIRED');
if ((input.canonical_binding?.rejected ?? 0) !== 0) {
  throw new Error('GRAPH_REVISION_PROOF_REJECTED_BINDINGS_PRESENT');
}
if ((input.canonical_binding?.accepted ?? -1) !== relationships.length) {
  throw new Error('GRAPH_REVISION_PROOF_RELATIONSHIP_BINDING_CARDINALITY_MISMATCH');
}
const kernels = relationships.map(featureRelationshipToKernel);
const identity = buildGraphRevisionV1({
  workspaceRevision,
  kernels,
  projectionSchemaRevision: 'atlas.relationship-graph-snapshot.v1',
});
const reversedIdentity = buildGraphRevisionV1({
  workspaceRevision,
  kernels: [...kernels].reverse(),
  projectionSchemaRevision: 'atlas.relationship-graph-snapshot.v1',
});
const replayStable = reversedIdentity.graphRevision === identity.graphRevision;
const output = {
  schema: 'atlas.current-feature-ontology-graph-revision.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REPEATABLE_READ_DERIVATION',
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  inputReport: path.relative(ROOT, inputPath).replaceAll('\\', '/'),
  inputReceipt: {
    mode: input.mode,
    isolationLevel: input.isolationLevel,
    transactionReadOnly: input.transactionReadOnly,
    canonicalWrites: input.canonical_writes,
    acceptedBindings: input.canonical_binding?.accepted ?? null,
    rejectedBindings: input.canonical_binding?.rejected ?? null,
  },
  workspaceRevision,
  kernelCount: kernels.length,
  relationshipIds: kernels.map((kernel) => kernel.relationshipId).sort(),
  graphIdentity: identity,
  relationshipGraphRevision: identity.graphRevision,
  replay: {
    reversedInputGraphRevision: reversedIdentity.graphRevision,
    reversedInputInvariant: replayStable,
  },
  status: kernels.length > 0 && replayStable
    ? 'CURRENT_RELATIONSHIP_GRAPH_REVISION_DERIVED_READ_ONLY'
    : 'CURRENT_RELATIONSHIP_GRAPH_REVISION_REPLAY_FAILED',
  nextGate: kernels.length > 0 && replayStable
    ? 'GRAPH_PROJECTION_RECEIPT_REQUIRED'
    : 'CURRENT_RELATIONSHIP_BINDING_REQUIRED',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: output.status,
  kernelCount: output.kernelCount,
  relationshipGraphRevision: output.relationshipGraphRevision,
  inputReport: output.inputReport,
  reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'),
}, null, 2));
