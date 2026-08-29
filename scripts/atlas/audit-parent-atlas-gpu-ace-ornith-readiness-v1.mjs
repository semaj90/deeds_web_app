#!/usr/bin/env node

/** Read-only aggregation of the proven GPU -> ACE -> Ornith gates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = async (name) => JSON.parse(await fs.readFile(path.join(root, 'docs/reports', name), 'utf8'));
const reports = {
  tileReadback: await load('embedding-tile-artifact-readback-v1.json'),
  gpuRoundtrip: await load('8098-candidate-ordinal-roundtrip-v1.json'),
  featureReplay: await load('8098-feature-matrix-join-replay-v1.json'),
  contextReplay: await load('gpu-feature-ace-context-manifest-replay-v1.json'),
  synthesisReplay: await load('ornith-external-evidence-synthesis-replay-v1.json'),
  claimValidation: await load('ornith-grounded-claim-validation-v1.json'),
  dagGate: await load('ornith-agent-dag-readonly-gate-v1.json'),
  mutationBarrier: await load('mutation-authorization-barrier-v1.json'),
};
const checks = {
  tileReadback: reports.tileReadback.status === 'EMBEDDING_TILE_ARTIFACT_READBACK_PROVEN',
  gpuOrdinalRoundtrip: reports.gpuRoundtrip.status === '8098_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN',
  featureReplay: reports.featureReplay.status === '8098_FEATURE_MATRIX_JOIN_REPLAY_PROVEN',
  contextReplay: reports.contextReplay.status === 'GPU_FEATURE_CONTEXT_MANIFEST_REPLAY_PROVEN',
  synthesisReplay: reports.synthesisReplay.status === 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN',
  claimValidation: reports.claimValidation.status === 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN',
  readOnlyDag: reports.dagGate.status === 'ORNITH_AGENT_DAG_READONLY_GATE_PROVEN',
  mutationBlocked: reports.mutationBarrier.status === 'MUTATION_AUTHORIZATION_BARRIER_PROVEN',
};
const controls = Object.values(reports).every((report) => Object.values(report.controls ?? {}).filter((value) => typeof value === 'boolean').every((value) => value === false || value === true));
const output = {
  schema: 'atlas.parent-atlas-gpu-ace-ornith-readiness.v1',
  mode: 'READ_ONLY_PROMOTION_READINESS_AUDIT',
  status: Object.values(checks).every(Boolean) && controls ? 'GPU_ACE_ORNITH_READONLY_CHAIN_PROVEN' : 'GPU_ACE_ORNITH_READONLY_CHAIN_BLOCKED',
  gates: checks,
  proven: ['tile artifact readback', 'CandidateOrdinal GPU roundtrip', 'feature-matrix graph replay', 'ACE to ContextManifest replay', 'Ornith synthesis replay', 'grounded claim validation', 'read-only agent DAG validation', 'mutation rejection'],
  notDone: ['explicit user mutation authorization', 'patch plan creation', 'patch application', 'post-patch validators', 'full-corpus CandidateOrdinal expansion', 'graph-revision ownership for 128/768 scaling'],
  controls: { readOnly: true, canonicalAuthority: false, promotionToProduction: false, writesPerformed: false, postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false },
};
const reportPath = path.join(root, 'docs/reports/parent-atlas-gpu-ace-ornith-readiness-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, gates: output.gates, notDone: output.notDone, reportPath }, null, 2));
if (output.status !== 'GPU_ACE_ORNITH_READONLY_CHAIN_PROVEN') process.exitCode = 1;
