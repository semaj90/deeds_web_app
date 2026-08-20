import { describe, expect, it } from 'vitest';
import {
  planOntologyVectorExecution,
  postgres18AioObservation,
  type OntologyVectorPlanningInputV1,
} from './ontology-vector-execution-plan.js';

function base(overrides: Partial<OntologyVectorPlanningInputV1> = {}): OntologyVectorPlanningInputV1 {
  return {
    schema: 'atlas.ontology-vector-planning-input.v1',
    intent: 'HYBRID_RELATIONAL_VECTOR',
    corpusRows: 250_000,
    candidateRowsAfterRelationalFilter: 20_000,
    dimensions: 768,
    filterSelectivity: 0.08,
    exactResultRequired: false,
    mutationSensitive: false,
    highUpdateRate: true,
    gpuAvailable: true,
    freeVramBytes: 2 * 1024 * 1024 * 1024,
    coldTierAvailable: false,
    turbovecAvailable: true,
    diskannAvailable: true,
    pgvectorAvailable: true,
    rapidsSidecarAvailable: true,
    ontologyReasoningRequired: false,
    ontologyProfile: 'NONE',
    workspaceRevision: '742',
    representationRevision: 'semantic768-r1',
    producerRevision: 'test',
    ...overrides,
  };
}

describe('ontology/vector execution planning', () => {
  it('keeps Owlready2 out of ordinary semantic neighbor queries', () => {
    const plan = planOntologyVectorExecution(base());
    expect(plan.ontologyEngine).toBe('NONE');
    expect(plan.ontologyCanonicalWritesAllowed).toBe(false);
    expect(plan.inferredOntologyFactsRemainDerived).toBe(true);
  });

  it('uses RDFLib for provenance/property-path work without invoking DL reasoning', () => {
    const plan = planOntologyVectorExecution(base({
      intent: 'PROPERTY_PATH',
      pgvectorAvailable: false,
      ontologyReasoningRequired: false,
    }));
    expect(plan.ontologyEngine).toBe('RDFLIB_DATASET');
    expect(plan.ontologyRole).toBe('INTERCHANGE_QUERY');
    expect(plan.preferredVectorExecutor).toBe('NONE');
  });

  it('routes OWL-DL classification/consistency to Owlready2 reasoners', () => {
    const classification = planOntologyVectorExecution(base({
      intent: 'OWL_CLASSIFICATION',
      ontologyReasoningRequired: true,
      ontologyProfile: 'OWL_DL',
      pgvectorAvailable: false,
    }));
    expect(classification.ontologyEngine).toBe('OWLREADY2_HERMIT');

    const consistency = planOntologyVectorExecution(base({
      intent: 'OWL_CONSISTENCY',
      ontologyReasoningRequired: true,
      ontologyProfile: 'OWL_DL',
      pgvectorAvailable: false,
    }));
    expect(consistency.ontologyEngine).toBe('OWLREADY2_PELLET');
  });

  it('prefers cuVS brute-force for mutation-sensitive bounded candidates', () => {
    const plan = planOntologyVectorExecution(base({
      exactResultRequired: true,
      mutationSensitive: true,
      candidateRowsAfterRelationalFilter: 10_000,
    }));
    expect(plan.preferredVectorExecutor).toBe('CUVS_BRUTE_FORCE');
    expect(plan.exactPromotionPreserved).toBe(true);
  });

  it('prefers CAGRA for larger hot GPU semantic workloads when exactness is not required', () => {
    const plan = planOntologyVectorExecution(base({
      corpusRows: 500_000,
      candidateRowsAfterRelationalFilter: 100_000,
      exactResultRequired: false,
      mutationSensitive: false,
      highUpdateRate: false,
    }));
    expect(plan.preferredVectorExecutor).toBe('CUVS_CAGRA');
    const cagra = plan.vectorCandidates.find((candidate) => candidate.executor === 'CUVS_CAGRA');
    expect(cagra?.exact).toBe(false);
    expect(cagra?.exactPromotionRequired).toBe(true);
    expect(cagra?.logicalLaneVoteAdded).toBe(false);
  });

  it('keeps pgvector HNSW and IVFFlat as separate ANN challengers', () => {
    const plan = planOntologyVectorExecution(base({ gpuAvailable: false, rapidsSidecarAvailable: false }));
    const hnsw = plan.vectorCandidates.find((candidate) => candidate.executor === 'PGVECTOR_HNSW');
    const ivf = plan.vectorCandidates.find((candidate) => candidate.executor === 'PGVECTOR_IVFFLAT');
    expect(hnsw?.eligible).toBe(true);
    expect(ivf?.eligible).toBe(true);
    expect(hnsw?.logicalLaneVoteAdded).toBe(false);
    expect(ivf?.logicalLaneVoteAdded).toBe(false);
  });

  it('routes large cold corpora to DiskANN SSD only as a challenger', () => {
    const plan = planOntologyVectorExecution(base({
      corpusRows: 5_000_000,
      candidateRowsAfterRelationalFilter: 2_000_000,
      gpuAvailable: false,
      rapidsSidecarAvailable: false,
      coldTierAvailable: true,
      highUpdateRate: false,
    }));
    expect(plan.preferredVectorExecutor).toBe('DISKANN_SSD');
    const disk = plan.vectorCandidates.find((candidate) => candidate.executor === 'DISKANN_SSD');
    expect(disk?.exact).toBe(false);
    expect(disk?.exactPromotionRequired).toBe(true);
  });

  it('treats PostgreSQL 18 AIO as scan plumbing, not a vector index algorithm', () => {
    expect(postgres18AioObservation('BITMAP_HEAP_SCAN').aioPotentiallyHelpful).toBe(true);
    expect(postgres18AioObservation('SEQUENTIAL_SCAN').aioPotentiallyHelpful).toBe(true);
    expect(postgres18AioObservation('PGVECTOR_HNSW').aioPotentiallyHelpful).toBe(false);
    expect(postgres18AioObservation('PGVECTOR_IVFFLAT').aioPotentiallyHelpful).toBe(false);
  });

  it('never fabricates structural coordinates and always preserves source provenance', () => {
    const plan = planOntologyVectorExecution(base());
    expect(plan.sourceRefPreserved).toBe(true);
    expect(plan.treeNodeIdPreservedWhenProven).toBe(true);
    expect(plan.fabricateMissingTreeNodeId).toBe(false);
  });
});
