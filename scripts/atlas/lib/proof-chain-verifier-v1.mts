import { createHash } from 'node:crypto';
import {
  verifyEvidenceReceiptV1,
} from '../audit-openspec-evidence-fabric-v1.mjs';
import { evaluateTaskEvidenceAdmissionV1 } from './openspec-task-card-v1.mjs';
import { OntologyLinkedTupleV1Schema } from '../../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.js';
import { ContextManifestV2Schema } from '../../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.js';
import { canonicalSha256V1 } from '../../../sveltekit-frontend/src/lib/server/atlas/prefill/canonical-hash-v1.js';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function errorSummary(error: unknown): string {
  const issues = (error as { issues?: Array<{ path?: Array<string | number>; code?: string }> } | null)?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return `SCHEMA_INVALID:${issues.map((issue) => `${issue.path?.join('.') || '$'}:${issue.code ?? 'invalid'}`).join(',')}`;
  }
  return error instanceof Error ? error.message : 'INVALID_INPUT';
}

export type ProofChainStageV1 = 'TASK_ADMISSION' | 'EVIDENCE_RECEIPT' | 'ONTOLOGY_TUPLE' | 'CONTEXT_MANIFEST';

export interface ProofChainVerifierInputV1 {
  taskCard: Record<string, any>;
  evidenceTask: Record<string, any>;
  evidenceCard: Record<string, any>;
  receipt: Record<string, any>;
  receiptBindings: Record<string, any>[];
  ontologyTuple: Record<string, any> | null;
  contextManifest: Record<string, any> | null;
  artifactReadback: {
    source: 'FIXTURE';
    independentlyReopened: boolean;
    artifacts: Array<{
      artifactId: 'task-card' | 'evidence-card' | 'evidence-receipt' | 'receipt-bindings' | 'ontology-tuple' | 'context-manifest';
      checksum: string;
    }>;
  };
}

export interface ProofChainVerifierResultV1 {
  schema: 'atlas.proof-chain-verifier-result.v1';
  status: 'FIXTURE_PROVEN' | 'BLOCKED';
  passedStages: ProofChainStageV1[];
  failedGates: string[];
  taskAdmissionChecksum: string | null;
  receiptChecksum: string | null;
  ontologyTupleId: string | null;
  contextManifestChecksum: string | null;
  canonicalAuthority: false;
  writesPerformed: false;
}

export function verifyProofChainV1(input: ProofChainVerifierInputV1): ProofChainVerifierResultV1 {
  const failedGates: string[] = [];
  const passedStages: ProofChainStageV1[] = [];
  let admission: ReturnType<typeof evaluateTaskEvidenceAdmissionV1> | null = null;
  let receipt: Record<string, any> | null = null;
  let tuple: Record<string, any> | null = null;
  let manifestChecksum: string | null = null;

  try {
    admission = evaluateTaskEvidenceAdmissionV1({
      taskCard: input.taskCard,
      evidenceTask: input.evidenceTask,
      evidenceCard: input.evidenceCard,
      receiptBindings: input.receiptBindings,
    });
    if (admission.admitted !== true) failedGates.push(...admission.reasonCodes.map((reason: string) => `TASK_ADMISSION:${reason}`));
    else passedStages.push('TASK_ADMISSION');
  } catch (error) {
    failedGates.push(`TASK_ADMISSION:${errorSummary(error)}`);
  }

  try {
    const verifiedReceipt = verifyEvidenceReceiptV1(input.receipt) as Record<string, any>;
    receipt = verifiedReceipt;
    if (verifiedReceipt.verdict !== 'PROVEN' || verifiedReceipt.readbackRequired !== true || verifiedReceipt.readbackPerformed !== true) {
      failedGates.push('EVIDENCE_RECEIPT:PROVEN_READBACK_REQUIRED');
    } else if (verifiedReceipt.taskId !== input.evidenceTask.taskId
      || verifiedReceipt.changeId !== input.evidenceTask.changeId
      || verifiedReceipt.taskRevision !== input.evidenceTask.taskHash
      || verifiedReceipt.sourceRevision !== input.taskCard.sourceRevision
      || verifiedReceipt.workspaceRevision !== input.taskCard.workspaceRevision
      || !verifiedReceipt.evidenceId
      || !input.evidenceCard.evidenceIds?.includes(verifiedReceipt.evidenceId)) {
      failedGates.push('EVIDENCE_RECEIPT:IDENTITY_OR_REVISION_MISMATCH');
    } else {
      passedStages.push('EVIDENCE_RECEIPT');
    }
  } catch (error) {
    failedGates.push(`EVIDENCE_RECEIPT:${errorSummary(error)}`);
  }

  if (input.ontologyTuple === null) {
    failedGates.push('ONTOLOGY_TUPLE:INPUT_MISSING');
  } else try {
    const parsedTuple = OntologyLinkedTupleV1Schema.parse(input.ontologyTuple) as Record<string, any>;
    tuple = parsedTuple;
    const provenance = parsedTuple.provenance;
    const matchingSourceRefs = (receipt?.sourceRefs ?? []).filter((sourceRef: Record<string, any>) =>
      sourceRef?.file === parsedTuple.sourceRef && typeof sourceRef.sourceRevision === 'string');
    if (parsedTuple.evidenceState !== 'ACTIVE_VERIFIED'
      || matchingSourceRefs.length !== 1
      || provenance.sourceRevision !== matchingSourceRefs[0]?.sourceRevision
      || provenance.workspaceRevision !== input.taskCard.workspaceRevision
      || provenance.taskRevision !== input.evidenceTask.taskHash
      || provenance.evidenceCardChecksum !== input.evidenceCard.checksum
      || !parsedTuple.evidenceRefs.includes(input.evidenceCard.taskRef)) {
      failedGates.push('ONTOLOGY_TUPLE:ADMISSION_OR_LINEAGE_MISMATCH');
    } else {
      passedStages.push('ONTOLOGY_TUPLE');
    }
  } catch (error) {
    failedGates.push(`ONTOLOGY_TUPLE:${errorSummary(error)}`);
  }

  if (input.contextManifest === null) {
    failedGates.push('CONTEXT_MANIFEST:INPUT_MISSING');
  } else try {
    const manifest = ContextManifestV2Schema.parse(input.contextManifest);
    const expectedManifestDigest = canonicalSha256V1({
      schema: 'atlas.context-manifest-v2-identity.v1',
      v1RequestId: manifest.v1.requestId,
      v1SnapshotId: manifest.v1.snapshotId,
      v1CandidateBucket: manifest.v1.candidateBucket,
      ...manifest.identityInput,
    });
    if (manifest.identityChecksum !== expectedManifestDigest) {
      failedGates.push('CONTEXT_MANIFEST:IDENTITY_CHECKSUM_MISMATCH');
    } else if (typeof tuple?.sourceRef !== 'string'
      || !manifest.v1.evidenceRefs.includes(tuple.sourceRef)) {
      failedGates.push('CONTEXT_MANIFEST:EVIDENCE_REFERENCES_INCOMPLETE');
    } else {
      passedStages.push('CONTEXT_MANIFEST');
    }
    manifestChecksum = `sha256:${manifest.identityChecksum}`;
  } catch (error) {
    failedGates.push(`CONTEXT_MANIFEST:${errorSummary(error)}`);
  }

  const readbackValues: Record<string, unknown> = {
    'task-card': input.taskCard,
    'evidence-card': input.evidenceCard,
    'evidence-receipt': input.receipt,
    'receipt-bindings': input.receiptBindings,
    'ontology-tuple': input.ontologyTuple,
    'context-manifest': input.contextManifest,
  };
  const readbackArtifacts = input.artifactReadback?.artifacts ?? [];
  const readbackIds = readbackArtifacts.map((artifact) => artifact.artifactId);
  const readbacks = new Map<string, string>(readbackArtifacts.map((artifact) => [artifact.artifactId, artifact.checksum]));
  const readbackValid = input.artifactReadback?.source === 'FIXTURE'
    && input.artifactReadback?.independentlyReopened === true
    && readbackArtifacts.length === Object.keys(readbackValues).length
    && new Set(readbackIds).size === readbackArtifacts.length
    && Object.entries(readbackValues).every(([artifactId, value]) => {
      const checksum = readbacks.get(artifactId as keyof typeof readbackValues);
      return typeof checksum === 'string'
        && /^sha256:[a-f0-9]{64}$/i.test(checksum)
        && checksum === sha256(canonicalJson(value));
    });
  if (input.artifactReadback?.source !== 'FIXTURE') {
    failedGates.push('READBACK:AUTHORITATIVE_READBACK_OWNER_NOT_WIRED');
  } else if (!readbackValid) {
    failedGates.push('READBACK:INDEPENDENT_CHECKSUM_READBACK_REQUIRED');
  }
  if (admission?.admitted !== true || !receipt || !tuple || !manifestChecksum || failedGates.length > 0) {
    if (failedGates.length === 0) failedGates.push('CHAIN:REQUIRED_STAGE_NOT_PROVEN');
  }

  const complete = passedStages.length === 4 && failedGates.length === 0
    && readbackValid;
  const status = complete ? 'FIXTURE_PROVEN' : 'BLOCKED';

  return {
    schema: 'atlas.proof-chain-verifier-result.v1',
    status,
    passedStages,
    failedGates: [...new Set(failedGates)].sort(),
    taskAdmissionChecksum: admission?.checksum ?? null,
    receiptChecksum: receipt?.checksum ?? null,
    ontologyTupleId: tuple?.tupleId ?? null,
    contextManifestChecksum: manifestChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
