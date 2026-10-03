import { createHash } from 'node:crypto';
import { z } from 'zod';
import { compareUtf8 } from '../features/canonical-candidate-v1.js';
import { researchEvidenceV1Schema } from './research-evidence-v1.js';

/**
 * ResearchEvidenceBundleV1 — a sealed, read-only set of ResearchEvidenceV1 items produced for ONE request against ONE workspace
 * revision. It is an input to admission gates, never an admission: no writes, no canonical authority.
 *
 * Workspace binding is bundle-level by construction (a single `workspaceRevision`), so a bundle cannot mix workspaces, and the bundle
 * never rewrites or "repairs" an item's own lineage (sourceRevision stays exactly as the evidence carried it). ResearchEvidenceV1 has no
 * per-item workspace field; a per-item check would require adding one to that already-proven contract.
 *
 * Checksums (all sha256 over canonical JSON: sorted keys, compact):
 *   itemChecksum        = sha256(item)
 *   evidenceSetChecksum = sha256([{evidenceId, itemChecksum}...] sorted by evidenceId in UTF-8 byte order) — order-independent identity of the evidence
 *   bundleChecksum      = sha256(whole bundle minus bundleChecksum, evidence sorted the same way) — any field change changes it
 * All three are implemented independently in Pydantic; parity is proven by fixtures.
 * Known limit: confidence values that JS/Python print with exponent notation (e.g. 1e-7) are not covered by the cross-language proof.
 */
export const RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1 = 'atlas.research-evidence-bundle.v1' as const;

const SHA256 = /^sha256:[0-9a-f]{64}$/;

const canonicalJson = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonicalJson).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const byId = (a: { evidenceId: string }, b: { evidenceId: string }) => compareUtf8(a.evidenceId, b.evidenceId);

type EvidenceLike = { evidenceId: string } & Record<string, unknown>;

export function researchEvidenceItemChecksumV1(item: EvidenceLike): string {
  return sha(canonicalJson(item));
}

export function researchEvidenceSetChecksumV1(evidence: ReadonlyArray<EvidenceLike>): string {
  const identities = [...evidence].sort(byId).map((e) => ({ evidenceId: e.evidenceId, itemChecksum: researchEvidenceItemChecksumV1(e) }));
  return sha(canonicalJson(identities));
}

type BundleBody = { evidence: ReadonlyArray<EvidenceLike> } & Record<string, unknown>;

export function researchEvidenceBundleChecksumV1(bundle: BundleBody): string {
  const { bundleChecksum: _omit, ...body } = bundle as BundleBody & { bundleChecksum?: unknown };
  return sha(canonicalJson({ ...body, evidence: [...bundle.evidence].sort(byId) }));
}

export const researchEvidenceBundleV1Schema = z.object({
  schema: z.literal(RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1),
  requestId: z.string().min(1),
  workspaceRevision: z.string().regex(SHA256),
  evidence: z.array(researchEvidenceV1Schema).min(1),
  producerRevision: z.string().min(1),
  evidenceSetChecksum: z.string().regex(SHA256),
  bundleChecksum: z.string().regex(SHA256),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((b, ctx) => {
  if (new Set(b.evidence.map((e) => e.evidenceId)).size !== b.evidence.length) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'DUPLICATE_EVIDENCE_ID' });
  }
  if (researchEvidenceSetChecksumV1(b.evidence) !== b.evidenceSetChecksum) {
    ctx.addIssue({ code: 'custom', path: ['evidenceSetChecksum'], message: 'EVIDENCE_SET_CHECKSUM_MISMATCH' });
  }
  if (researchEvidenceBundleChecksumV1(b) !== b.bundleChecksum) {
    ctx.addIssue({ code: 'custom', path: ['bundleChecksum'], message: 'BUNDLE_CHECKSUM_MISMATCH' });
  }
});
export type ResearchEvidenceBundleV1 = z.infer<typeof researchEvidenceBundleV1Schema>;

/** Seals a bundle: computes evidenceSetChecksum, then bundleChecksum from everything else. */
export function buildResearchEvidenceBundleV1(
  input: Omit<ResearchEvidenceBundleV1, 'schema' | 'evidenceSetChecksum' | 'bundleChecksum' | 'writesPerformed' | 'canonicalAuthority'>,
): ResearchEvidenceBundleV1 {
  const body = {
    schema: RESEARCH_EVIDENCE_BUNDLE_SCHEMA_V1, ...input, evidenceSetChecksum: researchEvidenceSetChecksumV1(input.evidence as never),
    writesPerformed: false as const, canonicalAuthority: false as const,
  };
  return researchEvidenceBundleV1Schema.parse({ ...body, bundleChecksum: researchEvidenceBundleChecksumV1(body as never) });
}

export function researchEvidenceBundleV1JsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(researchEvidenceBundleV1Schema) as Record<string, unknown>;
}
