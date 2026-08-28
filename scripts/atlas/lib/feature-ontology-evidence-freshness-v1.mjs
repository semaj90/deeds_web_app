import crypto from 'node:crypto';

export const EvidenceFreshnessClassification = Object.freeze({
  CURRENT_TUPLE_EVIDENCE_PROVEN: 'CURRENT_TUPLE_EVIDENCE_PROVEN',
  CURRENT_SOURCE_CONTENT_MISMATCH: 'CURRENT_SOURCE_CONTENT_MISMATCH',
  PACKET_CONTENT_LINEAGE_MISSING: 'PACKET_CONTENT_LINEAGE_MISSING',
  CURRENT_GRAPHIFY_SOURCE_MISSING: 'CURRENT_GRAPHIFY_SOURCE_MISSING',
  ALIAS_NOT_VERIFIED: 'ALIAS_NOT_VERIFIED',
  DUAL_NAMESPACE_COLLISION: 'DUAL_NAMESPACE_COLLISION',
  REGENERATE_ONTOLOGY_REQUIRED: 'REGENERATE_ONTOLOGY_REQUIRED',
});

const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function classifyFeatureOntologyEvidenceFreshness({
  tuple,
  packet = null,
  alias = null,
  graphify = null,
  currentWorkspaceRevision,
}) {
  const legacySourceRef = text(tuple?.source_ref);
  const canonicalSourceRef = text(alias?.canonicalSourceRef) || null;
  const aliasClassification = text(alias?.classification);
  const packetContentHash = text(packet?.content_hash) || null;
  const packetSourceRevision = text(packet?.source_revision) || null;
  const graphifyContentHash = text(graphify?.content_hash) || null;
  const graphifySourceRevision = text(graphify?.source_revision || graphify?.code_source_revision) || null;
  const workspaceRevision = text(graphify?.workspace_revision) || null;
  const contentMatch = Boolean(packetContentHash && graphifyContentHash && packetContentHash === graphifyContentHash);
  const sourceRevisionMatch = Boolean(packetSourceRevision && graphifySourceRevision && packetSourceRevision === graphifySourceRevision);
  let classification = EvidenceFreshnessClassification.PACKET_CONTENT_LINEAGE_MISSING;
  let reason = 'packet source/content lineage is unavailable; alias location is insufficient';
  if (aliasClassification === EvidenceFreshnessClassification.DUAL_NAMESPACE_COLLISION) {
    classification = EvidenceFreshnessClassification.DUAL_NAMESPACE_COLLISION;
    reason = 'legacy locator is also an observed root source; automatic aliasing is forbidden';
  } else if (!alias?.promotable) {
    classification = EvidenceFreshnessClassification.ALIAS_NOT_VERIFIED;
    reason = 'explicit alias has not reached durable VERIFIED status';
  } else if (!graphify || workspaceRevision !== text(currentWorkspaceRevision)) {
    classification = EvidenceFreshnessClassification.CURRENT_GRAPHIFY_SOURCE_MISSING;
    reason = 'no unique Graphify observation exists for the canonical current source';
  } else if (!packetContentHash || !packetSourceRevision) {
    classification = EvidenceFreshnessClassification.PACKET_CONTENT_LINEAGE_MISSING;
  } else if (!contentMatch || !sourceRevisionMatch) {
    classification = EvidenceFreshnessClassification.CURRENT_SOURCE_CONTENT_MISMATCH;
    reason = 'packet content/source revision does not match the current Graphify observation';
  } else {
    classification = EvidenceFreshnessClassification.CURRENT_TUPLE_EVIDENCE_PROVEN;
    reason = 'approved alias, current Graphify observation, packet content, and source revision agree';
  }
  return {
    tupleId: text(tuple?.id),
    packetKey: text(tuple?.packet_key) || null,
    legacySourceRef,
    canonicalSourceRef,
    aliasResolverRevision: text(alias?.resolverRevision) || null,
    tupleExtractorVersion: text(tuple?.extractor_version) || null,
    tupleOntologyVersion: text(tuple?.ontology_version) || null,
    packetContentHash,
    packetSourceRevision,
    graphifyContentHash,
    graphifySourceRevision,
    workspaceRevision: workspaceRevision || null,
    contentMatch,
    sourceRevisionMatch,
    classification,
    reason,
  };
}

export function summarizeFeatureOntologyEvidenceFreshness(rows) {
  const counts = Object.fromEntries(Object.values(EvidenceFreshnessClassification).map((key) => [key, 0]));
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  const fresh = rows.filter((row) => row.classification === EvidenceFreshnessClassification.CURRENT_TUPLE_EVIDENCE_PROVEN);
  return {
    counts,
    eligibleFreshUsesConceptTuples: fresh.length,
    eligibleFreshSelectionChecksum: sha256(fresh.map((row) => row.tupleId).sort().join('\n')),
  };
}
