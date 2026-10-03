import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  buildContextPrefixIdentityV1,
  type ContextPrefixIdentityV1,
} from '../prefill/context-prefix-identity-v1.js';
import {
  buildPromptPlanV1,
  type PromptPlanSegmentV1,
  type PromptPlanV1,
} from '../prefill/prompt-plan-v1.js';
import {
  aceContextManifestAdmissionV1Schema,
  type AceContextManifestAdmissionV1,
} from './ace-context-manifest-admission-v1.js';

export interface BuildManifestBoundPromptPlanV1Input {
  admission: AceContextManifestAdmissionV1;
  tokenizerRevision: string;
  promptTemplateRevision: string;
  instructionRevision: string;
  modelRevision: string;
  adapterRevision: string | null;
  toolSchemaRevision: string;
  systemPolicyRevision: string;
  stablePrefix: string;
  segments: readonly PromptPlanSegmentV1[];
  contextLimitTokens?: number;
  reservedOutputTokens?: number;
  maxInputTokens?: number;
}

export interface ManifestBoundPromptPlanV1 {
  promptPlan: PromptPlanV1;
  contextPrefixIdentity: ContextPrefixIdentityV1;
  orderedEvidenceChecksum: string;
}

/**
 * Pure bridge from the existing admitted ContextManifestV2 owner into the
 * existing PromptPlan and stable-prefix identity owners. It does not retrieve,
 * call a model, persist prompt material, or write cache state.
 */
export function buildManifestBoundPromptPlanV1(
  input: BuildManifestBoundPromptPlanV1Input,
): ManifestBoundPromptPlanV1 {
  const admission = aceContextManifestAdmissionV1Schema.parse(input.admission);
  const manifest = admission.manifest;
  const evidenceSegments = input.segments.filter((segment) => segment.kind === 'EVIDENCE');
  if (evidenceSegments.length === 0) throw new Error('PROMPT_PLAN_EVIDENCE_SEGMENTS_REQUIRED');

  const orderedEvidenceRefs = input.segments
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .filter((segment) => segment.kind === 'EVIDENCE')
    .flatMap((segment) => segment.evidenceRefs);
  const uniqueEvidenceRefs = new Set(orderedEvidenceRefs);
  if (uniqueEvidenceRefs.size !== orderedEvidenceRefs.length) {
    throw new Error('PROMPT_PLAN_DUPLICATE_EVIDENCE_REF');
  }
  const manifestEvidenceRefs = manifest.v1.evidenceRefs;
  if (
    uniqueEvidenceRefs.size !== manifestEvidenceRefs.length
    || manifestEvidenceRefs.some((ref) => !uniqueEvidenceRefs.has(ref))
  ) {
    throw new Error('PROMPT_PLAN_EVIDENCE_SET_MISMATCH');
  }

  const promptPlan = buildPromptPlanV1({
    requestId: manifest.v1.requestId,
    contextManifestChecksum: manifest.identityChecksum,
    tokenizerRevision: input.tokenizerRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    instructionRevision: input.instructionRevision,
    segments: [...input.segments],
    contextLimitTokens: input.contextLimitTokens,
    reservedOutputTokens: input.reservedOutputTokens,
    maxInputTokens: input.maxInputTokens,
  });

  const orderedEvidenceChecksum = canonicalSha256V1({
    schema: 'atlas.prompt-plan-ordered-evidence.v1',
    contextManifestChecksum: manifest.identityChecksum,
    evidenceRefs: orderedEvidenceRefs,
  });
  const stableEvidenceRevision = canonicalSha256V1({
    schema: 'atlas.prompt-prefix-evidence-revision.v1',
    contextManifestChecksum: manifest.identityChecksum,
    promptPlanChecksum: promptPlan.checksumSha256,
    orderedEvidenceChecksum,
    tokenizerRevision: input.tokenizerRevision,
    adapterRevision: input.adapterRevision,
  });
  const contextPrefixIdentity = buildContextPrefixIdentityV1({
    modelRevision: input.modelRevision,
    templateRevision: input.promptTemplateRevision,
    toolSchemaRevision: input.toolSchemaRevision,
    systemPolicyRevision: input.systemPolicyRevision,
    stableEvidenceRevision,
    stablePrefix: input.stablePrefix,
  });

  return { promptPlan, contextPrefixIdentity, orderedEvidenceChecksum };
}
