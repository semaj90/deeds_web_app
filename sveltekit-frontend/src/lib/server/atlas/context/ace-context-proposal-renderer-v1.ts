import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  buildAceContextPacketV1,
  type AceContextPacketV1,
} from '../agentic/hermes-adaptive-pipeline-v1.js';
import {
  buildContextManifestV2,
  ContextManifestV2Schema,
  type ContextManifestV2,
} from '../graph/context-manifest-v2.js';
import {
  buildPromptPlanV1,
  type PromptPlanSegmentV1,
  type PromptPlanV1,
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_RESERVED_OUTPUT_TOKENS,
  LLAMA_SERVER_CONTEXT_LIMIT_TOKENS,
} from '../prefill/prompt-plan-v1.js';
import {
  parseDspyRepairOutputV1,
  type DspyRepairOutputV1,
} from '../evals/dspy-repair-output-v1.js';

const FORBIDDEN_KEYS = new Set([
  'hiddenthoughts',
  'chainofthought',
  'kv_cache',
  'kvcache',
  'tensor',
  'reasoning_content',
]);

function assertNoForbiddenKeys(obj: unknown, path = '$'): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoForbiddenKeys(item, `${path}[${idx}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      throw new Error(`FORBIDDEN_KEY_DETECTED:${path}.${key}`);
    }
    assertNoForbiddenKeys(value, `${path}.${key}`);
  }
}

export interface RenderAceProposalContextAndPlanInputV1 {
  runId: string;
  manifest: ContextManifestV2;
  proposal: DspyRepairOutputV1;
  evidenceBindings: Record<string, {
    sourceRef: string;
    packetKey: string;
    sourceRevision: string;
    content: string;
    contentChecksum: string;
  }>;
  tokenizer: {
    revision: string;
    countTokens: (text: string) => number;
  };
  promptTemplateRevision: string;
  instructionRevision: string;
  systemPolicyText?: string;
  toolSchemaText?: string | null;
  contextLimitTokens?: number;
  reservedOutputTokens?: number;
  maxInputTokens?: number;
}

export interface RenderAceProposalContextAndPlanResultV1 {
  aceContextPacket: AceContextPacketV1;
  promptPlan: PromptPlanV1;
  canonicalAuthority: false;
  writesPerformed: false;
  hiddenThoughtsPersisted: false;
  kvCachePersisted: false;
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const EvidenceBindingSchema = z.object({
  sourceRef: z.string().trim().min(1),
  packetKey: z.string().trim().min(1),
  sourceRevision: z.string().trim().min(1),
  content: z.string().min(1),
  contentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/**
 * ACE-CONTEXT-01: Renders a validated advisory proposal into:
 * 1. The existing `buildAceContextPacketV1` `rawEvidence` path (sanitized via NES-LUT).
 * 2. The existing `ContextManifestV2` -> `PromptPlanV1` path (AFC-04B).
 *
 * Rules:
 * - Fails closed on unadmitted evidence refs (manifest allowlist enforced).
 * - Rejects any hidden thoughts, KV cache or tensor state.
 * - Does not add a second prompt compiler or budget (delegates directly to buildPromptPlanV1).
 * - Canonical authority is strictly false; writesPerformed is strictly false.
 */
export function renderAceProposalContextAndPlanV1(
  input: RenderAceProposalContextAndPlanInputV1
): RenderAceProposalContextAndPlanResultV1 {
  // 1. Guard against hidden reasoning, KV, or tensor persistence
  assertNoForbiddenKeys(input.proposal);

  if (!Array.isArray(input.proposal.evidenceRefs) || input.proposal.evidenceRefs.length === 0) {
    throw new Error('PROPOSAL_EVIDENCE_REFS_EMPTY');
  }

  const manifest = ContextManifestV2Schema.parse(input.manifest);
  const recomputedManifest = buildContextManifestV2(manifest.v1, manifest.identityInput);
  if (recomputedManifest.identityChecksum !== manifest.identityChecksum) {
    throw new Error('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_INVALID');
  }
  const proposal = parseDspyRepairOutputV1(input.proposal, manifest);

  // 2. Evidence allowlist enforcement against ContextManifestV2
  const allowedEvidence = new Set(manifest.v1.evidenceRefs.map((ref) => ref.trim()));
  const proposalRefs = proposal.evidenceRefs.map((ref) => ref.trim());

  if (proposalRefs.length === 0) {
    throw new Error('PROPOSAL_EVIDENCE_REFS_EMPTY');
  }

  const unauthorizedRef = proposalRefs.find((ref) => !allowedEvidence.has(ref));
  if (unauthorizedRef !== undefined) {
    throw new Error(`UNAUTHORIZED_EVIDENCE_REF:${unauthorizedRef}`);
  }

  if (new Set(proposalRefs).size !== proposalRefs.length) {
    throw new Error('DUPLICATE_PROPOSAL_EVIDENCE_REF');
  }

  const sourceRevisionSet = manifest.identityInput.evidenceRevisions.sourceRevision;
  if (!sourceRevisionSet) {
    throw new Error('MANIFEST_SOURCE_REVISION_MISSING');
  }

  const evidenceBindings = proposalRefs.map((ref) => {
    const parsedBinding = EvidenceBindingSchema.safeParse(input.evidenceBindings[ref]);
    if (!parsedBinding.success) {
      throw new Error(`EVIDENCE_BINDING_MISSING:${ref}`);
    }
    const binding = parsedBinding.data;
    if (!binding.sourceRef.trim() || !binding.packetKey.trim()) {
      throw new Error(`EVIDENCE_IDENTITY_MISSING:${ref}`);
    }
    if (sha(binding.content) !== binding.contentChecksum) {
      throw new Error(`EVIDENCE_CONTENT_CHECKSUM_MISMATCH:${ref}`);
    }
    return { ref, ...binding };
  });

  const observedSourceRevisions = [...new Set(evidenceBindings.map((binding) => binding.sourceRevision))].sort((a, b) => a.localeCompare(b, 'en'));
  const exactRevisionSet = canonicalSha256V1({ schema: 'atlas.ace-context-source-revision-set.v1', revisions: observedSourceRevisions });
  if (sourceRevisionSet !== exactRevisionSet && !(observedSourceRevisions.length === 1 && sourceRevisionSet === observedSourceRevisions[0])) {
    const mismatchedBinding = evidenceBindings.find((binding) => binding.sourceRevision !== sourceRevisionSet);
    if (mismatchedBinding) throw new Error(`EVIDENCE_SOURCE_REVISION_MISMATCH:${mismatchedBinding.ref}`);
    throw new Error('EVIDENCE_SOURCE_REVISION_SET_MISMATCH');
  }

  // 3. Render into buildAceContextPacketV1 rawEvidence (sanitized via NES-LUT)
  const patchInstruction = proposal.patchPlan;

  const diagnosis = proposal.diagnosis ?? '';
  const validation = proposal.validationPlan ?? '';
  const targets = (proposal.targetCandidates ?? []).join(', ');

  const rawEvidence = [
    `[ACE_PROPOSAL_BEGIN]`,
    diagnosis ? `DIAGNOSIS: ${diagnosis}` : null,
    targets ? `TARGETS: ${targets}` : null,
    patchInstruction ? `INSTRUCTION: ${patchInstruction}` : null,
    validation ? `VALIDATION: ${validation}` : null,
    `EVIDENCE_REFS: ${proposalRefs.join(', ')}`,
    `[ACE_PROPOSAL_END]`,
  ]
    .filter(Boolean)
    .join('\n');

  const primarySourceRef = evidenceBindings[0].sourceRef;

  const sanitizedRunId = input.runId.replace(/[^a-zA-Z0-9_-]/g, '_');

  const aceContextPacket = buildAceContextPacketV1({
    runId: sanitizedRunId,
    sourceRef: primarySourceRef,
    conceptId: 'concept:advisory-repair-proposal',
    confidenceScore: 0,
    rawEvidence,
  });

  // 4. Render into existing ContextManifestV2 -> PromptPlanV1 path (AFC-04B)
  // Segments must have contiguous 0-indexed ordinals
  const rawSegments: Array<Omit<PromptPlanSegmentV1, 'ordinal'>> = [];

  const pushSegment = (
    kind: PromptPlanSegmentV1['kind'],
    text: string,
    packetKey: string | null,
    evidenceRefs: readonly string[]
  ) => {
    if (!text.trim()) {
      throw new Error(`PROMPT_PLAN_SEGMENT_EMPTY:${kind}`);
    }
    const tokenCount = input.tokenizer.countTokens(text);
    if (!Number.isInteger(tokenCount) || tokenCount < 0) {
      throw new Error('PROMPT_PLAN_TOKEN_COUNT_INVALID');
    }
    rawSegments.push({
      kind,
      packetKey,
      evidenceRefs: [...evidenceRefs],
      contentChecksum: sha(text),
      tokenCount,
    });
  };

  // SYSTEM segment
  const systemText = input.systemPolicyText?.trim() || 'You are an advisory legal-AI code repair assistant.';
  pushSegment('SYSTEM', systemText, null, []);

  // INSTRUCTION segment (from validated proposal)
  const instructionText = patchInstruction.trim() || 'Analyze the admitted evidence and proposal.';
  pushSegment('INSTRUCTION', instructionText, null, []);

  // Optional TOOL_SCHEMA segment
  if (input.toolSchemaText?.trim()) {
    pushSegment('TOOL_SCHEMA', input.toolSchemaText.trim(), null, []);
  }

  // EVIDENCE segments from the proposal and manifest
  for (const binding of evidenceBindings) {
    pushSegment('EVIDENCE', binding.content, binding.packetKey, [binding.ref]);
  }

  // USER_QUERY segment
  const queryText = manifest.v1.query?.trim() || 'Evaluate codebase repair proposal';
  pushSegment('USER_QUERY', queryText, null, []);

  // Map to 0-indexed ordinals
  const segments: PromptPlanSegmentV1[] = rawSegments.map((seg, ordinal) => ({
    ordinal,
    ...seg,
  }));

  const promptPlan = buildPromptPlanV1({
    requestId: manifest.v1.requestId,
    contextManifestChecksum: manifest.identityChecksum,
    tokenizerRevision: input.tokenizer.revision,
    promptTemplateRevision: input.promptTemplateRevision,
    instructionRevision: input.instructionRevision,
    segments,
    contextLimitTokens: input.contextLimitTokens ?? LLAMA_SERVER_CONTEXT_LIMIT_TOKENS,
    reservedOutputTokens: input.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS,
    maxInputTokens: input.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
  });

  return {
    aceContextPacket,
    promptPlan,
    canonicalAuthority: false,
    writesPerformed: false,
    hiddenThoughtsPersisted: false,
    kvCachePersisted: false,
  };
}
