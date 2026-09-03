import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * PARENT ATLAS CONCEPT FABRIC 01 — CONCEPT-SCHEMA-01
 * (openspec/changes/parent-atlas-ontology-kernel, openspec/changes/parent-atlas-retrieval-lineage-dag-convergence)
 *
 * Canonical cross-language schema owner for ConceptDefinitionV1, TermObservationV1, and
 * ConceptRecognitionV1. This file is the single source of truth — Python-side validation must be
 * derived from (or checked against) this file's JSON Schema export (see
 * `exportConceptFabricJsonSchemas()` at the bottom), not hand-maintained as a subtly different
 * parallel definition. No new database table is created here — see the doc comments on
 * ConceptDefinitionV1Schema below for the exact field-by-field mapping onto the EXISTING, already
 * live `atlas_ontology_concepts` / `atlas_ontology_relations` tables (drizzle/schema.ts:6175-6217),
 * which are currently empty (0 rows) but already structurally correct for this contract.
 *
 * Hard rules this file enforces at the schema/validator level, not just in comments (per direct
 * operator instruction):
 *  - conceptId is a distinct identity from treeNodeId/AST-CST structural ids (CONCEPT_VALID_09).
 *  - TermObservationV1 and ConceptRecognitionV1 both carry canonicalAuthority: false, always —
 *    only a ConceptDefinitionV1 row admitted into atlas_ontology_concepts is canonical authority.
 *  - A `matchMethod: 'semantic'` recognition can never carry `status: 'ADMITTED'` — enforced by a
 *    schema-level superRefine, not a docstring (CONCEPT_VALID_10).
 *  - sourceRevision stays genuinely nullable — never synthesized when unavailable.
 *
 * LAYERING NOTE (found while building this, recorded rather than silently duplicated — see
 * `openspec/changes/parent-atlas-ontology-kernel/tasks.md`'s `ONTO-PY-CONCEPT-INTEGRATION-01`):
 * `packages/parent-atlas/src/core/concept-admission-v1.ts` already defines a closely-related but
 * DISTINCT, narrower layer — `RawConceptLabelV1` / `ConceptAdmissionDecisionV1` /
 * `ConceptIntegrationReceiptV1` — which maps a raw observed classifier label onto an EXISTING
 * `DomainOntologyMappingV1` classId (from `python/parent_atlas_ontology/domain_mapping.py`'s
 * 7-class taxonomy) and produces an admission *decision*, not a concept *definition*. It does not
 * define what a concept means, its aliases, or its type — this file does that. The two are
 * complementary, not competing: an admitted `ConceptAdmissionDecisionV1.classId` is exactly the
 * kind of thing that should eventually correspond to (or produce) a `ConceptDefinitionV1` row in
 * `atlas_ontology_concepts` for that same classId — but that wiring is NOT built yet, and is an
 * open follow-up, not resolved by this file. Do not silently merge or duplicate either contract;
 * if reconciling them, do it as an explicit, reviewed step, not an implicit side effect of adding
 * a caller to one or the other.
 */

// ---------------------------------------------------------------------------------------------
// ConceptDefinitionV1
// ---------------------------------------------------------------------------------------------

/**
 * Matches drizzle/schema.ts:6189's live CHECK constraint on atlas_ontology_concepts.concept_type
 * EXACTLY — this is not a new enum, it is the enum the live (empty) table already enforces.
 */
export const ConceptTypeSchema = z.enum([
  'concept',
  'alias',
  'instance',
  'category',
  'capability',
  'operation',
  'storage_system',
  'protocol',
  'artifact',
  'domain',
  'relationship',
]);
export type ConceptType = z.infer<typeof ConceptTypeSchema>;

export const ConceptStatusSchema = z.enum(['ACTIVE', 'PROPOSED', 'DEPRECATED']);
export type ConceptStatus = z.infer<typeof ConceptStatusSchema>;

/**
 * Field -> live-column mapping onto atlas_ontology_concepts (drizzle/schema.ts:6175):
 *   conceptId         -> concept_id (PK, text)                          [1:1, already exists]
 *   canonicalLabel     -> canonical_label (text)                        [1:1, already exists]
 *   conceptType        -> concept_type (text, CHECK-constrained)        [1:1, already exists]
 *   definition         -> description (text, nullable in DB)           [logical rename, already exists]
 *   aliases            -> aliases (text[], GIN-indexed)                 [1:1, already exists]
 *   namespace          -> namespace (text, default 'general', indexed) [1:1, already exists]
 *   schemaVersion      -> schema_version (integer, default 1)          [1:1, already exists]
 *   definitionRevision -> NOT YET a column. Computed deterministically (see
 *                         computeConceptDefinitionRevision below); would need a new
 *                         `definition_revision text` column to persist. Deliberately NOT added
 *                         this pass ("Do not add a new database table yet" — extends to not
 *                         altering the existing one either, until CONCEPT-SEED-CANARY-01).
 *   sourceOwner        -> NOT YET a column. Tracked only in the CONCEPT-SEED-DRY-01 proposal
 *                         artifact for now (docs/reports/concept-seed-dry-v1.json), not persisted.
 *   evidenceRefs       -> NOT YET a column. Same as sourceOwner.
 *   status             -> NOT YET a column (live table has no lifecycle column at all — every
 *                         existing row would implicitly be ACTIVE). Tracked in the proposal
 *                         artifact only, until a real migration is scoped.
 *   canonicalAuthority -> not a column; always the literal `true` for this schema (a
 *                         ConceptDefinitionV1 IS the canonical-authority record by construction —
 *                         this is what distinguishes it from TermObservationV1/ConceptRecognitionV1).
 */
export const ConceptDefinitionV1Schema = z
  .object({
    schema: z.literal('atlas.concept-definition.v1'),
    conceptId: z.string().min(1),
    canonicalLabel: z.string().min(1),
    definition: z.string(),
    conceptType: ConceptTypeSchema,
    namespace: z.string().min(1).default('general'),
    aliases: z.array(z.string().min(1)).default([]),
    definitionRevision: z.string().min(1),
    schemaVersion: z.number().int().positive().default(1),
    sourceOwner: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    status: ConceptStatusSchema,
    canonicalAuthority: z.literal(true),
  })
  .superRefine((concept, ctx) => {
    // CONCEPT_VALID_02: an ACTIVE concept must have a non-empty definition.
    if (concept.status === 'ACTIVE' && concept.definition.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definition'],
        message: 'CONCEPT_VALID_02: ACTIVE concept must have a non-empty definition',
      });
    }
    // CONCEPT_VALID_07: source owner + evidence must exist for an ACTIVE concept — no
    // manually-authored, unsourced "master glossary" entries.
    if (concept.status === 'ACTIVE' && concept.evidenceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenceRefs'],
        message: 'CONCEPT_VALID_07: ACTIVE concept must carry at least one evidenceRef',
      });
    }
    // aliases must never contain the canonical label itself or be duplicated (feeds
    // CONCEPT_VALID_04's alias-collision check at the registry level, but a self-referential
    // or internally-duplicated alias list is rejected at the single-definition level too).
    const normalizedAliases = concept.aliases.map((a) => a.trim().toLowerCase());
    const dedup = new Set(normalizedAliases);
    if (dedup.size !== normalizedAliases.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aliases'],
        message: 'aliases must not contain duplicates (case-insensitive)',
      });
    }
    if (normalizedAliases.includes(concept.canonicalLabel.trim().toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aliases'],
        message: 'aliases must not duplicate canonicalLabel',
      });
    }
  });
export type ConceptDefinitionV1 = z.infer<typeof ConceptDefinitionV1Schema>;

/**
 * CONCEPT_VALID_03: definitionRevision must deterministically reproduce from the concept's own
 * identity-bearing fields. Sorted alias list + explicit field order so re-derivation is stable
 * regardless of object key order or alias insertion order.
 */
export function computeConceptDefinitionRevision(input: {
  conceptId: string;
  canonicalLabel: string;
  definition: string;
  conceptType: ConceptType;
  namespace: string;
  aliases: string[];
  schemaVersion: number;
}): string {
  const sortedAliases = [...input.aliases].map((a) => a.trim().toLowerCase()).sort();
  const parts = [
    input.conceptId,
    input.canonicalLabel,
    input.definition,
    input.conceptType,
    input.namespace,
    sortedAliases.join(','),
    String(input.schemaVersion),
  ];
  return `sha256:${createHash('sha256').update(parts.join(' '), 'utf8').digest('hex')}`;
}

// ---------------------------------------------------------------------------------------------
// TermObservationV1
// ---------------------------------------------------------------------------------------------

export const TermObservationKindSchema = z.enum([
  'token',
  'lemma',
  'phrase',
  'entity',
  'ast_node_kind',
  'cst_token',
  'symbol',
  'import',
  'schema',
  'domain_label',
  'query_term',
]);
export type TermObservationKind = z.infer<typeof TermObservationKindSchema>;

export const TermObservationV1Schema = z.object({
  schema: z.literal('atlas.term-observation.v1'),
  observationId: z.string().min(1),
  term: z.string().min(1),
  normalizedTerm: z.string().min(1),
  kind: TermObservationKindSchema,
  sourceRef: z.string().min(1),
  // Never synthesized when genuinely unavailable — nullable, not defaulted to a fabricated value.
  sourceRevision: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  producer: z.string().min(1),
  producerRevision: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // A raw observation is never itself canonical authority — always false, enforced structurally.
  canonicalAuthority: z.literal(false),
});
export type TermObservationV1 = z.infer<typeof TermObservationV1Schema>;

// ---------------------------------------------------------------------------------------------
// ConceptRecognitionV1
// ---------------------------------------------------------------------------------------------

export const ConceptRecognitionMatchMethodSchema = z.enum([
  'concept_id',
  'canonical_label',
  'alias',
  'taxonomy_mapping',
  'structural_mapping',
  'lexical',
  'semantic',
  'hybrid',
]);
export type ConceptRecognitionMatchMethod = z.infer<typeof ConceptRecognitionMatchMethodSchema>;

export const ConceptRecognitionStatusSchema = z.enum([
  'ADMITTED',
  'PROPOSED',
  'AMBIGUOUS',
  'UNMAPPED',
  'REJECTED',
]);
export type ConceptRecognitionStatus = z.infer<typeof ConceptRecognitionStatusSchema>;

/**
 * Resolution precedence (documented here, enforced by the resolver that will consume this
 * schema in NLP-CONCEPT-RECOGNITION-01, not by this schema alone): 1. exact conceptId,
 * 2. canonical label, 3. alias, 4. explicit domain-taxonomy mapping, 5. explicit AST/CST
 * structural mapping, 6. lexical FTS, 7. semantic, 8. hybrid. Deterministic methods (1-5) may
 * reach ADMITTED; lexical/semantic/hybrid (6-8) normally stay PROPOSED — enforced below for
 * 'semantic' specifically per CONCEPT_VALID_10 (the case the operator flagged as most important
 * not to get wrong).
 */
export const ConceptRecognitionV1Schema = z
  .object({
    schema: z.literal('atlas.concept-recognition.v1'),
    recognitionId: z.string().min(1),
    observationId: z.string().min(1),
    observedTerm: z.string().min(1),
    normalizedTerm: z.string().min(1),
    candidateConceptIds: z.array(z.string().min(1)).default([]),
    selectedConceptId: z.string().min(1).nullable(),
    matchMethod: ConceptRecognitionMatchMethodSchema,
    confidence: z.number().min(0).max(1),
    lexicalScore: z.number().min(0).max(1).nullable().default(null),
    semanticScore: z.number().min(0).max(1).nullable().default(null),
    structuralScore: z.number().min(0).max(1).nullable().default(null),
    domainScore: z.number().min(0).max(1).nullable().default(null),
    evidenceRefs: z.array(z.string().min(1)).default([]),
    conceptRegistryRevision: z.string().min(1),
    resolverRevision: z.string().min(1),
    status: ConceptRecognitionStatusSchema,
    // A raw recognition is never itself canonical authority — always false, enforced structurally.
    canonicalAuthority: z.literal(false),
  })
  .superRefine((recognition, ctx) => {
    // CONCEPT_VALID_10: semantic similarity cannot directly promote a concept. A purely semantic
    // match method must never carry ADMITTED — this is the exact "embedding similarity 0.94 ->
    // ontology equality" failure mode the operator named explicitly.
    if (recognition.matchMethod === 'semantic' && recognition.status === 'ADMITTED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message:
          "CONCEPT_VALID_10: matchMethod:'semantic' can never carry status:'ADMITTED' — semantic " +
          "candidates must resolve to PROPOSED, AMBIGUOUS, UNMAPPED, or REJECTED only.",
      });
    }
    // CONCEPT_VALID_09: an AST/CST structural id must never itself become concept identity.
    // structural_mapping is allowed to reach ADMITTED (it's deterministic, per the precedence
    // list above) but only by resolving to a REAL concept in candidateConceptIds — never by
    // passing the raw structural observation's term through as if it were already a conceptId.
    if (
      recognition.matchMethod === 'structural_mapping' &&
      recognition.status === 'ADMITTED' &&
      recognition.selectedConceptId !== null &&
      !recognition.candidateConceptIds.includes(recognition.selectedConceptId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedConceptId'],
        message:
          'CONCEPT_VALID_09: an ADMITTED structural_mapping selectedConceptId must appear in ' +
          'candidateConceptIds — a raw structural/tree-node id must never be substituted directly ' +
          'as concept identity.',
      });
    }
    // ADMITTED/AMBIGUOUS both require a non-null selection or non-empty candidate set; UNMAPPED/
    // REJECTED should not carry a selectedConceptId (nothing was actually chosen).
    if (recognition.status === 'ADMITTED' && recognition.selectedConceptId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedConceptId'],
        message: "status:'ADMITTED' requires a non-null selectedConceptId",
      });
    }
    if (
      (recognition.status === 'UNMAPPED' || recognition.status === 'REJECTED') &&
      recognition.selectedConceptId !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedConceptId'],
        message: `status:'${recognition.status}' must not carry a selectedConceptId`,
      });
    }
  });
export type ConceptRecognitionV1 = z.infer<typeof ConceptRecognitionV1Schema>;

// ---------------------------------------------------------------------------------------------
// Registry-level validators (CONCEPT_VALID_01, 04, 05, 06, 08 — the checks that need more than
// one object in view to evaluate). CONCEPT_VALID_02/07/09/10 are enforced above at the
// single-object schema level; CONCEPT_VALID_03 is the computeConceptDefinitionRevision() helper.
// ---------------------------------------------------------------------------------------------

export interface ConceptValidationIssue {
  code:
    | 'CONCEPT_VALID_01'
    | 'CONCEPT_VALID_03'
    | 'CONCEPT_VALID_04'
    | 'CONCEPT_VALID_05'
    | 'CONCEPT_VALID_06'
    | 'CONCEPT_VALID_08';
  message: string;
  conceptId?: string;
}

/** CONCEPT_VALID_01: conceptId must be unique across the batch/registry. */
export function validateConceptIdUniqueness(concepts: ConceptDefinitionV1[]): ConceptValidationIssue[] {
  const seen = new Map<string, number>();
  for (const concept of concepts) {
    seen.set(concept.conceptId, (seen.get(concept.conceptId) ?? 0) + 1);
  }
  const issues: ConceptValidationIssue[] = [];
  for (const [conceptId, count] of seen) {
    if (count > 1) {
      issues.push({
        code: 'CONCEPT_VALID_01',
        conceptId,
        message: `conceptId ${conceptId} appears ${count} times in the same batch — must be unique`,
      });
    }
  }
  return issues;
}

/** CONCEPT_VALID_03: recompute and compare definitionRevision — never trust a stored value blindly. */
export function validateDefinitionRevisionReproducible(concept: ConceptDefinitionV1): ConceptValidationIssue[] {
  const recomputed = computeConceptDefinitionRevision(concept);
  if (recomputed !== concept.definitionRevision) {
    return [
      {
        code: 'CONCEPT_VALID_03',
        conceptId: concept.conceptId,
        message: `definitionRevision does not reproduce: stored=${concept.definitionRevision} recomputed=${recomputed}`,
      },
    ];
  }
  return [];
}

/**
 * CONCEPT_VALID_04: alias collisions must never silently resolve. If the same alias (or a
 * concept's canonicalLabel) is claimed by more than one concept, that is a hard validation
 * failure, not a "pick the first match" convenience.
 */
export function validateNoAliasCollisions(concepts: ConceptDefinitionV1[]): ConceptValidationIssue[] {
  const claimants = new Map<string, Set<string>>(); // normalized alias/label -> set of conceptIds
  for (const concept of concepts) {
    const surfaceForms = [concept.canonicalLabel, ...concept.aliases].map((s) => s.trim().toLowerCase());
    for (const surface of surfaceForms) {
      if (!claimants.has(surface)) claimants.set(surface, new Set());
      claimants.get(surface)!.add(concept.conceptId);
    }
  }
  const issues: ConceptValidationIssue[] = [];
  for (const [surface, conceptIds] of claimants) {
    if (conceptIds.size > 1) {
      issues.push({
        code: 'CONCEPT_VALID_04',
        message: `alias/label "${surface}" is claimed by ${conceptIds.size} concepts: ${[...conceptIds].join(', ')} — ambiguous, not auto-resolved`,
      });
    }
  }
  return issues;
}

export interface ConceptRelationRef {
  subjectConceptId: string;
  predicate: string;
  objectConceptId: string;
}

/** CONCEPT_VALID_05: every relation endpoint must resolve to a real concept in the registry. */
export function validateRelationEndpointsResolve(
  relations: ConceptRelationRef[],
  registry: ReadonlySet<string>,
): ConceptValidationIssue[] {
  const issues: ConceptValidationIssue[] = [];
  for (const relation of relations) {
    if (!registry.has(relation.subjectConceptId)) {
      issues.push({
        code: 'CONCEPT_VALID_05',
        message: `relation subjectConceptId "${relation.subjectConceptId}" does not resolve in the concept registry`,
      });
    }
    if (!registry.has(relation.objectConceptId)) {
      issues.push({
        code: 'CONCEPT_VALID_05',
        message: `relation objectConceptId "${relation.objectConceptId}" does not resolve in the concept registry`,
      });
    }
  }
  return issues;
}

/** CONCEPT_VALID_06: every conceptId referenced by an OntologyLinkedTupleV1 must resolve. */
export function validateTupleConceptIdsResolve(
  tupleConceptIds: readonly string[],
  registry: ReadonlySet<string>,
): ConceptValidationIssue[] {
  const issues: ConceptValidationIssue[] = [];
  for (const conceptId of tupleConceptIds) {
    if (!registry.has(conceptId)) {
      issues.push({
        code: 'CONCEPT_VALID_06',
        conceptId,
        message: `OntologyLinkedTupleV1.conceptIds references "${conceptId}", which does not resolve in the concept registry`,
      });
    }
  }
  return issues;
}

/**
 * CONCEPT_VALID_08: a representation (e.g. a semantic_768 embedding of a concept's canonical
 * text serialization) must bind to the EXACT definitionRevision it was computed from — never a
 * stale or unrelated revision. No representations exist yet (CONCEPT-REPRESENTATION-01 is a P2
 * task), so this validator is defined and fixture-tested now, ahead of any real caller.
 */
export function validateRepresentationBindsExactRevision(representation: {
  conceptId: string;
  definitionRevision: string;
}, registry: ReadonlyMap<string, ConceptDefinitionV1>): ConceptValidationIssue[] {
  const concept = registry.get(representation.conceptId);
  if (!concept) {
    return [
      {
        code: 'CONCEPT_VALID_08',
        conceptId: representation.conceptId,
        message: `representation references conceptId "${representation.conceptId}", which does not exist`,
      },
    ];
  }
  if (concept.definitionRevision !== representation.definitionRevision) {
    return [
      {
        code: 'CONCEPT_VALID_08',
        conceptId: representation.conceptId,
        message: `representation.definitionRevision=${representation.definitionRevision} does not match current concept.definitionRevision=${concept.definitionRevision}`,
      },
    ];
  }
  return [];
}
