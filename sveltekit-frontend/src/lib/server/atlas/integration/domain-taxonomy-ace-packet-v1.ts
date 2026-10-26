import {
  attachDomainClassificationHintToAcePacketV3,
  verifyAcePacketV3,
  type AcePacketV3,
} from '@deeds/parent-atlas';
import { buildRulesDomainClassificationV1 } from '../domain-classification-adapter-v1.js';
import { classifyDomainTaxonomy } from '../domain-taxonomy.js';

export type AcePacketDomainTaxonomyResultV1 = {
  status: 'ATTACHED' | 'NO_QUALIFIED_CLASSIFICATION' | 'ALREADY_PRESENT';
  packet: AcePacketV3;
};

export function attachDomainTaxonomyHintFromAcePacketV1(packetInput: unknown): AcePacketDomainTaxonomyResultV1 {
  const packet = verifyAcePacketV3(packetInput);
  if (packet.classification) return { status: 'ALREADY_PRESENT', packet };

  const summary = packet.semantic.data.summary;
  const sourceBoundSummary = summary.status === 'CURRENT'
    && summary.data.input_digest === packet.source.data.source_digest
    ? summary.data.text
    : null;
  const classification = classifyDomainTaxonomy({
    sourceRef: packet.identity.source_ref,
    featureId: packet.base.envelope.feature_id,
    summary: sourceBoundSummary,
  });
  if (!classification.primary_domain) return { status: 'NO_QUALIFIED_CLASSIFICATION', packet };

  const domainClassification = buildRulesDomainClassificationV1(classification, {
    canonicalId: packet.identity.packet_key,
    sourceRevision: packet.identity.source_revision,
  });
  if (domainClassification.evidenceRefs.length === 0) {
    return { status: 'NO_QUALIFIED_CLASSIFICATION', packet };
  }

  return {
    status: 'ATTACHED',
    packet: attachDomainClassificationHintToAcePacketV3(packet, domainClassification),
  };
}
