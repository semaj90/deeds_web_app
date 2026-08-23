import { createHash } from 'node:crypto';
import type { NlpFeature } from './miniforge-nlp-sidecar.js';

export interface NlpObservationContextV1 {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  providerRevision: string;
  producerRevision: string;
}

export interface LineageQualifiedNlpFeatureV1 extends NlpFeature {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  providerRevision: string;
  producerRevision: string;
  evidenceKey: string;
  lineageQualified: true;
}

export interface LegacyNlpFeatureV1 extends NlpFeature {
  sourceRef?: undefined;
  workspaceRevision?: undefined;
  sourceRevision?: undefined;
  providerRevision?: undefined;
  producerRevision?: undefined;
  evidenceKey?: undefined;
  lineageQualified: false;
}

export type NormalizedNlpFeatureV1 = LineageQualifiedNlpFeatureV1 | LegacyNlpFeatureV1;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function stableEvidenceKey(feature: NlpFeature, context: NlpObservationContextV1): string {
  const payload = [
    'nlp-observation',
    context.sourceRef,
    context.workspaceRevision,
    context.sourceRevision,
    context.providerRevision,
    context.producerRevision,
    feature.source,
    feature.ruleId ?? feature.kind,
    feature.name,
    feature.byteStart ?? -1,
    feature.byteEnd ?? -1,
  ].join('\u001f');
  return `nlp:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

export function qualifyNlpFeatureV1(
  feature: NlpFeature,
  context?: NlpObservationContextV1,
): NormalizedNlpFeatureV1 {
  if (!context) return { ...feature, lineageQualified: false };

  for (const [key, value] of Object.entries(context)) {
    if (!nonEmpty(value)) throw new Error(`NLP_OBSERVATION_CONTEXT_REQUIRED:${key}`);
  }

  return {
    ...feature,
    ...context,
    evidenceKey: stableEvidenceKey(feature, context),
    lineageQualified: true,
  };
}

export function qualifyNlpFeaturesV1(
  features: readonly NlpFeature[],
  context?: NlpObservationContextV1,
): NormalizedNlpFeatureV1[] {
  return features.map((feature) => qualifyNlpFeatureV1(feature, context));
}
