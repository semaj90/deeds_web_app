#!/usr/bin/env node
/** End-to-end dry integration test for the OKF/Parent Atlas planning spine. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));
const failures = [];
const chunkPlan = await load('docs/reports/okf-chunk-plan-v1.json');
const contextPlan = await load('docs/reports/okf-agentic-context-plan-v1.json');

if (chunkPlan.schema !== 'atlas.okf-chunk-plan.v1') failures.push('chunk_plan_schema');
if (chunkPlan.canonicalAuthority !== false) failures.push('chunk_plan_canonical');
if (contextPlan.schema !== 'atlas.okf-agentic-context-plan.v1') failures.push('context_plan_schema');
if (contextPlan.canonicalAuthority !== false) failures.push('context_plan_canonical');
if (chunkPlan.workspaceRevision !== contextPlan.sourceWorkspaceRevision) failures.push('workspace_revision_drift');
if (!contextPlan.candidateCount || contextPlan.candidateCount !== contextPlan.candidates.length) failures.push('candidate_count');
if (contextPlan.candidates.some((candidate, index) => candidate.candidateOrdinal !== index || !candidate.sourceRef || !candidate.sourceRevision || !candidate.chunkChecksum)) failures.push('candidate_identity');
if (contextPlan.contextManifest.selectedCandidateOrdinals.length !== contextPlan.candidateCount) failures.push('manifest_selection');
if (contextPlan.contextManifest.evidenceRefs.length !== contextPlan.candidateCount) failures.push('manifest_evidence');
if (!contextPlan.parameterArtifact.parameterChecksum || contextPlan.parameterArtifact.execution !== 'NOT_EXECUTED') failures.push('parameter_artifact');
if (contextPlan.synthesis.provider !== 'llama-server' || contextPlan.synthesis.status !== 'NOT_EXECUTED' || !contextPlan.synthesis.contextManifestChecksum) failures.push('ornith_boundary');
if (contextPlan.cache.owner !== 'BitFrost/Valkey' || contextPlan.cache.status !== 'NOT_WARMED') failures.push('cache_boundary');
if (contextPlan.writesPerformed !== false || contextPlan.datastoreWritesPerformed !== false || contextPlan.externalNetworkCallsPerformed !== false) failures.push('write_boundary');

const result = {
  schema: 'atlas.okf-agentic-fabric-e2e-test.v1',
  status: failures.length ? 'FAILED' : 'PASSED_PRE_ADMISSION',
  stages: ['source_binding', 'utf8_chunk_plan', 'candidate_ordinal_proposal', 'ace_manifest_proposal', 'parameter_artifact_proposal', 'bitfrost_key_material', 'ornith_request_metadata'],
  sourceWorkspaceRevision: chunkPlan.workspaceRevision,
  candidateCount: contextPlan.candidateCount,
  failures,
  execution: 'NOT_EXECUTED',
  writesPerformed: false,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
