import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HyperedgeV1Schema } from '../../graph/hyperedge-contract.js';
import { researchEvidenceV1Schema } from './research-evidence-v1.js';

/**
 * A read-only evidence envelope for an existing HyperedgeV1. It does not
 * create graph identity or promote the relation. Every edge evidence ref must
 * be explicitly bound to a ResearchEvidenceV1 record that cites the same ref.
 */
export const HYPEREDGE_EVIDENCE_SCHEMA_V1 = 'atlas.hyperedge-evidence.v1' as const;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const canonicalJson = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value as object).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const hyperedgeEvidenceBindingV1Schema = z.object({
  evidenceId: z.string().min(1),
  evidenceRef: z.string().min(1),
}).strict();
export type HyperEdgeEvidenceBindingV1 = z.infer<typeof hyperedgeEvidenceBindingV1Schema>;

export const hyperedgeEvidenceOriginBindingV1Schema = z.object({
  proposalChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  ontologyRevision: z.string().min(1).nullable(),
  graphRevision: z.string().min(1),
  proposalProducerRevision: z.string().min(1),
}).strict();

export const hyperEdgeEvidenceV1Schema = z.object({
  schema: z.literal(HYPEREDGE_EVIDENCE_SCHEMA_V1),
  hyperedge: HyperedgeV1Schema,
  evidence: z.array(researchEvidenceV1Schema).min(1),
  bindings: z.array(hyperedgeEvidenceBindingV1Schema).min(1),
  originBinding: hyperedgeEvidenceOriginBindingV1Schema.optional(),
  producerRevision: z.string().min(1),
  checksum: z.string().regex(SHA256),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((envelope, ctx) => {
  const evidenceById = new Map(envelope.evidence.map((item) => [item.evidenceId, item]));
  const boundRefs = new Set<string>();
  const boundIds = new Set<string>();
  for (const [index, binding] of envelope.bindings.entries()) {
    const item = evidenceById.get(binding.evidenceId);
    if (!item) ctx.addIssue({ code: 'custom', path: ['bindings', index, 'evidenceId'], message: 'UNKNOWN_EVIDENCE_ID' });
    else if (!item.evidenceRefs.includes(binding.evidenceRef)) {
      ctx.addIssue({ code: 'custom', path: ['bindings', index, 'evidenceRef'], message: 'EVIDENCE_REF_NOT_CITED_BY_ITEM' });
    }
    if (!envelope.hyperedge.evidenceRefs.includes(binding.evidenceRef)) {
      ctx.addIssue({ code: 'custom', path: ['bindings', index, 'evidenceRef'], message: 'EVIDENCE_REF_NOT_ON_HYPEREDGE' });
    }
    if (boundRefs.has(binding.evidenceRef)) {
      ctx.addIssue({ code: 'custom', path: ['bindings', index], message: 'DUPLICATE_EVIDENCE_REF_BINDING' });
    }
    boundRefs.add(binding.evidenceRef);
    boundIds.add(binding.evidenceId);
  }
  if (new Set(envelope.evidence.map((item) => item.evidenceId)).size !== envelope.evidence.length) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'DUPLICATE_EVIDENCE_ID' });
  }
  if (boundIds.size !== evidenceById.size) {
    ctx.addIssue({ code: 'custom', path: ['bindings'], message: 'UNBOUND_EVIDENCE_ITEM' });
  }
  const edgeRefs = new Set(envelope.hyperedge.evidenceRefs);
  if (edgeRefs.size !== envelope.hyperedge.evidenceRefs.length || edgeRefs.size !== boundRefs.size || [...edgeRefs].some((ref) => !boundRefs.has(ref))) {
    ctx.addIssue({ code: 'custom', path: ['bindings'], message: 'HYPEREDGE_EVIDENCE_REF_SET_MISMATCH' });
  }
  if (hyperEdgeEvidenceChecksumV1(envelope) !== envelope.checksum) {
    ctx.addIssue({ code: 'custom', path: ['checksum'], message: 'HYPEREDGE_EVIDENCE_CHECKSUM_MISMATCH' });
  }
  const origin = envelope.originBinding;
  if (origin) {
    if (envelope.hyperedge.workspaceRevision !== origin.workspaceRevision
      || envelope.hyperedge.graphRevision !== origin.graphRevision
      || envelope.hyperedge.sourceRevision !== origin.sourceRevision
      || envelope.hyperedge.producerRevision !== origin.proposalProducerRevision) {
      ctx.addIssue({ code: 'custom', path: ['originBinding'], message: 'ORIGIN_BINDING_REVISION_MISMATCH' });
    }
    if (!envelope.evidence.some((item) => item.sourceKind === 'CODE'
      && item.sourceRef === origin.sourceRef
      && item.sourceRevision === origin.sourceRevision)) {
      ctx.addIssue({ code: 'custom', path: ['originBinding'], message: 'ORIGIN_SOURCE_EVIDENCE_MISSING' });
    }
  }
});

export type HyperEdgeEvidenceV1 = z.infer<typeof hyperEdgeEvidenceV1Schema>;

export function hyperEdgeEvidenceChecksumV1(value: Omit<HyperEdgeEvidenceV1, 'checksum'> | HyperEdgeEvidenceV1): string {
  const { checksum: _checksum, ...body } = value as HyperEdgeEvidenceV1;
  return sha256(canonicalJson(body));
}

export function buildHyperEdgeEvidenceV1(
  input: Omit<HyperEdgeEvidenceV1, 'schema' | 'checksum' | 'writesPerformed' | 'canonicalAuthority'>,
): HyperEdgeEvidenceV1 {
  const body = {
    schema: HYPEREDGE_EVIDENCE_SCHEMA_V1,
    ...input,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  };
  return hyperEdgeEvidenceV1Schema.parse({ ...body, checksum: hyperEdgeEvidenceChecksumV1(body) });
}

export function hyperEdgeEvidenceV1JsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(hyperEdgeEvidenceV1Schema) as Record<string, unknown>;
}
