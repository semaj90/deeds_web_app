import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasOntologyKernelSchemaV1 } from './ontology-kernel-schema-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * OAK-03A — deterministic OWL projection + `OntologyProfileReceiptV1`.
 *
 * Per the operator's frozen reasoner architecture:
 *   AtlasOntologyKernelSchemaV1 -> OWL projection -> OntologyProfileReceiptV1
 *   -> {ELK (EL fast lane) | HermiT (full DL lane)} -> SchemaVerificationReceiptV1
 *
 * This file is the FIRST arrow only (`-> OWL projection ->
 * OntologyProfileReceiptV1`). It is pure, deterministic TypeScript with no
 * external process, no JVM, no network — it does not invoke ELK or HermiT
 * (that's OAK-03B/03C, deliberately separate files: a JVM subprocess
 * adapter is a materially different, more consequential kind of change
 * than a pure string-projection function, and shouldn't be bundled with
 * one).
 *
 * HONEST GAP, found while building this (not guessed at, not silently
 * smoothed over): `kernelConstraintSchema` (in `ontology-kernel-schema-
 * v1.ts`) only carries `appliesTo: string[]` + a free-text `description`
 * for every constraint kind. That's enough to project `DISJOINT_CLASSES`
 * faithfully (an `owl:disjointWith` axiom between exactly two class ids
 * needs nothing more). It is NOT enough to project `DOMAIN_RANGE`,
 * `PROPERTY_RESTRICTION`, or `CARDINALITY` as real OWL axioms — those
 * need which id is domain vs. range, which property is restricted, and
 * an actual cardinality number, none of which the current schema
 * captures. Those three constraint kinds are projected as
 * `rdfs:comment` annotations carrying their `description` text (visible,
 * auditable, but NOT logically enforced by any reasoner) rather than
 * fabricated into an invented domain/range split. `axiomsCovered` /
 * `axiomsAnnotatedOnly` on the projection result make this split
 * explicit and machine-checkable rather than buried in a comment nobody
 * reads. Before OAK-03B/03C can meaningfully verify `DOMAIN_RANGE`/
 * `PROPERTY_RESTRICTION`/`CARDINALITY` constraints, `kernelConstraintSchema`
 * needs real structured fields for them — flagged, not fixed, since
 * extending that schema is OAK-02 surface, not OAK-03A's.
 */
export const owlProfileHeuristicSchema = z.enum(['OWL2_EL_LIKELY', 'OWL2_DL_REQUIRED', 'UNKNOWN']);
export type OwlProfileHeuristic = z.infer<typeof owlProfileHeuristicSchema>;

export const ontologyProfileReceiptV1Schema = z.object({
  schema: z.literal('atlas.ontology-profile-receipt.v1').default('atlas.ontology-profile-receipt.v1'),
  schemaId: id,
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  owlDocument: z.string().min(1),
  owlChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  entityClassCount: z.number().int().nonnegative(),
  relationPropertyCount: z.number().int().nonnegative(),
  axiomsCovered: z.array(z.string().min(1)),
  axiomsAnnotatedOnly: z.array(z.string().min(1)),
  /**
   * A HEURISTIC, not a real OWL-profile checker (that requires an actual
   * profile-validation tool this repo hasn't adopted — OWLAPI's
   * `OWLProfileChecker` or equivalent). `OWL2_DL_REQUIRED` is returned
   * whenever any constraint had to be annotation-only (i.e. this
   * projection couldn't even attempt EL-compatible axioms for it) —
   * conservative on purpose: a wrong "this is EL" would silently route a
   * DL-requiring schema to the weaker ELK lane.
   */
  owlProfileHeuristic: owlProfileHeuristicSchema,
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type OntologyProfileReceiptV1 = z.infer<typeof ontologyProfileReceiptV1Schema>;

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

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const OWL_NS = 'http://parent-atlas.local/ontology-kernel#';

/**
 * Deterministic: same schema input always produces byte-identical OWL/XML
 * output (entity/relation/constraint arrays are projected in their
 * incoming order — the schema itself, not this function, owns ordering
 * determinism, matching every other checksum-sealed builder in this file
 * family).
 */
export function projectAtlasOntologyKernelSchemaToOwlV1(
  kernelSchema: AtlasOntologyKernelSchemaV1,
): OntologyProfileReceiptV1 {
  const lines: string[] = [];
  lines.push('<?xml version="1.0"?>');
  lines.push(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"`);
  lines.push(`         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"`);
  lines.push(`         xmlns:owl="http://www.w3.org/2002/07/owl#"`);
  lines.push(`         xmlns:atlas="${OWL_NS}"`);
  lines.push(`         xml:base="${OWL_NS.replace(/#$/, '')}">`);
  lines.push(`  <owl:Ontology rdf:about="${OWL_NS.replace(/#$/, '')}">`);
  lines.push(`    <rdfs:comment>atlas.ontology-kernel-schema.v1 :: ${xmlEscape(kernelSchema.schemaId)} :: ${xmlEscape(kernelSchema.taskClass)}</rdfs:comment>`);
  lines.push(`  </owl:Ontology>`);

  for (const entity of kernelSchema.entityTypes) {
    lines.push(`  <owl:Class rdf:about="${OWL_NS}${xmlEscape(entity.entityTypeId)}">`);
    lines.push(`    <rdfs:label>${xmlEscape(entity.label)}</rdfs:label>`);
    lines.push(`  </owl:Class>`);
  }

  for (const relation of kernelSchema.relationTypes) {
    // Binary relations project as owl:ObjectProperty. N-ary relations get
    // a reified owl:Class (the standard OWL n-ary-relation pattern) since
    // OWL properties are inherently binary — projecting an n-ary relation
    // as a property would silently lose the extra participant roles.
    if (relation.arity === 'binary') {
      lines.push(`  <owl:ObjectProperty rdf:about="${OWL_NS}${xmlEscape(relation.relationTypeId)}">`);
      lines.push(`    <rdfs:label>${xmlEscape(relation.label)}</rdfs:label>`);
      lines.push(`  </owl:ObjectProperty>`);
    } else {
      lines.push(`  <owl:Class rdf:about="${OWL_NS}${xmlEscape(relation.relationTypeId)}">`);
      lines.push(`    <rdfs:label>${xmlEscape(relation.label)} (n-ary relation, reified)</rdfs:label>`);
      lines.push(`    <rdfs:comment>participantRoles: ${xmlEscape(relation.participantRoles.join(', '))}</rdfs:comment>`);
      lines.push(`  </owl:Class>`);
    }
  }

  const axiomsCovered: string[] = [];
  const axiomsAnnotatedOnly: string[] = [];

  for (const constraint of kernelSchema.constraints) {
    if (constraint.kind === 'DISJOINT_CLASSES' && constraint.appliesTo.length === 2) {
      const [a, b] = constraint.appliesTo;
      lines.push(`  <rdf:Description rdf:about="${OWL_NS}${xmlEscape(a)}">`);
      lines.push(`    <owl:disjointWith rdf:resource="${OWL_NS}${xmlEscape(b)}"/>`);
      lines.push(`  </rdf:Description>`);
      axiomsCovered.push(constraint.constraintId);
    } else {
      // DOMAIN_RANGE / PROPERTY_RESTRICTION / CARDINALITY, or a
      // DISJOINT_CLASSES with != 2 members (schema allows appliesTo.min(1)
      // without an upper bound, so this branch is reachable even for
      // DISJOINT_CLASSES) — annotation-only, not a logical axiom. See
      // this file's own docstring for why.
      const subject = constraint.appliesTo[0];
      lines.push(`  <rdf:Description rdf:about="${OWL_NS}${xmlEscape(subject)}">`);
      lines.push(`    <rdfs:comment>[${xmlEscape(constraint.kind)}] ${xmlEscape(constraint.description)}</rdfs:comment>`);
      lines.push(`  </rdf:Description>`);
      axiomsAnnotatedOnly.push(constraint.constraintId);
    }
  }

  lines.push('</rdf:RDF>');
  const owlDocument = lines.join('\n');

  const body = {
    schema: 'atlas.ontology-profile-receipt.v1' as const,
    schemaId: kernelSchema.schemaId,
    schemaChecksum: kernelSchema.schemaChecksum,
    owlDocument,
    entityClassCount: kernelSchema.entityTypes.length,
    relationPropertyCount: kernelSchema.relationTypes.length,
    axiomsCovered,
    axiomsAnnotatedOnly,
    owlProfileHeuristic: (axiomsAnnotatedOnly.length > 0 ? 'OWL2_DL_REQUIRED' : 'OWL2_EL_LIKELY') as OwlProfileHeuristic,
    producerRevision: kernelSchema.producerRevision,
    canonicalAuthority: false as const,
  };
  return ontologyProfileReceiptV1Schema.parse({ ...body, owlChecksum: sha256(owlDocument) });
}
