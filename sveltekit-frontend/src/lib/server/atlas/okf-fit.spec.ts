import { describe, expect, it } from 'vitest';
import { buildOkfTopicAnalysis } from './okf-topic-ingestion.js';
import { classifyOkfFit, OKF_FIT_VERSION } from './okf-fit.js';

describe('okf fit classifier', () => {
  it('splits cheap naive bayes prior from the logistic fit gate', () => {
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

    expect(fit.classifier_version).toBe(OKF_FIT_VERSION);
    expect(fit.primary_domain).toBe('retrieval');
    expect(fit.naive_bayes_score).toBeGreaterThan(0);
    expect(fit.logistic_regression_score).toBeGreaterThanOrEqual(fit.naive_bayes_score);
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
    expect(fit.confidence).toBeLessThan(0.8);
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

    expect(okf.domain_classification.classifier_version).toBe(OKF_FIT_VERSION);
    expect(okf.nlp.hmm_observation?.observation).toMatch(/^OKF_FIT_/);
    expect(okf.nlp.hmm_observation?.stateHint).toBeDefined();
    expect(okf.nlp.hmm_observation?.metadata).toHaveProperty('logistic_regression_score');
  });
});
