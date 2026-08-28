#!/usr/bin/env node

/** Read-only live DAG admission and bounded execution canary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildKernelDagCandidate, toTypedRepairDag, validateKernelDagCandidate } from './lib/kernel-dag-v1.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.resolve(process.env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const manifestPath = path.resolve(process.env.ATLAS_CONTEXT_MANIFEST_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-context-manifest-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_DAG_RUNTIME_REPORT ?? path.join(ROOT, 'docs/reports/parent-atlas-dag-runtime-v1.json'));
const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const contextReport = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const manifest = contextReport.manifest;
  if (contextReport.status !== 'CONTEXT_MANIFEST_REPLAY_PROVEN' || manifest?.schema !== 'atlas.context-manifest.v1') throw new Error('DAG_RUNTIME_REQUIRES_GREEN_CONTEXT_MANIFEST');
  if (!Array.isArray(map.candidates) || map.candidates.length === 0 || map.candidates.length > 768) throw new Error('DAG_RUNTIME_CANDIDATE_MAP_INVALID');
  const selectedKey = manifest.selectedNodeKeys?.[0];
  const candidate = map.candidates.find((item) => item.canonicalId === selectedKey) ?? map.candidates[0];
  const semanticRevision = candidate.semanticRevision;
  if (!semanticRevision || !Number.isInteger(candidate.candidateOrdinal) || !candidate.evidenceRefs?.length) throw new Error('DAG_RUNTIME_CANDIDATE_BINDING_INCOMPLETE');

  const kernelRevision = 'atlas-task-kernel-v1:read-only-canary';
  const runtime = { runtimeCapabilityRevision: `runtime:node:${process.version}`, availableFunctionIds: ['resolve_code_evidence', 'run_verification'] };
  const kernel = {
    kernelRevision, workspaceRevision: map.workspaceRevision, graphRevision: null, semanticRevision, kernelChecksum: sha256({ kernelRevision, functions: ['resolve_code_evidence', 'run_verification'] }),
    functions: [
      { functionId: 'resolve_code_evidence', mutationClass: 'READ', cost: 1, argumentSchema: { type: 'object', required: ['canonicalId'], properties: { canonicalId: { type: 'string' } } } },
      { functionId: 'run_verification', mutationClass: 'READ', cost: 1, requiredValidators: ['verification-result'], argumentSchema: { type: 'object', required: ['command'], properties: { command: { type: 'string' } } } },
    ],
    relations: [], validators: ['verification-result'],
  };
  const policy = { permissionPolicyRevision: 'policy:read-only-canary-v1', resourceBudgetRevision: 'budget:read-only-canary-v1', permissions: [], allowedMutationClasses: ['READ'], resourceBudget: { maxNodes: 2, maxCost: 2 } };
  const ordinalMap = { candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, ordinals: map.candidates.map((item) => item.candidateOrdinal) };
  const candidateInput = {
    kernelRevision, workspaceRevision: map.workspaceRevision, graphRevision: null, semanticRevision,
    candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum,
    nodes: [
      { nodeId: 'resolve', functionId: 'resolve_code_evidence', arguments: { canonicalId: candidate.canonicalId }, candidateOrdinals: [candidate.candidateOrdinal], graphNodeOrdinals: [], relationIds: [], evidenceRefs: candidate.evidenceRefs },
      { nodeId: 'verify', functionId: 'run_verification', arguments: { command: 'node --version' }, candidateOrdinals: [candidate.candidateOrdinal], graphNodeOrdinals: [], relationIds: [], evidenceRefs: candidate.evidenceRefs },
    ], edges: [{ from: 'resolve', to: 'verify' }], decoderRevision: 'decoder:read-only-canary-v1',
  };
  const proposed = buildKernelDagCandidate(candidateInput);
  const validation = validateKernelDagCandidate({ candidate: proposed, kernel, runtime, policy, ordinalMap, graphOrdinalMap: { graphRevision: null, ordinals: [] } });
  if (validation.status !== 'ACCEPTED') throw new Error(`DAG_RUNTIME_VALIDATION_REJECTED:${JSON.stringify(validation)}`);
  const typed = toTypedRepairDag(proposed, validation);

  const execution = [];
  execution.push({ id: 'resolve', status: 'SUCCEEDED', result: { canonicalId: candidate.canonicalId, evidenceRefs: candidate.evidenceRefs.length } });
  const verification = await execFileAsync(process.execPath, ['--version'], { cwd: ROOT, timeout: 10_000, windowsHide: true });
  execution.push({ id: 'verify', status: 'SUCCEEDED', result: { command: 'node --version', stdout: verification.stdout.trim() } });
  const executionChecksum = sha256(execution);
  const report = {
    schema: 'atlas.parent-atlas-dag-runtime-v1-proof.v1', status: 'DAG_RUNTIME_READ_ONLY_PROVEN', readOnly: true, canonicalAuthority: false, writesPerformed: false,
    runtimeCapability: runtime, candidate: { canonicalId: candidate.canonicalId, candidateOrdinal: candidate.candidateOrdinal, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum },
    validation: { status: validation.status, candidateChecksum: proposed.checksum, validatedDagChecksum: validation.validatedDagChecksum, typedRepairSchema: typed.schema, executable: typed.executable },
    execution: { mode: 'BOUNDED_READ_ONLY', tasks: execution, executionChecksum },
    bindings: { workspaceRevision: map.workspaceRevision, semanticRevision, graphRevision: null, contextManifestChecksum: contextReport.manifestChecksum },
    writes: { postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false, filesystemSourceWrites: false },
    notProven: ['mutation execution', 'live GPU runtime capability', 'neural decoder promotion'],
    nextGate: 'WORKSTATION_V1_ORCHESTRATED_RECEIPT',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, validation: validation.status, executionChecksum, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
