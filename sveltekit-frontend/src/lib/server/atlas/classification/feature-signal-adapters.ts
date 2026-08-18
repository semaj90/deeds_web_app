import type { DomainClassificationV1 } from '../contracts/okf-cross-domain-v1.js';
import type { FeatureMatrixRowV1 } from '../feature-matrix-schema.js';
import { makeFeatureSignal, type FeatureSignalV1 } from '$lib/server/retrieval/candidate-feature-view.js';

export function domainClassificationToSignal(input: {
  classification: DomainClassificationV1 | null | undefined;
  requestedDomain?: string | null;
}): FeatureSignalV1 {
  const c = input.classification;
  if (!c || c.lifecycle === 'SUPERSEDED') {
    return makeFeatureSignal({ label: 'domain_match', state: 'UNKNOWN', logicalOwner: 'DomainClassificationV1', executor: 'unknown', producerRevision: c?.producerRevision ?? 'unavailable' });
  }
  const matched = !input.requestedDomain || c.domainId === input.requestedDomain;
  return makeFeatureSignal({
    label: 'domain_match',
    state: 'OBSERVED',
    value: matched ? c.confidence : 0,
    logicalOwner: 'DomainClassificationV1',
    executor: c.producerId.includes('xgboost') ? (c.producerId.includes('cuda') ? 'xgboost_cuda' : 'xgboost_cpu') : c.producerId.includes('torch') ? (c.producerId.includes('cuda') ? 'pytorch_cuda' : 'pytorch_cpu') : 'deterministic_ts',
    evidenceRefs: c.evidenceRefs,
    modelRevision: c.producerRevision,
    producerRevision: c.producerRevision,
  });
}

export function featureRowOntologyConceptSignals(input: {
  row: FeatureMatrixRowV1 | null | undefined;
  requestedOntologyIds?: string[];
  requestedConceptIds?: string[];
}): FeatureSignalV1[] {
  if (!input.row) {
    return [
      makeFeatureSignal({ label: 'ontology_match', state: 'UNKNOWN', logicalOwner: 'FeatureMatrixRowV1.ontology_ids', executor: 'unknown', producerRevision: 'unavailable' }),
      makeFeatureSignal({ label: 'concept_match', state: 'UNKNOWN', logicalOwner: 'FeatureMatrixRowV1.concept_ids', executor: 'unknown', producerRevision: 'unavailable' }),
    ];
  }
  const ontologyWanted = new Set(input.requestedOntologyIds ?? []);
  const conceptWanted = new Set(input.requestedConceptIds ?? []);
  const ontologyIds = input.row.ontology_ids ?? [];
  const conceptIds = input.row.concept_ids ?? [];
  const ontologyValue = ontologyWanted.size === 0 ? 1 : [...ontologyWanted].filter((id)=>ontologyIds.includes(id)).length / ontologyWanted.size;
  const conceptValue = conceptWanted.size === 0 ? 1 : [...conceptWanted].filter((id)=>conceptIds.includes(id)).length / conceptWanted.size;
  return [
    makeFeatureSignal({ label: 'ontology_match', state: 'OBSERVED', value: ontologyValue, logicalOwner: 'FeatureMatrixRowV1.ontology_ids', executor: 'postgres', evidenceRefs: input.row.runtime_evidence_refs ?? [], producerRevision: input.row.updated_at }),
    makeFeatureSignal({ label: 'concept_match', state: 'OBSERVED', value: conceptValue, logicalOwner: 'FeatureMatrixRowV1.concept_ids', executor: 'postgres', evidenceRefs: input.row.runtime_evidence_refs ?? [], producerRevision: input.row.updated_at }),
  ];
}

export function topologySignalsFromFeatureRow(row: FeatureMatrixRowV1 | null | undefined): FeatureSignalV1[] {
  const topology = row?.topology;
  return [
    makeFeatureSignal({ label: 'pagerank_global', state: topology?.pagerank_score == null ? 'UNKNOWN' : 'OBSERVED', value: topology?.pagerank_score, logicalOwner: 'FeatureMatrixRowV1.topology.pagerank_score', executor: 'postgres', evidenceRefs: row?.runtime_evidence_refs ?? [], producerRevision: topology?.pagerank_version ?? 'unavailable' }),
    makeFeatureSignal({ label: 'som_adjacency', state: topology?.som_distance_to_centroid == null ? 'UNKNOWN' : 'OBSERVED', value: topology?.som_distance_to_centroid == null ? null : 1 / (1 + topology.som_distance_to_centroid), logicalOwner: 'FeatureMatrixRowV1.topology.som_distance_to_centroid', executor: 'postgres', evidenceRefs: row?.runtime_evidence_refs ?? [], producerRevision: row?.updated_at ?? 'unavailable' }),
  ];
}
