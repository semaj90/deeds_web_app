import { describe, expect, it } from 'vitest';
import { buildOkfTopicAnalysis } from './okf-topic-ingestion.js';
import { classifyOkfFit, OKF_FIT_VERSION } from './okf-fit.js';
import { DOMAIN_TAXONOMY_VERSION } from './domain-taxonomy.js';

describe('okf fit classifier', () => {
  it('splits the heuristic prior from the heuristic fit gate (not naive bayes / logistic regression inference)', () => {
    const fit = classifyOkfFit({
      topicId: 'okf:topic:retrieval-fusion',
      featureId: 'research.okf_topics',
      title: 'Parent Atlas retrieval fusion and reranking',
      query: 'How should we wire canonical rerank ownership?',
      summary: 'This packet discusses retrieval, rerank, graph, and feature matrix promotion.',
      sourceTitles: ['Canonical rerank executor'],
      sourceSnippets: ['page rank, qdrant, mixedbread rerank'],
      sourceUrls: ['https://example.invalid/doc'],
      sourceEngine: 'ldr',
    });

    expect(fit.primary_domain).toBe('retrieval');
    expect(fit.heuristicPriorScore).toBeGreaterThan(0);
    expect(fit.heuristicFitScore).toBeGreaterThanOrEqual(fit.heuristicPriorScore);
    expect(fit.scoreSemantics).toEqual({ kind: 'HEURISTIC', range: [0, 1], calibrated: false, probability: false, learnedModel: false, producerRevision: OKF_FIT_VERSION });
    expect(['ACCEPT', 'REVIEW']).toContain(fit.fit_decision);
    expect(fit.evidence.length).toBeGreaterThan(0);
  });

  it('abstains on weak evidence', () => {
    const fit = classifyOkfFit({
      topicId: 'okf:topic:placeholder',
      featureId: 'research.okf_topics',
      title: 'misc notes',
      query: 'misc notes',
      summary: 'misc helper',
    });

    expect(fit.fit_decision).toBe('ABSTAIN');
    expect(fit.primary_domain).toBeNull();
    expect(fit.heuristicFitScore).toBeLessThan(0.55);
  });

  it('threads the fit result into OKF NLP provenance with an HMM observation', () => {
    const okf = buildOkfTopicAnalysis({
      topicId: 'okf:topic:phase27',
      featureId: 'research.okf_topics',
      title: 'Parent Atlas phase 27 fit gate',
      query: 'logistic regression fit gate for okf routing',
      summary: 'Route OKF topics with calibrated fit and preserve provenance.',
      sourceTitles: ['Phase 27 design note'],
      sourceSnippets: ['HMM observation and provenance ladder'],
      sourceEngine: 'ldr',
      authorityClass: 'generated',
    });

    // BEST-FIT-SCORE-SEMANTICS-02: classifier_version is now the REAL domain-taxonomy version,
    // no longer clobbered by the heuristic's own OKF_FIT_VERSION (BEST-FIT-SCORE-AUDIT-01 finding
    // #2). The heuristic's own revision lives under heuristic_fit_revision instead.
    expect(okf.domain_classification.classifier_version).toBe(DOMAIN_TAXONOMY_VERSION);
    expect(okf.domain_classification.heuristic_fit_revision).toBe(OKF_FIT_VERSION);
    expect(okf.nlp.hmm_observation?.observation).toMatch(/^OKF_FIT_/);
    expect(okf.nlp.hmm_observation?.stateHint).toBeDefined();
    expect(okf.nlp.hmm_observation?.metadata).toHaveProperty('heuristic_fit_score');
    expect(okf.feature_source_manifest?.provenCount).toBe(3);
    expect(okf.feature_source_manifest?.readyForFeatureMatrix).toBe(false);
    expect(okf.feature_source_manifest?.fields.map((field) => field.name)).toEqual([
      'authority_norm',
      'domain_fit',
      'ast_signal',
      'entropy_norm',
      'execution_utility',
    ]);
  });

  describe('BEST-FIT-SCORE-SEMANTICS-02 regression: exact formula + thresholds frozen', () => {
    it('freezes the 0.80/0.55 heuristicFitScore decision boundary', () => {
      const strong = classifyOkfFit({
        topicId: 'okf:topic:boundary-strong',
        featureId: 'research.okf_topics',
        title: 'retrieval rerank qdrant pagerank bm25 rag',
        query: 'retrieval rerank qdrant pagerank bm25 rag hybrid dense sparse',
        summary: 'retrieval rerank qdrant pagerank bm25 rag hybrid dense sparse candidate score rank',
      });
      expect(strong.heuristicFitScore >= 0.8 ? 'ACCEPT' : strong.heuristicFitScore >= 0.55 ? 'REVIEW' : 'ABSTAIN').toBe(strong.fit_decision);

      const weak = classifyOkfFit({
        topicId: 'okf:topic:boundary-weak',
        featureId: 'research.okf_topics',
        title: 'x',
        query: 'x',
        summary: 'x',
      });
      expect(weak.fit_decision).toBe('ABSTAIN');
      expect(weak.heuristicFitScore).toBeLessThan(0.55);
    });

    it('keeps deprecated snake_case aliases exactly in sync with the renamed fields', () => {
      const fit = classifyOkfFit({
        topicId: 'okf:topic:alias-sync',
        featureId: 'research.okf_topics',
        title: 'retrieval graph search',
        query: 'retrieval graph search',
        summary: 'retrieval graph search candidate ranking',
      });
      expect(fit.naive_bayes_score).toBe(fit.heuristicPriorScore);
      expect(fit.logistic_regression_score).toBe(fit.heuristicFitScore);
      expect(fit.fit_margin).toBe(fit.heuristicFitMargin);
      expect(fit.heuristicFitMargin).toBe(fit.heuristicFitScore - fit.heuristicPriorScore);
    });

    it('never clobbers classifyDomainTaxonomy confidence/version with the heuristic values', () => {
      const fit = classifyOkfFit({
        topicId: 'okf:topic:provenance',
        featureId: 'research.okf_topics',
        title: 'retrieval graph search',
        query: 'retrieval graph search',
        summary: 'retrieval graph search candidate ranking',
      });
      expect(fit.confidence).toBe(fit.domainTaxonomyConfidence);
      expect(fit.classifier_version).toBe(fit.domainTaxonomyRevision);
      expect(fit.classifier_version).toBe(DOMAIN_TAXONOMY_VERSION);
      // The heuristic's own score/revision must NOT overwrite these.
      expect(fit.confidence).not.toBe(fit.heuristicFitScore);
    });
  });
});
