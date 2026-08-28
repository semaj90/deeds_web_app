#!/usr/bin/env node
/** Derive a read-only relationship graph revision from the admitted dry-run cohort. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphRevisionV1 } from './lib/graph-revision-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(ROOT, 'docs/reports/feature-ontology-relationship-materialization-v1.json');
const reportPath = path.join(ROOT, 'docs/reports/current-feature-ontology-graph-revision-v1.json');
const { featureRelationshipToKernel } = await import('../../packages/parent-atlas/dist/core/relationship-kernel.js');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const relationships = Array.isArray(input.prepared_relationships) ? input.prepared_relationships : [];
const workspaceRevision = input.canonical_binding?.workspace_revision ?? null;
if (input.canonical_writes === true) throw new Error('GRAPH_REVISION_PROOF_REQUIRES_READ_ONLY_MATERIALIZATION');
if (!workspaceRevision) throw new Error('GRAPH_REVISION_PROOF_WORKSPACE_REQUIRED');
const kernels = relationships.map(featureRelationshipToKernel);
const identity = buildGraphRevisionV1({ workspaceRevision, kernels, projectionSchemaRevision: 'atlas.relationship-graph-snapshot.v1' });
const reversedIdentity = buildGraphRevisionV1({ workspaceRevision, kernels: [...kernels].reverse(), projectionSchemaRevision: 'atlas.relationship-graph-snapshot.v1' });
const output = {
  schema: 'atlas.current-feature-ontology-graph-revision.v1',
  generatedAt: new Date().toISOString(), mode: 'READ_ONLY_DRY_RUN_DERIVATION',
  postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false,
  inputReport: 'docs/reports/feature-ontology-relationship-materialization-v1.json',
  workspaceRevision, kernelCount: kernels.length, relationshipIds: kernels.map((kernel) => kernel.relationshipId).sort(),
  graphIdentity: identity,
  relationshipGraphRevision: identity.graphRevision,
  replay: {
    reversedInputGraphRevision: reversedIdentity.graphRevision,
    reversedInputInvariant: reversedIdentity.graphRevision === identity.graphRevision,
  },
  status: kernels.length > 0 && reversedIdentity.graphRevision === identity.graphRevision ? 'CURRENT_RELATIONSHIP_GRAPH_REVISION_DERIVED_REVIEW_ONLY' : 'CURRENT_RELATIONSHIP_GRAPH_REVISION_REPLAY_FAILED',
  nextGate: kernels.length > 0 ? 'HUMAN_REVIEW_AND_EXPLICIT_RELATIONSHIP_APPLY_AUTHORIZATION' : 'CURRENT_RELATIONSHIP_BINDING_REQUIRED',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, kernelCount: output.kernelCount, relationshipGraphRevision: output.relationshipGraphRevision, reportPath: 'docs/reports/current-feature-ontology-graph-revision-v1.json' }, null, 2));
