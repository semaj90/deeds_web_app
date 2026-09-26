import { createHash } from 'node:crypto';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { buildPromptPlanV1, type PromptPlanSegmentV1, type PromptPlanV1 } from '../prefill/prompt-plan-v1.js';
import type { AcePacketV3ContextManifestBridgeResultV1 } from './ace-packet-v3-context-manifest-bridge-v1.js';

/**
 * ACE3-07A: pure ContextManifestV2 (+ ACE3-06A receipt) -> PromptPlanV1 with a deterministic stable-prefix identity.
 * No I/O, no model call. Token counts come from a caller-supplied tokenizer whose revision is recorded; nothing is
 * estimated here. Segment text is hashed, never stored. The stable prefix = every segment except USER_QUERY, so an
 * identical prefix can be recognised for KV reuse while a different query only changes the tail.
 */
export interface PromptPlanTextSegmentV1 { text: string; }
export interface PromptPlanEvidenceInputV1 { candidateOrdinal: number; packetKey: string; evidenceRefs: readonly string[]; text: string; }

export interface AceContextPromptPlanBridgeInputV1 {
  bridge: AcePacketV3ContextManifestBridgeResultV1;
  requestId: string;
  system: PromptPlanTextSegmentV1;
  instruction: PromptPlanTextSegmentV1;
  toolSchema?: PromptPlanTextSegmentV1 | null;
  /** exactly one per selected ordinal */
  evidence: readonly PromptPlanEvidenceInputV1[];
  userQuery: PromptPlanTextSegmentV1;
  tokenizer: { revision: string; countTokens: (text: string) => number };
  promptTemplateRevision: string;
  instructionRevision: string;
  contextLimitTokens?: number;
  reservedOutputTokens?: number;
  maxInputTokens?: number;
}

export interface AceContextPromptPlanBridgeResultV1 {
  plan: PromptPlanV1;
  prefix: {
    stablePrefixChecksum: string;
    stablePrefixSegmentCount: number;
    stablePrefixTokens: number;
    selectedPacketSetChecksum: string;
    contextManifestIdentityChecksum: string;
  };
  canonicalAuthority: false;
  writesPerformed: false;
  modelCalled: false;
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function bridgeContextManifestToPromptPlanV1(input: AceContextPromptPlanBridgeInputV1): AceContextPromptPlanBridgeResultV1 {
  const { receipt, admission } = input.bridge;
  const manifest = admission.manifest;
  if (receipt.contextManifestIdentityChecksum !== manifest.identityChecksum) throw new Error('PROMPT_PLAN_BRIDGE_RECEIPT_MANIFEST_MISMATCH');
  const declared = manifest.identityInput.evidenceRevisions.promptTemplateRevision;
  if (declared !== null && declared !== undefined && declared !== input.promptTemplateRevision) throw new Error('PROMPT_PLAN_BRIDGE_PROMPT_TEMPLATE_REVISION_MISMATCH');

  const ordinals = input.evidence.map((e) => e.candidateOrdinal);
  if (new Set(ordinals).size !== ordinals.length) throw new Error('PROMPT_PLAN_BRIDGE_DUPLICATE_EVIDENCE_ORDINAL');
  const sorted = [...input.evidence].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  if (JSON.stringify(sorted.map((e) => e.candidateOrdinal)) !== JSON.stringify(receipt.selectedOrdinals)) throw new Error('PROMPT_PLAN_BRIDGE_EVIDENCE_ORDINALS_MISMATCH');
  for (const text of [input.system.text, input.instruction.text, input.userQuery.text, ...sorted.map((e) => e.text)]) {
    if (!text.trim()) throw new Error('PROMPT_PLAN_BRIDGE_EMPTY_SEGMENT');
  }

  const raw: Array<Omit<PromptPlanSegmentV1, 'ordinal'> & { text: string }> = [];
  const push = (kind: PromptPlanSegmentV1['kind'], text: string, packetKey: string | null, evidenceRefs: readonly string[]) => {
    const tokenCount = input.tokenizer.countTokens(text);
    if (!Number.isInteger(tokenCount) || tokenCount < 0) throw new Error('PROMPT_PLAN_BRIDGE_TOKEN_COUNT_INVALID');
    raw.push({ kind, packetKey, evidenceRefs: [...evidenceRefs], contentChecksum: sha(text), tokenCount, text });
  };
  push('SYSTEM', input.system.text, null, []);
  push('INSTRUCTION', input.instruction.text, null, []);
  if (input.toolSchema) push('TOOL_SCHEMA', input.toolSchema.text, null, []);
  for (const e of sorted) push('EVIDENCE', e.text, e.packetKey, e.evidenceRefs);
  push('USER_QUERY', input.userQuery.text, null, []);

  const segments: PromptPlanSegmentV1[] = raw.map(({ text: _t, ...rest }, ordinal) => ({ ordinal, ...rest }));
  const plan = buildPromptPlanV1({
    requestId: input.requestId,
    contextManifestChecksum: manifest.identityChecksum,
    tokenizerRevision: input.tokenizer.revision,
    promptTemplateRevision: input.promptTemplateRevision,
    instructionRevision: input.instructionRevision,
    segments,
    contextLimitTokens: input.contextLimitTokens,
    reservedOutputTokens: input.reservedOutputTokens,
    maxInputTokens: input.maxInputTokens,
  });

  const prefixSegments = plan.segments.filter((s) => s.kind !== 'USER_QUERY');
  const stablePrefixChecksum = canonicalSha256V1({
    schema: 'atlas.prompt-stable-prefix.v1',
    contextManifestChecksum: plan.contextManifestChecksum,
    selectedPacketSetChecksum: receipt.selectedPacketSetChecksum,
    tokenizerRevision: plan.tokenizerRevision,
    promptTemplateRevision: plan.promptTemplateRevision,
    instructionRevision: plan.instructionRevision,
    segments: prefixSegments.map((s) => ({ kind: s.kind, packetKey: s.packetKey, contentChecksum: s.contentChecksum, tokenCount: s.tokenCount })),
  });
  return {
    plan,
    prefix: {
      stablePrefixChecksum,
      stablePrefixSegmentCount: prefixSegments.length,
      stablePrefixTokens: prefixSegments.reduce((n, s) => n + s.tokenCount, 0),
      selectedPacketSetChecksum: receipt.selectedPacketSetChecksum,
      contextManifestIdentityChecksum: manifest.identityChecksum,
    },
    canonicalAuthority: false,
    writesPerformed: false,
    modelCalled: false,
  };
}
