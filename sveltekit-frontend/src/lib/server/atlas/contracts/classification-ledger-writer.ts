import { appendOutcomeLedger } from '$lib/server/observability/outcome-ledger.js';
import type { FeatureMatrixRowV1 } from '../feature-matrix-schema.js';
import type { ValidationResultV1 } from './validation-result-v1.js';
import type { ClassificationEnvelopeV1 } from './classification-envelope-v1.js';

export type ClassificationOutcomeLedgerEvent = Record<string, unknown> & {
  type: 'observation';
  source: 'classification-envelope';
  schema_version: 'atlas.classification-ledger-event.v1';
  packet_key: string;
  source_ref: string;
  content_hash: string;
  workspace_revision: string;
  feature_id: string;
  feature_label: string;
  tree_node_id: string | null;
  domain_class: string | null;
  secondary_domains: string[];
  lane_status: string;
  evidence_state: string;
  knowledge_resolution: string;
  part_of_speech: string | null;
  ontology_ids: string[];
  concept_ids: string[];
  runtime_evidence_refs: string[];
  test_evidence_refs: string[];
  validated_by: string | null;
  validation_layer: string | null;
  can_promotion: ValidationResultV1['canPromotion'] | null;
  is_valid: boolean | null;
  reward_reason: string | null;
};

export function buildClassificationOutcomeLedgerEvent(input: {
  classification: ClassificationEnvelopeV1;
  featureRow?: FeatureMatrixRowV1 | null;
  validation?: ValidationResultV1 | null;
  reward?: number | null;
  rewardReason?: string | null;
  outcome?: string | null;
}): ClassificationOutcomeLedgerEvent {
  const featureRow = input.featureRow ?? null;
  return {
    type: 'observation',
    source: 'classification-envelope',
    schema_version: 'atlas.classification-ledger-event.v1',
    packet_key: input.classification.identity.packetKey,
    source_ref: input.classification.identity.sourceRef,
    content_hash: input.classification.identity.contentHash,
    workspace_revision: input.classification.identity.workspaceRevision,
    feature_id: input.classification.identity.featureId,
    feature_label: input.classification.identity.featureLabel,
    tree_node_id: input.classification.identity.treeNodeId ?? featureRow?.identity.tree_node_id ?? null,
    domain_class: input.classification.signals.domainClass ?? featureRow?.domain_class ?? null,
    secondary_domains: [...(input.classification.signals.secondaryDomains ?? [])],
    lane_status: input.classification.signals.laneStatus,
    evidence_state: input.classification.signals.evidenceState,
    knowledge_resolution: input.classification.signals.knowledgeResolution,
    part_of_speech: input.classification.signals.partOfSpeech ?? featureRow?.lexical?.part_of_speech ?? null,
    ontology_ids: [...input.classification.signals.ontologyIds],
    concept_ids: [...input.classification.signals.conceptIds],
    runtime_evidence_refs: [...input.classification.signals.runtimeEvidenceRefs],
    test_evidence_refs: [...input.classification.signals.testEvidenceRefs],
    validated_by: input.validation?.validatedBy ?? null,
    validation_layer: input.validation?.projections?.postgres?.layer ?? null,
    can_promotion: input.validation?.canPromotion ?? null,
    is_valid: input.validation?.isValid ?? null,
    reward: input.reward ?? null,
    reward_reason: input.rewardReason ?? null,
    outcome: input.outcome ?? null,
    validation_snapshot: input.validation ?? null,
    representation_names: Object.entries(input.classification.representations ?? {})
      .filter(([, value]) => Boolean(value))
      .map(([name]) => name),
    provenance: input.classification.provenance,
  };
}

export async function appendClassificationOutcomeLedger(input: {
  classification: ClassificationEnvelopeV1;
  featureRow?: FeatureMatrixRowV1 | null;
  validation?: ValidationResultV1 | null;
  reward?: number | null;
  rewardReason?: string | null;
  outcome?: string | null;
}): Promise<void> {
  await appendOutcomeLedger(buildClassificationOutcomeLedgerEvent(input));
}
