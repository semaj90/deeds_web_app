import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildSummaryContext,
  classifyDomain,
  classifyOntology,
  classifyTopology,
  formatSummaryContext,
} from '../core/summary-context.js';

export interface Gemma4SummaryPacket {
  packet_type: 'gemma4_summary_packet';
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string | null;
  domain_class: string | null;
  ontology_label: string | null;
  topology_label: string | null;
  summary: string;
  tags: string[];
  packet_context: ReturnType<typeof buildSummaryContext>;
  provenance: {
    source: 'atlas_packets';
    generated_at: string;
    worker: string;
    model: string;
  };
  summary_packet_key: string;
  qdrant_payload: {
    packet_key: string;
    source_ref: string;
    feature_id: string;
    feature_label: string | null;
    domain_class: string | null;
    ontology_label: string | null;
    topology_label: string | null;
  };
}

export interface Chrom97SummaryPacket {
  packet_type: 'chrom97';
  packet_key: string;
  source_ref: string;
  canonical_source_ref: string;
  feature_id: string;
  feature_label: string;
  domain_class: string;
  ontology_label: string;
  topology_label: string;
  summary: string;
  summary_packet_key: string;
  tags: string[];
  lane_ids: string[];
  metadata: Record<string, unknown>;
  topology: Record<string, unknown>;
  vectors: Record<string, unknown>;
  enrichment: Record<string, unknown>;
  provenance: Record<string, unknown>;
  packet_id?: string;
  record_hash?: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      const normalized = stableJson((value as Record<string, unknown>)[key]);
      if (normalized !== undefined) acc[key] = normalized as unknown;
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJson(value ?? null));
}

function dedupe(values: unknown[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

export function makeGemma4SummaryPacket(row: Record<string, unknown>, index = 0): Gemma4SummaryPacket {
  const summary = normalizeText(row.summary);
  const summaryContext = (row.packet_context && typeof row.packet_context === 'object')
    ? (row.packet_context as ReturnType<typeof buildSummaryContext>)
    : buildSummaryContext(row);
  const featureId = normalizeText(row.feature_id || (row.packet_context as Record<string, unknown> | undefined)?.feature_id || `gemma4.summary.${index + 1}`);
  const featureLabel = normalizeText(row.feature_label || (row.packet_context as Record<string, unknown> | undefined)?.feature_label || path.basename(String(row.source_ref || `summary-${index + 1}`)));
  const sourceRef = normalizeText(row.source_ref || (row.packet_context as Record<string, unknown> | undefined)?.source_ref || '');
  const canonicalSourceRef = normalizeText(row.canonical_source_ref || sourceRef);
  const packetKey = normalizeText(row.packet_key || row.summary_packet_key || sha256(`${sourceRef}:${featureId}`).slice(0, 16));
  const domainClass = normalizeText(row.domain_class || (row.packet_context as Record<string, unknown> | undefined)?.domain_class || 'codebase');
  const ontologyLabel = normalizeText(row.ontology_label || (row.packet_context as Record<string, unknown> | undefined)?.ontology_label || 'semantic_enrichment');
  const topologyLabel = normalizeText(row.topology_label || (row.packet_context as Record<string, unknown> | undefined)?.topology_label || 'codebase_layer');
  const tags = dedupe([...(Array.isArray(row.tags) ? row.tags : []), domainClass, ontologyLabel, topologyLabel, 'gemma4']);

  return {
    packet_type: 'gemma4_summary_packet',
    packet_key: packetKey,
    source_ref: sourceRef,
    feature_id: featureId,
    feature_label: featureLabel || null,
    domain_class: domainClass || null,
    ontology_label: ontologyLabel || null,
    topology_label: topologyLabel || null,
    summary,
    tags,
    packet_context: summaryContext,
    provenance: {
      source: 'atlas_packets',
      generated_at: new Date().toISOString(),
      worker: 'packages-parent-atlas-summary-packets',
      model: 'gemma4-legal-iq4xs-direct.gguf',
    },
    summary_packet_key: normalizeText(row.summary_packet_key || `${packetKey}:summary`),
    qdrant_payload: {
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      feature_label: featureLabel || null,
      domain_class: domainClass || null,
      ontology_label: ontologyLabel || null,
      topology_label: topologyLabel || null,
    },
  };
}

export function makeChrom97Packet(row: Record<string, unknown>, index = 0): Chrom97SummaryPacket {
  const summary = normalizeText(row.summary);
  const summaryContext = (row.packet_context && typeof row.packet_context === 'object')
    ? (row.packet_context as ReturnType<typeof buildSummaryContext>)
    : buildSummaryContext(row);
  const featureId = firstText(row.feature_id, (row.packet_context as Record<string, unknown> | undefined)?.feature_id, `gemma4.summary.${index + 1}`);
  const featureLabel = firstText(row.feature_label, (row.packet_context as Record<string, unknown> | undefined)?.feature_label, path.basename(String(row.source_ref || `summary-${index + 1}`)));
  const sourceRef = firstText(row.source_ref, (row.packet_context as Record<string, unknown> | undefined)?.source_ref);
  const canonicalSourceRef = firstText(row.canonical_source_ref, sourceRef);
  const packetKey = firstText(row.packet_key, row.summary_packet_key, sha256(`${sourceRef}:${featureId}`).slice(0, 16));
  const domainClass = firstText(row.domain_class, (row.packet_context as Record<string, unknown> | undefined)?.domain_class, classifyDomain(sourceRef, featureId, summary), 'codebase');
  const ontologyLabel = firstText(row.ontology_label, (row.packet_context as Record<string, unknown> | undefined)?.ontology_label, classifyOntology(sourceRef, featureId));
  const topologyLabel = firstText(row.topology_label, (row.packet_context as Record<string, unknown> | undefined)?.topology_label, classifyTopology(sourceRef, featureId, domainClass));
  const tags = dedupe([...(Array.isArray(row.tags) ? row.tags : []), domainClass, ontologyLabel, topologyLabel, 'chrom97', 'gemma4']);

  const packet: Chrom97SummaryPacket = {
    packet_type: 'chrom97',
    packet_key: packetKey,
    source_ref: sourceRef,
    canonical_source_ref: canonicalSourceRef,
    feature_id: featureId,
    feature_label: featureLabel,
    domain_class: domainClass,
    ontology_label: ontologyLabel,
    topology_label: topologyLabel,
    summary,
    summary_packet_key: firstText(row.summary_packet_key, `${packetKey}:summary`),
    tags,
    lane_ids: dedupe(['ACE', 'KAG', 'DAG', 'RLM', 'chrom97', domainClass, topologyLabel]),
    metadata: {
      repo_root: 'deeds-web-app',
      app_root: 'sveltekit-frontend',
      file_path: firstText((summaryContext as Record<string, unknown>).file_path, row.file_path, sourceRef),
      directory_path: firstText((summaryContext as Record<string, unknown>).directory_path, row.directory_path, path.posix.dirname(sourceRef || '.')),
      summary_source: 'gemma4-summary-packets.ndjson',
      summary_source_packet_key: firstText(row.summary_packet_key, `${packetKey}:summary`),
      generated_at: new Date().toISOString(),
    },
    topology: {
      community_id: (row.community_id as number | null) ?? null,
      cluster_key: (row.cluster_key as string | null) ?? null,
      som_cluster: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).som_cluster : null) ?? row.som_cluster ?? null,
      som_x: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).som_x : null) ?? null,
      som_y: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).som_y : null) ?? null,
      pagerank: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).pagerank : null) ?? null,
      ae_distance: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).ae_distance : null) ?? null,
      topology_version: (row.topology && typeof row.topology === 'object' ? (row.topology as Record<string, unknown>).topology_version : null) ?? null,
    },
    vectors: {
      embedding_384: row.vectors && typeof row.vectors === 'object' ? (row.vectors as Record<string, unknown>).embedding_384 ?? null : null,
      latent_128: row.vectors && typeof row.vectors === 'object' ? (row.vectors as Record<string, unknown>).latent_128 ?? null : null,
      latent_64: row.vectors && typeof row.vectors === 'object' ? (row.vectors as Record<string, unknown>).latent_64 ?? null : null,
    },
    enrichment: {
      concepts: Array.isArray(row.enrichment && typeof row.enrichment === 'object' ? (row.enrichment as Record<string, unknown>).concepts : null)
        ? (row.enrichment as Record<string, unknown>).concepts
        : [],
      langextract_terms: Array.isArray(row.enrichment && typeof row.enrichment === 'object' ? (row.enrichment as Record<string, unknown>).langextract_terms : null)
        ? (row.enrichment as Record<string, unknown>).langextract_terms
        : [],
      top10_neighbors: Array.isArray(row.enrichment && typeof row.enrichment === 'object' ? (row.enrichment as Record<string, unknown>).top10_neighbors : null)
        ? (row.enrichment as Record<string, unknown>).top10_neighbors
        : [],
      fusion_sources: Array.isArray(row.enrichment && typeof row.enrichment === 'object' ? (row.enrichment as Record<string, unknown>).fusion_sources : null)
        ? (row.enrichment as Record<string, unknown>).fusion_sources
        : ['gemma4', 'chrom97'],
    },
    provenance: {
      source: 'gemma4-summary-export',
      worker: 'materialize-gemma4-summary-chrom97',
      generated_at: new Date().toISOString(),
      summary_packet_key: firstText(row.summary_packet_key, `${packetKey}:summary`),
    },
  };

  packet.packet_id = sha256(`${packet.packet_key}:${packet.source_ref}:${packet.feature_id}`).slice(0, 16);
  packet.record_hash = sha256(stableStringify(packet));
  return packet;
}

export function toNdjsonLine(value: unknown): string {
  return stableStringify(value);
}

export { buildSummaryContext, classifyDomain, classifyOntology, classifyTopology, formatSummaryContext };
