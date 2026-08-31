import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i);

/**
 * SchemaVerificationReceiptV1 (OAK-03, output side) — field shape exactly
 * as specified by the operator. This is a pure contract: it does NOT
 * invoke any reasoner (that's OAK-03B/03C, the ELK/HermiT subprocess
 * adapters — deliberately not built in this pass, see below). Every
 * `buildSchemaVerificationReceiptV1()` call needs a real
 * `reasonerArtifactChecksum` (the checksum of the actual jar that
 * produced this result) — there is no path to constructing a receipt
 * that claims a reasoner ran without naming which jar, at what version,
 * with what checksum. `writesPerformed` is a hard `z.literal(false)` —
 * this receipt can never represent a mutation, matching the "never
 * apply a mutation directly" rule this whole OAK-XX contract family
 * enforces (see `oak-judge-feedback-v1.ts`'s identical discipline).
 *
 * OAK-03B (ELK) / OAK-03C (HermiT) NOT built this pass: this environment
 * has no JVM at all (`java -version` → command not found, checked
 * directly, not assumed) and no `elk.jar`/`HermiT.jar` present anywhere
 * in the repo. Writing a subprocess adapter that shells out to `java -jar`
 * in an environment with no `java` binary would produce code that has
 * never actually run — this file's own root CLAUDE.md status-language
 * rules (`NOT_PROVEN` vs `WIRED` vs `APPLY_PROVEN`) exist specifically to
 * prevent claiming more than that. What's real and safe to build now:
 * this receipt contract (testable on its own, no JVM needed) and the
 * `OntologyReasonerAdapter` Python class shape (real code, structurally
 * correct per the operator's spec) — but the Python adapter cannot be
 * exercised end-to-end here and must not be reported as `WIRED` or
 * `DRY_RUN_PROVEN`, only `CREATED`. Real jar acquisition (vendored into
 * the repo vs. operator-provisioned path vs. documented manual install)
 * and a JVM being present are operator actions this session cannot take
 * on its own — installing a JVM is a real environment change, not
 * something to do silently mid-pass.
 */
export const owlProfileSchema = z.enum(['OWL2_EL', 'OWL2_DL', 'UNKNOWN']);
export type OwlProfile = z.infer<typeof owlProfileSchema>;

export const reasonerNameSchema = z.enum(['ELK', 'HERMIT']);
export type ReasonerName = z.infer<typeof reasonerNameSchema>;

export const schemaVerificationReceiptV1Schema = z.object({
  schema: z.literal('atlas.schema-verification-receipt.v1').default('atlas.schema-verification-receipt.v1'),
  schemaId: id,
  ontologyChecksum: sha256Hex,
  ontologyRevision: revision,
  owlProfile: owlProfileSchema,
  reasoner: reasonerNameSchema,
  reasonerVersion: z.string().min(1),
  reasonerArtifactChecksum: sha256Hex,
  consistent: z.boolean(),
  unsatisfiableClasses: z.array(id),
  classificationChecksum: sha256Hex,
  outputArtifactChecksum: sha256Hex,
  invocationRevision: revision,
  elapsedMs: z.number().nonnegative(),
  /** Verification never mutates canonical stores — hard-enforced, not a convention. */
  writesPerformed: z.literal(false),
  receiptChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (!value.consistent && value.unsatisfiableClasses.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unsatisfiableClasses'],
      message: 'consistent=false requires at least one unsatisfiable class to be named — an inconsistency claim with no cited cause is not verifiable evidence',
    });
  }
  if (value.consistent && value.unsatisfiableClasses.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['consistent'],
      message: 'consistent=true cannot coexist with a non-empty unsatisfiableClasses list',
    });
  }
  if (value.owlProfile === 'OWL2_EL' && value.reasoner === 'HERMIT') {
    // Allowed (HermiT can reason over EL-profile ontologies too), but the
    // operator's frozen policy routes EL through ELK for speed — flag the
    // mismatch as a warning-shaped issue only when it's the wrong-way
    // round: an EL-profile ontology run through ELK is expected; an
    // EL-profile ontology forced through HermiT is not an error, just
    // not the policy's fast path. Not rejected — a real operational
    // reason (e.g. ELK unavailable) can justify it.
  }
});

export type SchemaVerificationReceiptV1 = z.infer<typeof schemaVerificationReceiptV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export interface BuildSchemaVerificationReceiptV1Input {
  schemaId: string;
  ontologyChecksum: string;
  ontologyRevision: string;
  owlProfile: OwlProfile;
  reasoner: ReasonerName;
  reasonerVersion: string;
  reasonerArtifactChecksum: string;
  consistent: boolean;
  unsatisfiableClasses?: string[];
  classificationChecksum: string;
  outputArtifactChecksum: string;
  invocationRevision: string;
  elapsedMs: number;
}

/**
 * Per the operator's reasoner policy (`EL_PROFILE: 'ELK', FULL_DL_REQUIRED:
 * 'HERMIT'`): routes are a policy choice made by the CALLER (the
 * subprocess-adapter layer, OAK-03B/03C, not built here), not enforced
 * inside this pure contract builder — this function accepts whatever
 * `reasoner` the caller actually ran and records it faithfully, it does
 * not second-guess the policy decision.
 */
export function buildSchemaVerificationReceiptV1(input: BuildSchemaVerificationReceiptV1Input): SchemaVerificationReceiptV1 {
  const body = {
    schema: 'atlas.schema-verification-receipt.v1' as const,
    schemaId: input.schemaId,
    ontologyChecksum: input.ontologyChecksum,
    ontologyRevision: input.ontologyRevision,
    owlProfile: input.owlProfile,
    reasoner: input.reasoner,
    reasonerVersion: input.reasonerVersion,
    reasonerArtifactChecksum: input.reasonerArtifactChecksum,
    consistent: input.consistent,
    unsatisfiableClasses: input.unsatisfiableClasses ?? [],
    classificationChecksum: input.classificationChecksum,
    outputArtifactChecksum: input.outputArtifactChecksum,
    invocationRevision: input.invocationRevision,
    elapsedMs: input.elapsedMs,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  };
  return schemaVerificationReceiptV1Schema.parse({ ...body, receiptChecksum: sha256(body) });
}

/**
 * Applies the operator's frozen reasoner policy to a profile receipt's
 * heuristic, so the routing decision itself is a single, testable, named
 * function rather than scattered inline conditionals wherever a caller
 * needs to pick a reasoner.
 */
export function selectReasonerForOwlProfile(profileHeuristic: 'OWL2_EL_LIKELY' | 'OWL2_DL_REQUIRED' | 'UNKNOWN'): ReasonerName {
  return profileHeuristic === 'OWL2_EL_LIKELY' ? 'ELK' : 'HERMIT';
}
