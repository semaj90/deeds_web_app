/**
 * CodeEvidenceExtractionV1 — output contract for the code-domain grounded-extraction lane.
 *
 * Per `openspec/changes/parent-atlas-code-langextract-evidence-lane/design.md` section 3.1: this is
 * a distinct output contract from the existing legal-domain `LangExtractOutput`/`LegalEntity` types
 * in `src/lib/server/langextract/native.ts`. That extractor's entity-type union
 * (`citation|statute|case_name|court|monetary|date|person|organization`) has zero overlap with what
 * code candidates need (`symbols|apis|tests|constraints`, per `CandidateEvidenceCardV1`/`V2`) —
 * verified empirically in `parent-atlas-retrieval-staging-planes`'s EVIDENCE-CARD-01 finding (0
 * entities extracted from 4 real TypeScript candidates). This contract exists so a *future*
 * code-domain extractor implementation has a stable, byte-grounded output shape to conform to.
 *
 * Hard invariant: every `grounded[]` entry MUST resolve to exact source bytes within the bounded
 * candidate text it was extracted from, and MUST carry the same canonical identity/revision the
 * extraction request was made against. An extraction that can't cite exact bytes is rejected, not
 * defaulted to a synthetic span — mirrors `GroundedFactV1Schema`'s existing
 * `spanEnd > spanStart` enforcement in `candidate-evidence-card-v1.ts`.
 */

import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const CODE_EVIDENCE_GROUNDED_CLASS_VALUES = [
  'SYMBOL',
  'API',
  'CONSTRAINT',
  'INVARIANT',
  'FAILURE_MODE',
  'TEST',
  'REQUIREMENT',
  'DATA_FLOW',
  'OWNERSHIP',
] as const;

export const CodeEvidenceGroundedClassSchema = z.enum(CODE_EVIDENCE_GROUNDED_CLASS_VALUES);
export type CodeEvidenceGroundedClass = z.infer<typeof CodeEvidenceGroundedClassSchema>;

export const CodeEvidenceIdentityV1Schema = z.object({
  canonicalId: id,
  packetKey: id,
  symbolVersionId: z.string().min(1).optional(),
  workspaceRevision: revision,
  sourceRevision: revision,
}).strict();

export type CodeEvidenceIdentityV1 = z.infer<typeof CodeEvidenceIdentityV1Schema>;

/**
 * A single grounded extraction. `startByte`/`endByte` are offsets into the bounded candidate text
 * the extraction request carried — NOT into the whole source file. `exactText` MUST match that
 * candidate text at `[startByte, endByte)` verbatim; callers validating a real extraction result
 * against real source text should perform that round-trip check themselves (this schema enforces
 * only the structural invariant `endByte > startByte`, since it has no access to the source text at
 * parse time).
 */
export const CodeEvidenceGroundedEntryV1Schema = z.object({
  class: CodeEvidenceGroundedClassSchema,
  exactText: z.string().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  confidence: z.number().finite().min(0).max(1),
  attributes: z.record(z.string(), z.string()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.endByte <= value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be > startByte' });
  }
});

export type CodeEvidenceGroundedEntryV1 = z.infer<typeof CodeEvidenceGroundedEntryV1Schema>;

export const CodeEvidenceExtractionV1Schema = z.object({
  schema: z.literal('atlas.code-evidence-extraction.v1').default('atlas.code-evidence-extraction.v1'),
  identity: CodeEvidenceIdentityV1Schema,
  grounded: z.array(CodeEvidenceGroundedEntryV1Schema).default([]),
  structuralRefs: z.array(z.string()).default([]),
  ontologyRefs: z.array(z.string()).default([]),
  checksum: sha256Hex,
}).strict();

export type CodeEvidenceExtractionV1 = z.infer<typeof CodeEvidenceExtractionV1Schema>;

/**
 * Validates that every `grounded[]` entry's `exactText` actually appears at its claimed byte span
 * within `sourceText`, and that the extraction's identity matches the expected canonical identity.
 * This is the round-trip check the schema itself cannot perform at parse time (it has no access to
 * the original candidate text). Throws on the first violation found, naming the offending entry.
 */
export function assertCodeEvidenceExtractionGrounded(
  extraction: CodeEvidenceExtractionV1,
  sourceText: string,
  expected: { canonicalId: string; sourceRevision: string }
): void {
  if (extraction.identity.canonicalId !== expected.canonicalId) {
    throw new Error(
      `CodeEvidenceExtractionV1 identity mismatch: expected canonicalId=${expected.canonicalId}, ` +
        `got ${extraction.identity.canonicalId}`
    );
  }
  if (extraction.identity.sourceRevision !== expected.sourceRevision) {
    throw new Error(
      `CodeEvidenceExtractionV1 identity mismatch: expected sourceRevision=${expected.sourceRevision}, ` +
        `got ${extraction.identity.sourceRevision}`
    );
  }
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  extraction.grounded.forEach((entry, index) => {
    const slice = sourceBytes.subarray(entry.startByte, entry.endByte).toString('utf8');
    if (slice !== entry.exactText) {
      throw new Error(
        `CodeEvidenceExtractionV1.grounded[${index}] (${entry.class}) exactText does not match ` +
          `sourceText at [${entry.startByte}, ${entry.endByte}): expected ${JSON.stringify(entry.exactText)}, ` +
          `found ${JSON.stringify(slice)}`
      );
    }
  });
}
