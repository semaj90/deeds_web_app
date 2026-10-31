import { createHash, randomUUID } from 'node:crypto';
import { buildGraphifyDailyPreflightPlanV1, hostPreflightReceiptV1Schema } from '../../packages/parent-atlas/dist/index.js';
import { executeDiagnosticCapabilityV1 } from './run-diagnostic-capability-v1.mjs';

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const gitHead = executeDiagnosticCapabilityV1('workspace.revision.diagnostic').trim();
if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(gitHead)) throw new Error('WORKSPACE_GIT_HEAD_INVALID');
const hostText = executeDiagnosticCapabilityV1('host.preflight.read');
const host = hostPreflightReceiptV1Schema.parse(JSON.parse(hostText));

const runId = `run:${randomUUID()}`;
const hostResourceDigest = sha256(JSON.stringify(host.host));
const gpuObservationDigest = sha256(JSON.stringify(host.gpu));
const pending = () => ({ status: 'UNVERIFIED', evidenceRefs: [], revision: null });
const observed = (ref, revision) => ({ status: 'UNVERIFIED', evidenceRefs: [ref], revision });

const plan = buildGraphifyDailyPreflightPlanV1({
  workflowId: 'graphify:daily-preflight',
  runId,
  workspaceRevision: observed(`git-head-observation:${gitHead}`, gitHead),
  sourceRevision: pending(),
  repositoryIdentity: pending(),
  membershipAdmission: pending(),
  scopePolicy: pending(),
  executionAuthority: pending(),
  graphSnapshotRevision: pending(),
  topologyBindings: pending(),
  astLineage: pending(),
  packetChunkLineage: pending(),
  schemaOwnership: pending(),
  lexicalLane: pending(),
  hostResources: observed(`host-resource-observation-sha256:${hostResourceDigest}`, hostResourceDigest),
  gpuResources: observed(`gpu-observation-sha256:${gpuObservationDigest}`, gpuObservationDigest),
});

const body = {
  schema: 'atlas.graphify-daily-preflight-run.v1',
  runId,
  observedAtUtc: host.observedAtUtc,
  workspaceGitHead: gitHead,
  hostDiagnostics: host,
  plan,
};
const output = { ...body, outputSha256: sha256(JSON.stringify(body)) };
process.stdout.write(`${JSON.stringify(output)}\n`);
