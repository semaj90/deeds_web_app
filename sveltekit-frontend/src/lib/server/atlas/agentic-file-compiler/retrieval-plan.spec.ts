import { describe, expect, it } from 'vitest';
import { classifyAtlasQuery } from './query-classifier.js';
import { buildQueryExpansionBundleV1 } from './query-expansion-v1.js';
import { buildQueryFingerprintV1 } from './query-fingerprint-v1.js';
import { buildRetrievalPlan, buildRetrievalPlanPhasesV1 } from './retrieval-plan.js';
import { compileTaxonomyScopeV1 } from './taxonomy-scope-v1.js';

describe('buildRetrievalPlan', () => {
  it('contains one semantic lane and no executor names', () => {
    const classification = classifyAtlasQuery({ requestId: 'r1', query: 'implement cache adapter using CAGRA evidence' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'w1' });
    expect(plan.lanes.filter((lane) => lane === 'semantic')).toHaveLength(1);
    expect(JSON.stringify(plan.lanes)).not.toMatch(/CAGRA|QDRANT|DISKANN|CUVS/);
  });

  it('carries taxonomy and expansion references without changing the semantic lane', () => {
    const classification = classifyAtlasQuery({ requestId: 'plan-1', query: 'semantic retrieval' });
    const scope = compileTaxonomyScopeV1({ classification, workspaceRevision: 'workspace:r1', taxonomyRevision: 'taxonomy:r1', ontologyRevision: 'ontology:r1' });
    const expansion = buildQueryExpansionBundleV1({ scope, literalTerms: classification.rawQuery.split(/\s+/), candidates: [] });
    const fingerprint = buildQueryFingerprintV1({ requestId: classification.requestId, query: classification.rawQuery, normalizerRevision: 'normalizer:v1', corpusRevision: 'corpus:r1', observedAt: '2026-09-06T00:00:00.000Z' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'workspace:r1', taxonomyScope: scope, queryExpansion: expansion, queryFingerprint: fingerprint, tokenBudget: 2048 });
    expect(plan.semanticRepresentation).toBe('semantic_768');
    expect(plan.taxonomyScopeChecksum).toBe(scope.checksum);
    expect(plan.queryExpansionChecksum).toBe(expansion.checksum);
    expect(plan.queryFingerprintRef).toBe(`query-fingerprint:${fingerprint.checksum}`);
    expect(plan.queryFingerprintChecksum).toBe(fingerprint.checksum);
    expect(plan.tokenBudget).toBe(2048);
  });

  it('attaches phased scheduling additive to the flat lane list (AFC-PLAN-01)', () => {
    const classification = classifyAtlasQuery({ requestId: 'plan-2', query: 'implement cache adapter using CAGRA evidence' });
    const plan = buildRetrievalPlan({ classification, workspaceRevision: 'w1' });
    expect(plan.phases).toBeDefined();
    const laneSetAcrossPhases = new Set(plan.phases!.flatMap((phase) => phase.lanes));
    expect([...laneSetAcrossPhases].sort()).toEqual([...plan.lanes].sort());
  });
});

describe('buildRetrievalPlanPhasesV1', () => {
  it('orders phases cheap -> structural -> expensive -> extraction-escalation', () => {
    const phases = buildRetrievalPlanPhasesV1({ lanes: ['graph', 'lexical', 'semantic', 'ast'] });
    expect(phases.map((phase) => phase.tier)).toEqual(['CHEAP_LEXICAL', 'STRUCTURAL', 'EXPENSIVE_SEMANTIC_GRAPH', 'EXTRACTION_ESCALATION']);
    expect(phases.find((phase) => phase.tier === 'EXPENSIVE_SEMANTIC_GRAPH')?.lanes.sort()).toEqual(['graph', 'semantic']);
  });

  it('always includes the EXTRACTION_ESCALATION phase with continueWhen ALWAYS, even with no lanes assigned to it', () => {
    const phases = buildRetrievalPlanPhasesV1({ lanes: ['lexical'] });
    const escalation = phases.find((phase) => phase.tier === 'EXTRACTION_ESCALATION');
    expect(escalation).toBeDefined();
    expect(escalation!.lanes).toEqual([]);
    expect(escalation!.continueWhen).toBe('ALWAYS');
  });

  it('clamps minConfidence into [0,1] and floors minCandidates at 1', () => {
    const phases = buildRetrievalPlanPhasesV1({ lanes: ['lexical'], minCandidates: 0, minConfidence: 5 });
    expect(phases[0]!.minCandidates).toBe(1);
    expect(phases[0]!.minConfidence).toBe(1);
  });
});
