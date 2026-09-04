import { z } from 'zod';

/**
 * DOMAIN-CLASSIFIER-OWNER-01 (parent-atlas-retrieval-lineage-dag-convergence).
 *
 * Live audit (2026-09-04) found this repo's domain classification already correctly composed as
 * ONE deterministic owner plus additive learned executors, not four independent authorities --
 * the target state this gate exists to establish was already substantially true in code, just not
 * yet formalized as one shared output contract:
 *
 *   - RULES (canonical owner of `primary_domain`/`confidence`): `classifyDomainTaxonomy()` in
 *     `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts` -- deterministic, keyword/evidence
 *     weighted over 9 canonical domains, 8 real live callers per
 *     `domain-taxonomy-ml-bridge.ts`'s own doc comment.
 *   - NAIVE_BAYES / LOGISTIC_REGRESSION (additive learned executors, never override the rules
 *     verdict): real sklearn `MultinomialNB`/`LogisticRegression` in
 *     `python/miniforge_nlp_sidecar.py`, wired in via
 *     `classifyDomainTaxonomyWithLearned()` (`domain-taxonomy-ml-bridge.ts`) as an appended
 *     `labels[]` entry with `source: 'learned'`, fail-open on sidecar unavailability.
 *   - No SQL-expressed classifier authority found (grepped every migration referencing
 *     domain_taxonomy/domain_classification/predicted_domain for a CASE WHEN pattern -- none
 *     exist; those columns are storage for the TS classifier's output, not a second SQL-rules
 *     engine).
 *   - No XGBoost domain classifier found. XGBoost's role elsewhere in this repo (per this same
 *     file's `CANDIDATE-FEATURE-MATRIX-01`/`XGBOOST-RERANKER-EVAL-01` planning) is candidate
 *     RE-RANKING, consuming domain probabilities as an input feature -- not itself a domain
 *     classifier. Do not conflate the two.
 *
 * This contract is deliberately per-EXECUTOR, not an aggregate: one `DomainClassificationV1`
 * instance per classifier family that ran (a rules pass, a Naive Bayes pass, a Logistic
 * Regression pass), all sharing the same `canonicalId`/`sourceRevision` so they can be compared
 * or ensembled downstream -- never collapsed into one authority the way the existing
 * `DomainClassification.labels[]` array already avoids doing for `primary_domain` (rules always
 * wins there; this contract preserves that same non-override discipline at the schema level, by
 * simply never producing a merged "final" verdict itself).
 */

export const DOMAIN_CLASSIFICATION_V1 = 'atlas.domain-classification.v1' as const;

export const DOMAIN_CLASSIFIER_FAMILIES_V1 = [
  'RULES',
  'NAIVE_BAYES',
  'LOGISTIC_REGRESSION',
] as const;
export type DomainClassifierFamilyV1 = (typeof DOMAIN_CLASSIFIER_FAMILIES_V1)[number];

const revision = z.string().min(1);

export const domainClassificationV1Schema = z.object({
  schema: z.literal(DOMAIN_CLASSIFICATION_V1),

  canonicalId: z.string().min(1),
  sourceRevision: revision,

  classifierFamily: z.enum(DOMAIN_CLASSIFIER_FAMILIES_V1),
  classifierRevision: revision,
  /** Deterministic RULES executor has no training corpus -- omit. NAIVE_BAYES/LOGISTIC_REGRESSION
   * are trained models and must declare which snapshot they were fit on. */
  trainingSnapshotRevision: revision.optional(),

  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  predictedDomain: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),

  evidenceRefs: z.array(z.string().min(1)),

  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const isTrained = value.classifierFamily !== 'RULES';
  if (isTrained && value.trainingSnapshotRevision === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainingSnapshotRevision'], message: 'TRAINED_CLASSIFIER_FAMILY_REQUIRES_TRAINING_SNAPSHOT_REVISION' });
  }
  if (!isTrained && value.trainingSnapshotRevision !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainingSnapshotRevision'], message: 'RULES_FAMILY_HAS_NO_TRAINING_SNAPSHOT' });
  }
  if (value.predictedDomain !== null && !(value.predictedDomain in value.probabilities)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['predictedDomain'], message: 'PREDICTED_DOMAIN_MUST_APPEAR_IN_PROBABILITIES_MAP' });
  }
});
export type DomainClassificationV1 = z.infer<typeof domainClassificationV1Schema>;

export function buildDomainClassificationV1(
  input: Omit<DomainClassificationV1, 'schema' | 'canonicalAuthority'>,
): DomainClassificationV1 {
  return domainClassificationV1Schema.parse({
    ...input,
    schema: DOMAIN_CLASSIFICATION_V1,
    canonicalAuthority: false as const,
  });
}
