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

export interface GroundedNlpFactInputV1 {
  feature: NlpFeature;
  context: NlpObservationContextV1;
  sourceBytes: Uint8Array;
  taskRef: string;
  canonicalTaskRef: string;
  taskRevision: string;
  evidenceCardChecksum: string;
}

export interface GroundedNlpFactV1 {
  schema: 'atlas.grounded-nlp-fact.v1';
  factId: string;
  taskRef: string;
  canonicalTaskRef: string;
  taskRevision: string;
  evidenceCardChecksum: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  extractorRevision: string;
  extractorKind: NlpFeature['source'];
  featureKind: string;
  featureName: string;
  proposedLabel: string;
  surfaceText: string;
  confidence: number | null;
  evidenceSpan: { byteStart: number; byteEnd: number; textSha256: string };
  evidenceKey: string;
  canonicalAuthority: false;
  ontologyPromotionAllowed: false;
}

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
  if (!context) {
    // Legacy observations must not retain partial lineage fields that could
    // be mistaken for a qualified source binding.
    const { sourceRef, sourceRevision, providerRevision, evidenceKey, ...legacy } = feature;
    void sourceRef;
    void sourceRevision;
    void providerRevision;
    void evidenceKey;
    return { ...legacy, lineageQualified: false };
  }

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

export function groundNlpFeatureV1(input: GroundedNlpFactInputV1): GroundedNlpFactV1 {
  const { feature, context, sourceBytes } = input;
  if (!input.taskRef || !input.canonicalTaskRef || !input.taskRevision || !input.evidenceCardChecksum) {
    throw new Error('GROUNDED_NLP_TASK_BINDING_REQUIRED');
  }
  const digestPattern = /^sha256:[a-f0-9]{64}$/;
  if (!digestPattern.test(context.sourceRevision) || !digestPattern.test(input.taskRevision) || !digestPattern.test(input.evidenceCardChecksum)) {
    throw new Error('GROUNDED_NLP_SHA256_BINDING_REQUIRED');
  }
  const sourceDigest = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
  if (sourceDigest !== context.sourceRevision) throw new Error('GROUNDED_NLP_SOURCE_REVISION_MISMATCH');
  if (feature.sourceRef != null && feature.sourceRef !== context.sourceRef) throw new Error('GROUNDED_NLP_SOURCE_REF_MISMATCH');
  if (feature.sourceRevision != null && feature.sourceRevision !== context.sourceRevision) throw new Error('GROUNDED_NLP_FEATURE_SOURCE_REVISION_MISMATCH');
  if (feature.providerRevision != null && feature.providerRevision !== context.providerRevision) throw new Error('GROUNDED_NLP_PROVIDER_REVISION_MISMATCH');
  if (!Number.isInteger(feature.byteStart) || !Number.isInteger(feature.byteEnd)
    || feature.byteStart! < 0 || feature.byteEnd! <= feature.byteStart! || feature.byteEnd! > sourceBytes.byteLength) {
    throw new Error('GROUNDED_NLP_BYTE_SPAN_INVALID');
  }
  if (typeof feature.rawText !== 'string' || feature.rawText.length === 0) throw new Error('GROUNDED_NLP_SPAN_TEXT_REQUIRED');
  const spanBytes = sourceBytes.slice(feature.byteStart, feature.byteEnd);
  if (!Buffer.from(spanBytes).equals(Buffer.from(feature.rawText, 'utf8'))) throw new Error('GROUNDED_NLP_SPAN_TEXT_MISMATCH');
  const textSha256 = createHash('sha256').update(spanBytes).digest('hex');
  const lineage = qualifyNlpFeatureV1(feature, context);
  if (!lineage.lineageQualified) throw new Error('GROUNDED_NLP_LINEAGE_NOT_QUALIFIED');
  const body = {
    schema: 'atlas.grounded-nlp-fact.v1' as const,
    taskRef: input.taskRef,
    canonicalTaskRef: input.canonicalTaskRef,
    taskRevision: input.taskRevision,
    evidenceCardChecksum: input.evidenceCardChecksum,
    sourceRef: context.sourceRef,
    sourceRevision: context.sourceRevision,
    workspaceRevision: context.workspaceRevision,
    extractorRevision: context.producerRevision,
    extractorKind: feature.source,
    featureKind: feature.kind,
    featureName: feature.name,
    proposedLabel: feature.name,
    surfaceText: feature.rawText,
    confidence: feature.confidence ?? null,
    evidenceSpan: { byteStart: feature.byteStart!, byteEnd: feature.byteEnd!, textSha256 },
    evidenceKey: lineage.evidenceKey,
    canonicalAuthority: false as const,
    ontologyPromotionAllowed: false as const,
  };
  const factDigest = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
  return { ...body, factId: `grounded-nlp:${factDigest}` };
}
