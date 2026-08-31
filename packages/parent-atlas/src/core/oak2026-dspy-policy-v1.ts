import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { AtlasKernelFunctionCatalogV1 } from './kernel-function-catalog-v1.js';
import type { KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import type { AtlasOntologyKernelManifestV1 } from './ontology-kernel-manifest-v1.js';
import { planKernelBoundDagV1 } from './kernel-bound-dag-planner-v1.js';
import type { AdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';

export const OAK_2026_DSPY_POLICY_SCHEMA = 'atlas.oak2026-dspy-kernel-function-proposal.v1' as const;
export const OAK_2026_DSPY_CONTRACT_REVISION = 'parent-atlas-oak2026-dspy-contract-v1' as const;

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/** Python/DSPy wire shape. DSPy proposes only; it never executes this record. */
export const oak2026DspyKernelFunctionProposalWireSchema = z.object({
  schema: z.literal(OAK_2026_DSPY_POLICY_SCHEMA),
  contract_revision: z.literal(OAK_2026_DSPY_CONTRACT_REVISION),
  kernel_revision: z.string().min(1),
  program_revision: z.string().min(1),
  query_id: z.string().min(1),
  function_id: z.string().min(1),
  bound_arguments: z.record(z.string(), z.unknown()),
  evidence_refs: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  canonical_authority: z.literal(false),
  proposal_checksum: sha256Hex,
}).strict();

export type Oak2026DspyKernelFunctionProposalWireV1 = z.infer<typeof oak2026DspyKernelFunctionProposalWireSchema>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function verifyOak2026DspyProposalV1(input: {
  manifest: AtlasOntologyKernelManifestV1;
  proposal: Oak2026DspyKernelFunctionProposalWireV1;
  allowedEvidenceRefs: readonly string[];
}): Oak2026DspyKernelFunctionProposalWireV1 {
  const proposal = oak2026DspyKernelFunctionProposalWireSchema.parse(input.proposal);
  const { proposal_checksum: observedChecksum, ...unsigned } = proposal;
  const expectedChecksum = sha256(unsigned);
  if (observedChecksum !== expectedChecksum) throw new Error('OAK_2026_DSPY_PROPOSAL_CHECKSUM_MISMATCH');
  if (proposal.kernel_revision !== input.manifest.kernelRevision) throw new Error('OAK_2026_DSPY_KERNEL_REVISION_MISMATCH');
  if (!input.manifest.functionIds.includes(proposal.function_id)) {
    throw new Error(`OAK_2026_DSPY_FUNCTION_NOT_IN_FROZEN_KERNEL:${proposal.function_id}`);
  }
  const allowedEvidence = new Set(input.allowedEvidenceRefs);
  const unknownEvidence = proposal.evidence_refs.filter((ref) => !allowedEvidence.has(ref));
  if (unknownEvidence.length > 0) {
    throw new Error(`OAK_2026_DSPY_UNKNOWN_EVIDENCE_REFS:${unknownEvidence.join(',')}`);
  }
  return proposal;
}

/**
 * Convert a validated DSPy semantic proposal into the existing bounded DAG.
 * Authorization and execution remain downstream Parent Atlas responsibilities.
 */
export function planOak2026DspyKernelDagV1(input: {
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
  operatorLibrary: KernelOperatorLibraryV1;
  proposal: Oak2026DspyKernelFunctionProposalWireV1;
  allowedEvidenceRefs: readonly string[];
  plannerRevision: string;
  classificationRevision: string;
  inputChecksum: string;
}): AdaptiveDagPlanV1 {
  const proposal = verifyOak2026DspyProposalV1({
    manifest: input.manifest,
    proposal: input.proposal,
    allowedEvidenceRefs: input.allowedEvidenceRefs,
  });

  return planKernelBoundDagV1({
    manifest: input.manifest,
    catalog: input.catalog,
    operatorLibrary: input.operatorLibrary,
    functionId: proposal.function_id,
    request: {
      planId: `oak2026-dspy:${proposal.query_id}:${proposal.program_revision}`,
      queryId: proposal.query_id,
      plannerRevision: input.plannerRevision,
      classificationRevision: input.classificationRevision,
      boundArguments: proposal.bound_arguments,
      evidenceRefs: proposal.evidence_refs,
      inputChecksum: input.inputChecksum,
    },
  });
}
