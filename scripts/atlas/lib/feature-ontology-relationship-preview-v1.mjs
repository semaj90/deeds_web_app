import { createHash } from 'node:crypto';
import { buildFeatureRelationship } from '../../../packages/parent-atlas/dist/core/feature-intelligence.js';

export const PREVIEW_PREDICATE = 'USES_CONCEPT';
export const PREVIEW_REVISION = 'feature-ontology-relationship-preview:v1';

function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`FEATURE_RELATIONSHIP_PREVIEW_MISSING_${field.toUpperCase()}`);
  }
  return value;
}

/**
 * Convert one feature_ontology_tuples row into a reviewable FI relationship.
 * This deliberately accepts only USES_CONCEPT; taxonomy predicates stay in
 * their canonical KAG authority and are not copied into atlas_relationships.
 */
export function previewFeatureOntologyRelationship(row) {
  const predicate = requireText(row.predicate, 'predicate');
  if (predicate !== PREVIEW_PREDICATE) return null;

  const tupleId = requireText(String(row.id ?? ''), 'tuple_id');
  const sourceRef = requireText(row.canonical_source_ref ?? row.source_ref, 'source_ref');
  const subjectType = row.feature_id ? 'feature' : requireText(row.subject_type, 'subject_type');
  const subjectId = row.feature_id ? requireText(row.feature_id, 'feature_id') : requireText(row.subject_id, 'subject_id');
  const objectType = requireText(row.object_type, 'object_type');
  const objectId = requireText(row.object_id, 'object_id');
  const ontologyVersion = requireText(row.ontology_version, 'ontology_version');
  const extractorVersion = requireText(row.extractor_version, 'extractor_version');
  const workspaceRevision = requireText(row.workspace_revision, 'workspace_revision');
  if (!workspaceRevision.startsWith('sha256:')) {
    throw new Error(`FEATURE_RELATIONSHIP_PREVIEW_NON_CANONICAL_WORKSPACE_REVISION:${tupleId}`);
  }
  const confidence = Number(row.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`FEATURE_RELATIONSHIP_PREVIEW_INVALID_CONFIDENCE:${tupleId}`);
  }

  const identity = [tupleId, sourceRef, subjectType, subjectId, predicate, objectType, objectId].join('|');
  const relationshipId = `rel:feature-ontology:${stableId(identity)}`;
  const sourceRevision = requireText(row.canonical_source_revision ?? `ontology:${ontologyVersion}:${extractorVersion}`, 'source_revision');

  return buildFeatureRelationship({
    schema: 'atlas.feature-relationship.v1',
    relationship_id: relationshipId,
    relationship_type: predicate,
    participants: [
      { role: 'subject', entity_type: subjectType, entity_id: subjectId, source_ref: sourceRef },
      { role: 'object', entity_type: objectType, entity_id: objectId, source_ref: sourceRef },
    ],
    cardinality: [],
    source_ref: sourceRef,
    source_revision: sourceRevision,
    relationship_revision: PREVIEW_REVISION,
    producer_revision: PREVIEW_REVISION,
    evidence_refs: [`feature_ontology_tuples:${tupleId}`],
    confidence,
    metadata: {
      preview_only: true,
      source_table: 'feature_ontology_tuples',
      source_tuple_id: tupleId,
      packet_key: row.packet_key ?? null,
      legacy_source_ref: row.legacy_source_ref ?? null,
      canonical_binding_checksum: row.canonical_binding_checksum ?? null,
      feature_key: row.feature_key ?? null,
      feature_label: row.feature_label ?? null,
      domain_class: row.domain_class ?? null,
      workspace_revision: workspaceRevision,
      ontology_version: ontologyVersion,
      extractor_version: extractorVersion,
    },
  });
}

export function previewFeatureOntologyRelationships(rows) {
  const relationships = [];
  const rejected = [];
  for (const row of rows) {
    try {
      const relationship = previewFeatureOntologyRelationship(row);
      if (relationship) relationships.push(relationship);
    } catch (error) {
      rejected.push({ tuple_id: String(row?.id ?? ''), reason: error instanceof Error ? error.message : String(error) });
    }
  }
  relationships.sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  return { relationships, rejected };
}

export function previewFeatureOntologyEvidence(row) {
  const tupleId = requireText(String(row.id ?? ''), 'tuple_id');
  const sourceRef = requireText(row.canonical_source_ref ?? row.source_ref, 'source_ref');
  const ontologyVersion = requireText(row.ontology_version, 'ontology_version');
  const extractorVersion = requireText(row.extractor_version, 'extractor_version');
  const confidence = Number(row.confidence ?? 0);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`FEATURE_EVIDENCE_PREVIEW_INVALID_CONFIDENCE:${tupleId}`);
  }
  return {
    evidence_id: `feature_ontology_tuples:${tupleId}`,
    evidence_kind: 'ontology_tuple',
    source_ref: sourceRef,
    source_revision: row.canonical_source_revision ?? `ontology:${ontologyVersion}:${extractorVersion}`,
    evidence_revision: PREVIEW_REVISION,
    producer_revision: PREVIEW_REVISION,
    confidence,
    payload: {
      source_table: 'feature_ontology_tuples',
      source_tuple_id: tupleId,
      legacy_source_ref: row.legacy_source_ref ?? null,
      canonical_binding_checksum: row.canonical_binding_checksum ?? null,
      packet_key: row.packet_key ?? null,
      feature_key: row.feature_key ?? null,
      predicate: row.predicate ?? null,
      subject_type: row.subject_type ?? null,
      subject_id: row.subject_id ?? null,
      object_type: row.object_type ?? null,
      object_id: row.object_id ?? null,
      evidence: row.evidence ?? null,
    },
    tags: ['feature_ontology_tuples', String(row.predicate ?? '')].filter(Boolean),
    search_text: `${row.predicate ?? ''} ${row.feature_key ?? ''} ${sourceRef}`.trim(),
  };
}
