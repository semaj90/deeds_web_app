import { createHash } from 'node:crypto';

import { pool } from '$lib/server/db/client.js';

import {
  ConceptV1Schema,
  recognizeConceptV1,
  type ConceptV1,
} from './taxonomy/entity-concept-taxonomy-v1.js';
import {
  OntologyAncestorResultV1Schema,
  OntologyResolutionResultV1Schema,
  type OntologyResolutionStateV1,
  type OntologyAncestorRequestV1,
  type OntologyAncestorResultV1,
  type OntologyResolutionRequestV1,
  type OntologyResolutionResultV1,
} from './contracts/ontology-resolution-boundary-v1.js';

export interface FeatureOntologyTupleResolutionAnnotationV1 {
  schemaVersion: 'atlas.feature-ontology-tuple-resolution.v1';
  label: string | null;
  resolvedConceptId: string | null;
  resolutionState: OntologyResolutionStateV1;
  ontologyRevision: string | null;
  matchMethod: 'concept_id' | 'canonical_label' | 'alias' | 'none' | null;
}

export interface FeatureOntologyTupleResolutionCandidateV1 {
  objectId: string | null | undefined;
  objectLabel?: string | null;
  packetKey?: string;
  sourceRef?: string;
}

/**
 * Phase 1 OAKLIB-equivalent resolution boundary
 * (openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap).
 *
 * Reuses `recognizeConceptV1()` (entity-concept-taxonomy-v1.ts) for the actual
 * label/alias matching -- see this change's tasks.md 2.1 for why a second
 * matcher was not written. This file only adds: (1) a Postgres loader from
 * `atlas_domain_ontology` into `ConceptV1[]`, (2) a `parent_group_id`
 * ancestor-chain walk, (3) the explicit `RESOLUTION_UNAVAILABLE` wrapper this
 * capability's spec requires (recognizeConceptV1 itself is a pure function
 * with no I/O and no reason to know about connection failures).
 *
 * Concept IDs here are `concept:<group_id>` (human-readable, stable, 1:1 with
 * `atlas_domain_ontology.group_id`) rather than `createConceptV1`'s
 * hash-derived IDs -- `atlas_domain_ontology` already has a natural stable
 * key, so no synthetic hash is needed, and this matches this capability's own
 * spec.md scenario (`concept:devops.env-config` -> ancestor `concept:devops`).
 */

interface DomainOntologyRow {
  group_id: string;
  group_label: string;
  parent_group_id: string | null;
  examples: string[] | null;
  updated_at: Date;
}

async function loadDomainOntologyRows(): Promise<DomainOntologyRow[]> {
  const { rows } = await pool.query<DomainOntologyRow>(
    `SELECT group_id, group_label, parent_group_id, examples, updated_at
       FROM atlas_domain_ontology
      ORDER BY group_id`
  );
  return rows;
}

function computeOntologyRevision(rows: readonly DomainOntologyRow[]): string {
  const maxUpdatedAtMs = rows.reduce<number>(
    (max, row) => Math.max(max, new Date(row.updated_at).getTime()),
    0
  );
  const maxUpdatedAtIso = maxUpdatedAtMs > 0 ? new Date(maxUpdatedAtMs).toISOString() : 'empty';
  return `atlas-domain-ontology:v1:${rows.length}:${maxUpdatedAtIso}`;
}

function rowToConceptId(groupId: string): string {
  return `concept:${groupId}`;
}

function rowsToConcepts(rows: readonly DomainOntologyRow[]): ConceptV1[] {
  return rows.map((row) =>
    ConceptV1Schema.parse({
      schema: 'atlas.concept.v1',
      conceptId: rowToConceptId(row.group_id),
      conceptKey: row.group_id,
      namespace: 'atlas-domain-ontology',
      label: row.group_label,
      aliases: (row.examples ?? []).map((example) => example.trim()).filter(Boolean),
      description: null,
      taxonomyRevision: 'atlas-domain-ontology:v1',
      definitionEvidenceRefs: [`atlas_domain_ontology:${row.group_id}`],
      producerRevision: 'atlas-domain-ontology-seed:v1',
    })
  );
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Resolve a raw surface label to zero-or-one canonical concept ID.
 * Never invents a concept ID as a side effect of a failed lookup (spec.md
 * "Label-to-concept resolution").
 */
export async function resolveOntologyLabelV1(
  request: OntologyResolutionRequestV1
): Promise<OntologyResolutionResultV1> {
  try {
    const rows = await loadDomainOntologyRows();
    const concepts = rowsToConcepts(rows);
    const ontologyRevision = computeOntologyRevision(rows);
    const normalizedTerm = request.label.trim().toLocaleLowerCase();

    const recognition = recognizeConceptV1({
      observation: {
        schema: 'atlas.term-observation.v1',
        observationId: `ontology-resolution:${sha256Hex(request.label).slice(0, 32)}`,
        term: request.label,
        normalizedTerm,
        kind: 'query_term',
        sourceRef: request.callerContext?.sourceRef ?? null,
        sourceRevision: ontologyRevision,
        evidenceRefs: [`ontology-resolution-request:${request.label}`],
        producer: 'ontology-resolution-boundary',
        producerRevision: 'ontology-resolution-boundary:v1',
        confidence: 1,
        canonicalAuthority: false,
      },
      concepts,
      conceptRegistryRevision: ontologyRevision,
      resolverRevision: 'ontology-resolution-boundary:v1',
    });

    const resolutionState =
      recognition.status === 'ADMITTED'
        ? 'RESOLVED'
        : recognition.status === 'AMBIGUOUS'
          ? 'AMBIGUOUS'
          : 'UNRESOLVED';

    return OntologyResolutionResultV1Schema.parse({
      schemaVersion: 'atlas.ontology-resolution-result.v1',
      label: request.label,
      resolutionState,
      conceptId: recognition.selectedConceptId,
      candidateConceptIds: recognition.candidateConceptIds,
      // recognizeConceptV1 defaults matchMethod to 'alias' even on zero
      // matches (a pre-existing quirk in that dormant function, left
      // untouched -- out of scope); normalize to 'none' here so this
      // boundary's own contract stays accurate for external consumers.
      matchMethod: recognition.candidateConceptIds.length > 0 ? recognition.matchMethod : 'none',
      ontologyRevision,
      callerContext: request.callerContext,
    });
  } catch {
    return OntologyResolutionResultV1Schema.parse({
      schemaVersion: 'atlas.ontology-resolution-result.v1',
      label: request.label,
      resolutionState: 'RESOLUTION_UNAVAILABLE',
      conceptId: null,
      candidateConceptIds: [],
      matchMethod: null,
      ontologyRevision: null,
      callerContext: request.callerContext,
    });
  }
}

/**
 * Read-only bridge for future feature_ontology_tuples producers. It resolves
 * only an existing tuple's object label/id and returns columns suitable for a
 * caller-owned INSERT. It never writes, promotes, or creates lineage identity.
 */
export async function annotateFeatureOntologyTupleWithResolutionV1(
  candidate: FeatureOntologyTupleResolutionCandidateV1,
): Promise<FeatureOntologyTupleResolutionAnnotationV1> {
  const label = candidate.objectLabel?.trim() || candidate.objectId?.trim() || null;
  if (!label) {
    return {
      schemaVersion: 'atlas.feature-ontology-tuple-resolution.v1',
      label: null,
      resolvedConceptId: null,
      resolutionState: 'UNRESOLVED',
      ontologyRevision: null,
      matchMethod: 'none',
    };
  }

  const result = await resolveOntologyLabelV1({
    schemaVersion: 'atlas.ontology-resolution-request.v1',
    label,
    callerContext: {
      ...(candidate.packetKey ? { packetKey: candidate.packetKey } : {}),
      ...(candidate.sourceRef ? { sourceRef: candidate.sourceRef } : {}),
    },
  });
  const resolved = result.resolutionState === 'RESOLVED' && result.conceptId !== null;
  return {
    schemaVersion: 'atlas.feature-ontology-tuple-resolution.v1',
    label,
    resolvedConceptId: resolved ? result.conceptId : null,
    resolutionState: resolved ? 'RESOLVED' : result.resolutionState === 'RESOLVED' ? 'UNRESOLVED' : result.resolutionState,
    ontologyRevision: result.ontologyRevision,
    matchMethod: resolved ? result.matchMethod : 'none',
  };
}

/**
 * Walk `atlas_domain_ontology.parent_group_id` for a resolved concept ID's
 * ancestor chain (spec.md "Ancestor and relationship lookup"). Never
 * fabricates a chain -- an unknown concept ID or a broken parent link simply
 * truncates the walk rather than inventing an ancestor.
 */
export async function resolveOntologyAncestorsV1(
  request: OntologyAncestorRequestV1
): Promise<OntologyAncestorResultV1> {
  try {
    const rows = await loadDomainOntologyRows();
    const ontologyRevision = computeOntologyRevision(rows);
    const byConceptId = new Map(rows.map((row) => [rowToConceptId(row.group_id), row]));
    const start = byConceptId.get(request.conceptId);

    if (!start) {
      return OntologyAncestorResultV1Schema.parse({
        schemaVersion: 'atlas.ontology-ancestor-result.v1',
        conceptId: request.conceptId,
        resolutionState: 'UNRESOLVED',
        ancestorConceptIds: [],
        ontologyRevision,
      });
    }

    const ancestors: string[] = [];
    const seen = new Set<string>([request.conceptId]);
    let current = start;
    while (current.parent_group_id) {
      const parentConceptId = rowToConceptId(current.parent_group_id);
      if (seen.has(parentConceptId)) break; // cycle guard -- never trust upstream data blindly
      const parentRow = byConceptId.get(parentConceptId);
      if (!parentRow) break; // dangling parent_group_id -- truncate, don't fabricate
      ancestors.push(parentConceptId);
      seen.add(parentConceptId);
      current = parentRow;
    }

    return OntologyAncestorResultV1Schema.parse({
      schemaVersion: 'atlas.ontology-ancestor-result.v1',
      conceptId: request.conceptId,
      resolutionState: 'RESOLVED',
      ancestorConceptIds: ancestors,
      ontologyRevision,
    });
  } catch {
    return OntologyAncestorResultV1Schema.parse({
      schemaVersion: 'atlas.ontology-ancestor-result.v1',
      conceptId: request.conceptId,
      resolutionState: 'RESOLUTION_UNAVAILABLE',
      ancestorConceptIds: [],
      ontologyRevision: null,
    });
  }
}
