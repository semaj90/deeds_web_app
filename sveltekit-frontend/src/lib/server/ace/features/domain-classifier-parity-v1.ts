import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainClassifier } from './domain-classifier.js';
import { classifyDomainTaxonomy, DOMAIN_TAXONOMY_VERSION } from '$lib/server/atlas/domain-taxonomy.js';

export const DOMAIN_CLASSIFIER_PARITY_REVISION = 'ace-domain-classifier-parity-v1';

export const REAL_CORPUS_FIXTURE_V1 = [
  'src/lib/server/ace/features/domain-classifier.ts',
  'src/lib/server/atlas/domain-taxonomy.ts',
  'src/lib/server/search/qdrant-search.ts',
  'src/lib/server/atlas/semantic-signal-routing.ts',
  'src/lib/server/ace/ace-context-manifest.ts',
  'src/routes/api/atlas/domain-taxonomy/classify/+server.ts',
] as const;

export interface DomainClassifierParityRowV1 {
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  aceLabel: string;
  taxonomyLabel: string;
  aceConfidence: number;
  taxonomyConfidence: number;
  exactMatch: boolean;
  missingLabels: string[];
}

export interface DomainClassifierParityReportV1 {
  schema: 'atlas.domain-classifier-parity.v1';
  status: 'ACE_DOMAIN_CLASSIFIER_PARITY_PROVEN' | 'PARITY_REVIEW_REQUIRED';
  evidenceClass: 'REAL_CORPUS_FIXTURE';
  parityRevision: typeof DOMAIN_CLASSIFIER_PARITY_REVISION;
  aceClassifierRevision: 'ace-domain-classifier:rules-v1';
  taxonomyRevision: typeof DOMAIN_TAXONOMY_VERSION;
  fixture: { kind: 'CHECKED_IN_SOURCE_FILES'; rowCount: number; sourceRefs: string[] };
  exactMatches: number;
  disagreements: Array<{
    sourceRef: string;
    sourceRevision: string;
    contentDigest: string;
    aceLabel: string;
    taxonomyLabel: string;
    aceConfidence: number;
    taxonomyConfidence: number;
  }>;
  missingLabels: Array<{
    sourceRef: string;
    sourceRevision: string;
    contentDigest: string;
    missingIn: string;
    label: string;
  }>;
  rows: DomainClassifierParityRowV1[];
  canonicalAuthority: false;
  writesPerformed: false;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function buildDomainClassifierParityReport(repoRoot = resolve(process.cwd())): DomainClassifierParityReportV1 {
  const ace = new DomainClassifier();
  const rows = REAL_CORPUS_FIXTURE_V1.map((sourceRef) => {
    const content = readFileSync(resolve(repoRoot, sourceRef), 'utf8');
    const sourceRevision = sha256(content);
    const aceLabel = ace.classifyByContent(content);
    const taxonomy = classifyDomainTaxonomy({ sourceRef, summary: content });
    const taxonomyLabel = taxonomy.primary_domain ?? taxonomy.fallback_label ?? '';
    const missingLabels = [
      ...(aceLabel === 'unknown' ? ['ace'] : []),
      ...(taxonomyLabel === 'general' || !taxonomyLabel ? ['taxonomy'] : []),
    ];
    return {
      sourceRef,
      sourceRevision,
      contentDigest: sourceRevision,
      aceLabel,
      taxonomyLabel,
      aceConfidence: aceLabel === 'unknown' ? 0 : 1,
      taxonomyConfidence: taxonomy.confidence,
      exactMatch: aceLabel === taxonomyLabel,
      missingLabels,
    } satisfies DomainClassifierParityRowV1;
  });
  const disagreements = rows.filter((row) => !row.exactMatch).map(({ sourceRef, sourceRevision, contentDigest, aceLabel, taxonomyLabel, aceConfidence, taxonomyConfidence }) => ({
    sourceRef,
    sourceRevision,
    contentDigest,
    aceLabel,
    taxonomyLabel,
    aceConfidence,
    taxonomyConfidence,
  }));
  const missingLabels = rows.flatMap((row) => row.missingLabels.map((missingIn) => ({
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    contentDigest: row.contentDigest,
    missingIn,
    label: missingIn === 'ace' ? row.aceLabel : row.taxonomyLabel,
  })));
  return {
    schema: 'atlas.domain-classifier-parity.v1',
    status: disagreements.length === 0 && missingLabels.length === 0 ? 'ACE_DOMAIN_CLASSIFIER_PARITY_PROVEN' : 'PARITY_REVIEW_REQUIRED',
    evidenceClass: 'REAL_CORPUS_FIXTURE',
    parityRevision: DOMAIN_CLASSIFIER_PARITY_REVISION,
    aceClassifierRevision: 'ace-domain-classifier:rules-v1',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    fixture: { kind: 'CHECKED_IN_SOURCE_FILES', rowCount: rows.length, sourceRefs: [...REAL_CORPUS_FIXTURE_V1] },
    exactMatches: rows.filter((row) => row.exactMatch).length,
    disagreements,
    missingLabels,
    rows,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export interface DomainClassifierTrainingReadinessV1 {
  schema: 'atlas.domain-classifier-training-readiness.v1';
  status: 'DOMAIN_CLASSIFIER_TRAINING_READY' | 'DOMAIN_CLASSIFIER_TRAINING_READY_FALSE';
  operatorApprovedRuleProvided: boolean;
  corpusRows: number;
  observedClassCount: number;
  reason: 'OPERATOR_MINIMUM_CORPUS_AND_CLASS_COVERAGE_REQUIRED' | 'OPERATOR_MINIMUM_SATISFIED';
  canonicalAuthority: false;
  writesPerformed: false;
}

export function evaluateDomainClassifierTrainingReadinessV1(input: {
  corpusRows: number;
  observedClassCount: number;
  operatorMinimum?: { corpusRows: number; classCount: number };
}): DomainClassifierTrainingReadinessV1 {
  const rule = input.operatorMinimum;
  const ready = Boolean(rule && input.corpusRows >= rule.corpusRows && input.observedClassCount >= rule.classCount);
  return {
    schema: 'atlas.domain-classifier-training-readiness.v1',
    status: ready ? 'DOMAIN_CLASSIFIER_TRAINING_READY' : 'DOMAIN_CLASSIFIER_TRAINING_READY_FALSE',
    operatorApprovedRuleProvided: Boolean(rule),
    corpusRows: input.corpusRows,
    observedClassCount: input.observedClassCount,
    reason: ready ? 'OPERATOR_MINIMUM_SATISFIED' : 'OPERATOR_MINIMUM_CORPUS_AND_CLASS_COVERAGE_REQUIRED',
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
