#!/usr/bin/env node

/**
 * Canonical Feature Envelope Builder
 *
 * Shared runtime builder for Phase 8 envelope writers. This is the
 * JavaScript bridge used by the .mjs scripts so they do not depend on TS
 * compilation at runtime.
 *
 * Contract:
 * - required: packet_key, source_ref_key, feature_id, title_id, tree_node_id
 * - required: used_concepts (may be empty but must exist)
 * - recommended: qdrant_point_id, community_id, som_cluster, domain_class
 * - optional summary mirror: summary_embedding, summary_model, summary_generated_at
 */

function cleanText(value) {
  return String(value ?? '').trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function normalizeStringArray(...values) {
  const out = [];
  for (const value of values) {
    if (!value) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const text = cleanText(item);
      if (text) out.push(text);
    }
  }
  return [...new Set(out)];
}

function normalizeNumberArray(value) {
  if (value == null) return null;
  const raw = Array.isArray(value)
    ? value
    : ArrayBuffer.isView(value)
      ? Array.from(value)
      : typeof value === 'string'
        ? (() => {
            const trimmed = value.trim();
            if (!trimmed) return null;
            try {
              const parsed = JSON.parse(trimmed);
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          })()
        : null;

  if (!raw) return null;

  const numbers = raw
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));

  return numbers.length > 0 ? numbers : null;
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function canonicalFeatureId(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    if (/^(db|routes|ai|api|ui|graph|search|retrieval|packet)$/i.test(text)) continue;
    if (/^[a-z]{1,4}$/i.test(text) && !/[./:_-]/.test(text)) continue;
    return text;
  }
  return null;
}

export function buildCanonicalFeatureEnvelope(packet = {}) {
  const packetKey = firstText(packet.packet_key, packet.packetKey, packet.packet_id, packet.packetId) ?? '';
  const sourceRef = firstText(packet.source_ref, packet.sourceRef) ?? '';
  const sourceRefKey = firstText(
    packet.source_ref_key,
    packet.sourceRefKey,
    `${sourceRef}:${packetKey}`.trim(),
  ) ?? '';
  const featureId = canonicalFeatureId(packet.feature_id, packet.featureId) ?? '';
  const titleId = firstText(packet.title_id, packet.titleId, packet.feature_label, packet.featureLabel, featureId, packetKey);
  const treeNodeId = firstText(packet.tree_node_id, packet.treeNodeId);

  const usedConcepts = normalizeStringArray(
    packet.used_concepts,
    packet.usedConcepts,
    packet.concept_ids,
    packet.conceptIds,
    packet.keywords,
    packet.entities,
  );

  const summaryEmbedding = normalizeNumberArray(
    packet.summary_embedding ??
      packet.summaryEmbedding ??
      packet.summary_embedding_vector ??
      packet.summaryEmbeddingVector,
  );

  const envelope = {
    packet_key: packetKey,
    source_ref: sourceRef,
    source_ref_key: sourceRefKey,
    feature_id: featureId,
    feature_label: firstText(packet.feature_label, packet.featureLabel),
    title_id: titleId,
    tree_node_id: treeNodeId,
    domain_class: firstText(packet.domain_class, packet.domainClass),
    ontology_label: firstText(packet.ontology_label, packet.ontologyLabel),
    topology_label: firstText(packet.topology_label, packet.topologyLabel),
    used_concepts: usedConcepts,
    qdrant_point_id: packet.qdrant_point_id ?? packet.qdrantPointId ?? null,
    community_id: numberOrNull(packet.community_id, packet.communityId),
    graph_community_id: numberOrNull(packet.graph_community_id, packet.graphCommunityId),
    som_cluster: firstText(packet.som_cluster, packet.somCluster),
    som_row: numberOrNull(packet.som_row, packet.somRow),
    som_col: numberOrNull(packet.som_col, packet.somCol),
    page_rank_score: Number(packet.page_rank_score ?? packet.pageRankScore ?? 0) || 0,
    cheirank_score: Number(packet.cheirank_score ?? packet.cheirankScore ?? 0) || 0,
    summary: firstText(packet.summary),
    summary_embedding: summaryEmbedding,
    summary_model: firstText(packet.summary_model, packet.summaryModel),
    summary_generated_at: firstText(packet.summary_generated_at, packet.summaryGeneratedAt),
    created_at: packet.created_at ?? packet.createdAt ?? null,
    updated_at: packet.updated_at ?? packet.updatedAt ?? null,
  };

  const validation = {
    isValid: true,
    hardFailures: [],
    softWarnings: [],
  };

  for (const [field, value] of Object.entries({
    packet_key: envelope.packet_key,
    source_ref: envelope.source_ref,
    source_ref_key: envelope.source_ref_key,
    feature_id: envelope.feature_id,
  })) {
    if (!value) {
      validation.hardFailures.push(`${field}: required but missing or empty`);
      validation.isValid = false;
    }
  }

  if (!envelope.title_id) {
    validation.softWarnings.push('title_id: recommended but missing');
  }

  if (!envelope.tree_node_id) {
    validation.softWarnings.push('tree_node_id: recommended but missing');
  }

  if (!Array.isArray(envelope.used_concepts) || envelope.used_concepts.length === 0) {
    validation.softWarnings.push('used_concepts: recommended but missing');
  }

  for (const [field, value] of Object.entries({
    qdrant_point_id: envelope.qdrant_point_id,
    community_id: envelope.community_id,
    som_cluster: envelope.som_cluster,
    domain_class: envelope.domain_class,
    summary_embedding: envelope.summary_embedding,
  })) {
    if (value === null || value === undefined || value === '') {
      validation.softWarnings.push(`${field}: recommended but missing`);
    }
  }

  return { envelope, validation };
}

export function reportValidation(validation, packetKey) {
  if (validation?.hardFailures?.length > 0) {
    throw new Error(
      `Canonical envelope validation failed for ${packetKey}:\n${validation.hardFailures.join('\n')}`,
    );
  }

  if (validation?.softWarnings?.length > 0) {
    console.warn(`Canonical envelope warnings for ${packetKey}:`, validation.softWarnings);
  }
}
