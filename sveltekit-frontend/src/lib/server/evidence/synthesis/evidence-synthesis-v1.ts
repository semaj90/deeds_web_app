import { createHash } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { ATLAS_ROOT_NAMESPACE_V1 } from '../../atlas/identity/atlas-uuid-namespaces-v1.js';
import {
  requestLangExtractDocumentationFacts,
  requestOaklibLabelSearch,
  type LangExtractDocumentationFactsResponse,
} from '../../atlas/ai/langextract-transport.js';
import { mapLangExtractFactToEvidenceClaimV1, type EvidenceClaimV1 } from './evidence-claim-v1.js';
import { rankEvidenceNextStepsV1, type EvidenceNextStepV1 } from '../../analysis/evidence-next-step-ranker-v1.js';
import {
  summarizeGroundedEvidenceClaimsV1,
  type EvidenceClaimSummaryV1,
} from './evidence-claim-summary-v1.js';
import { proposeEvidenceTaxonomyV1, type EvidenceTaxonomyProposalV1 } from './evidence-taxonomy-proposal-v1.js';
import { proposeEvidenceTimelineV1, type EvidenceTimelineProposalV1 } from './evidence-timeline-proposal-v1.js';

const EVIDENCE_CLAIM_NAMESPACE_V1 = uuidv5('atlas.evidence-claim.v1', ATLAS_ROOT_NAMESPACE_V1);
const MAX_EXTRACTED_TEXT_CHARS = 50_000;
const MAX_CLAIMS = 16;

const inputSchema = z.object({
  evidenceId: z.string().uuid(),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  extractedText: z.string().max(5_000_000),
  caseId: z.string().uuid().nullable(),
  enabled: z.boolean(),
}).strict();

export type EvidenceSynthesisResultV1 = {
  schema: 'atlas.evidence-synthesis.v1';
  status: 'INVALID_INPUT' | 'DISABLED' | 'BLOCKED_SOURCE_BYTES_MISSING' | 'BLOCKED_SOURCE_REVISION_MISMATCH' | 'BLOCKED_EMPTY_TEXT' | 'UNAVAILABLE' | 'EMPTY' | 'SOURCE_GROUNDED' | 'PARTIAL';
  verificationOutcome: 'BLOCKED' | 'UNVERIFIED' | 'CONFLICTED' | 'PROPOSED';
  reasonCodes: EvidenceSynthesisReasonCodeV1[];
  sourceId: string;
  sourceRevision: string;
  textSourceSha256: string | null;
  provider: string | null;
  producerRevision: string | null;
  modelId: string | null;
  outputSha256: string | null;
  claims: EvidenceClaimV1[];
  nextSteps: EvidenceNextStepV1[];
  summary: EvidenceClaimSummaryV1;
  taxonomyProposal: EvidenceTaxonomyProposalV1;
  timelineProposal: EvidenceTimelineProposalV1;
  rejectedFactCount: number;
  textTruncated: boolean;
  canonicalAuthority: false;
  summaryStatus: EvidenceClaimSummaryV1['status'];
  errorCode?: 'LANGEXTRACT_REQUEST_FAILED';
};

export type EvidenceSynthesisReasonCodeV1 =
  | 'SYNTHESIS_INPUT_INVALID'
  | 'SYNTHESIS_DISABLED'
  | 'SOURCE_BYTES_MISSING'
  | 'SOURCE_REVISION_MISMATCH'
  | 'EXTRACTED_TEXT_EMPTY'
  | 'LANGEXTRACT_UNAVAILABLE'
  | 'LANGEXTRACT_RETURNED_NO_FACTS'
  | 'LANGEXTRACT_FACT_SPAN_REJECTED'
  | 'LANGEXTRACT_FACT_LIMIT_EXCEEDED'
  | 'EXTRACTED_TEXT_TRUNCATED'
  | 'SUMMARY_MODEL_UNAVAILABLE'
  | 'SUMMARY_OUTPUT_INVALID'
  | 'CONTRADICTING_CLAIM_LINKS_PRESENT';

type FactsRequest = typeof requestLangExtractDocumentationFacts;
type OaklibSearch = typeof requestOaklibLabelSearch;

export async function synthesizeEvidenceClaimsV1(
  input: unknown,
  originalSourceBytes: Uint8Array | undefined,
  request: FactsRequest = requestLangExtractDocumentationFacts,
  summarize: typeof summarizeGroundedEvidenceClaimsV1 = summarizeGroundedEvidenceClaimsV1,
  searchOaklib: OaklibSearch = requestOaklibLabelSearch,
): Promise<EvidenceSynthesisResultV1> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return emptyResult('INVALID_INPUT', 'unknown', '', 'BLOCKED', ['SYNTHESIS_INPUT_INVALID']);
  }
  const value = parsed.data;
  if (!value.enabled) return emptyResult('DISABLED', value.evidenceId, value.sourceRevision, 'BLOCKED', ['SYNTHESIS_DISABLED']);
  if (!originalSourceBytes?.byteLength) return emptyResult('BLOCKED_SOURCE_BYTES_MISSING', value.evidenceId, value.sourceRevision, 'BLOCKED', ['SOURCE_BYTES_MISSING']);

  const originalDigest = createHash('sha256').update(originalSourceBytes).digest('hex');
  if (value.sourceRevision !== `sha256:${originalDigest}`) {
    return emptyResult('BLOCKED_SOURCE_REVISION_MISMATCH', value.evidenceId, value.sourceRevision, 'BLOCKED', ['SOURCE_REVISION_MISMATCH']);
  }
  if (!value.extractedText.trim()) return emptyResult('BLOCKED_EMPTY_TEXT', value.evidenceId, value.sourceRevision, 'BLOCKED', ['EXTRACTED_TEXT_EMPTY']);

  const textTruncated = value.extractedText.length > MAX_EXTRACTED_TEXT_CHARS;
  const spanSourceBytes = Buffer.from(value.extractedText.slice(0, MAX_EXTRACTED_TEXT_CHARS), 'utf8');
  const textSourceSha256 = createHash('sha256').update(spanSourceBytes).digest('hex');
  const sourceUrl = `evidence://${value.evidenceId}`;

  let facts: LangExtractDocumentationFactsResponse;
  try {
    facts = await request({
      text: spanSourceBytes.toString('utf8'),
      sourceUrl,
      sourceRevision: `sha256:${textSourceSha256}`,
      productVersion: 'atlas-evidence-synthesis-v1',
    }, { timeoutMs: 30_000 });
  } catch {
    return {
      ...emptyResult('UNAVAILABLE', value.evidenceId, value.sourceRevision, 'UNVERIFIED', ['LANGEXTRACT_UNAVAILABLE']),
      textSourceSha256,
      nextSteps: rankEvidenceNextStepsV1({ currentState: 'DIAGNOSE', extractedFactCount: 0 }),
      errorCode: 'LANGEXTRACT_REQUEST_FAILED',
      textTruncated,
    };
  }

  let rejectedFactCount = Math.max(0, facts.facts.length - MAX_CLAIMS);
  const claims: EvidenceClaimV1[] = [];
  for (const [index, fact] of facts.facts.slice(0, MAX_CLAIMS).entries()) {
    try {
      claims.push(mapLangExtractFactToEvidenceClaimV1({
        fact,
        claimId: uuidv5(
          [value.evidenceId, value.sourceRevision, textSourceSha256, fact.startChar, fact.endChar, fact.predicate, index].join('\u0000'),
          EVIDENCE_CLAIM_NAMESPACE_V1,
        ),
        sourceId: value.evidenceId,
        sourceUrl,
        sourceRevision: value.sourceRevision,
        workspaceRevision: null,
        caseId: value.caseId,
        sourceBytes: originalSourceBytes,
        spanSourceBytes,
        provenance: {
          provider: facts.provider,
          producerRevision: facts.producerRevision,
          modelId: facts.modelId ?? null,
          outputHash: facts.outputHash,
        },
      }));
    } catch {
      rejectedFactCount += 1;
    }
  }

  const summary = claims.length > 0
    ? await summarize({ claims })
    : { status: 'NOT_REQUESTED' as const, text: null, supportingClaimIds: [], provider: null, modelId: null, modelSelectionChecksum: null };
  const reasonCodes: EvidenceSynthesisReasonCodeV1[] = [];
  if (claims.some((claim) => claim.verificationStatus === 'CONFLICTED' || claim.contradictingClaimIds.length > 0)) {
    reasonCodes.push('CONTRADICTING_CLAIM_LINKS_PRESENT');
  }
  if (rejectedFactCount > 0) {
    reasonCodes.push(facts.facts.length > MAX_CLAIMS ? 'LANGEXTRACT_FACT_LIMIT_EXCEEDED' : 'LANGEXTRACT_FACT_SPAN_REJECTED');
  }
  if (textTruncated) reasonCodes.push('EXTRACTED_TEXT_TRUNCATED');
  if (claims.length === 0) reasonCodes.push('LANGEXTRACT_RETURNED_NO_FACTS');
  if (summary.status === 'UNAVAILABLE') reasonCodes.push('SUMMARY_MODEL_UNAVAILABLE');
  if (summary.status === 'INVALID_OUTPUT') reasonCodes.push('SUMMARY_OUTPUT_INVALID');
  const verificationOutcome = reasonCodes.includes('CONTRADICTING_CLAIM_LINKS_PRESENT')
    ? 'CONFLICTED'
    : reasonCodes.length > 0
      ? 'UNVERIFIED'
      : 'PROPOSED';
  const taxonomyDraft = proposeEvidenceTaxonomyV1({ claims });
  const oakTerms = [...new Set(taxonomyDraft.mappings
    .map((mapping) => mapping.candidateDomainLabel)
    .filter((label): label is string => Boolean(label)))].slice(0, 16);
  let taxonomyProposal = taxonomyDraft;
  if (oakTerms.length > 0) {
    try {
      const oaklibResponse = await searchOaklib({ terms: oakTerms }, { timeoutMs: 3_000 });
      taxonomyProposal = proposeEvidenceTaxonomyV1({
        claims,
        registryStatus: 'NOT_CHECKED',
        oaklib: { status: 'RESPONSE', response: oaklibResponse },
      });
    } catch {
      taxonomyProposal = proposeEvidenceTaxonomyV1({
        claims,
        registryStatus: 'NOT_CHECKED',
        oaklib: { status: 'UNAVAILABLE' },
      });
    }
  }

  return {
    schema: 'atlas.evidence-synthesis.v1',
    status: rejectedFactCount > 0 ? 'PARTIAL' : claims.length > 0 ? 'SOURCE_GROUNDED' : 'EMPTY',
    verificationOutcome,
    reasonCodes,
    sourceId: value.evidenceId,
    sourceRevision: value.sourceRevision,
    textSourceSha256,
    provider: facts.provider,
    producerRevision: facts.producerRevision,
    modelId: facts.modelId ?? null,
    outputSha256: facts.outputHash,
    claims,
    nextSteps: rankEvidenceNextStepsV1({ currentState: 'DIAGNOSE', extractedFactCount: claims.length }),
    summary,
    taxonomyProposal,
    timelineProposal: proposeEvidenceTimelineV1({ claims }),
    rejectedFactCount,
    textTruncated,
    canonicalAuthority: false,
    summaryStatus: summary.status,
  };
}

function emptyResult(
  status: EvidenceSynthesisResultV1['status'],
  sourceId: string,
  sourceRevision: string,
  verificationOutcome: EvidenceSynthesisResultV1['verificationOutcome'] = 'UNVERIFIED',
  reasonCodes: EvidenceSynthesisReasonCodeV1[] = [],
): EvidenceSynthesisResultV1 {
  return {
    schema: 'atlas.evidence-synthesis.v1',
    status,
    verificationOutcome,
    reasonCodes,
    sourceId,
    sourceRevision,
    textSourceSha256: null,
    provider: null,
    producerRevision: null,
    modelId: null,
    outputSha256: null,
    claims: [],
    nextSteps: [],
    summary: { status: 'NOT_REQUESTED', text: null, supportingClaimIds: [], provider: null, modelId: null, modelSelectionChecksum: null },
    taxonomyProposal: proposeEvidenceTaxonomyV1({ claims: [] }),
    timelineProposal: proposeEvidenceTimelineV1({ claims: [] }),
    rejectedFactCount: 0,
    textTruncated: false,
    canonicalAuthority: false,
    summaryStatus: 'NOT_REQUESTED',
  };
}
