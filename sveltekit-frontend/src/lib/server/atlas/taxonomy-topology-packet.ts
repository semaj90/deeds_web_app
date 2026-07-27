import { z } from 'zod';
import { writeAcePacket, makeQueryHash, type AceFullPacket } from '$lib/server/ace/ace-packet-store.js';
import { pool } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';
import { selectClassifierTier } from './atlas-knowledge-envelope.js';

export const TaxonomyTupleSchema = z.object({
  source: z.string().min(1),
  relation: z.enum(['PARENT_OF', 'CHILD_OF', 'SAME_SOM_CLUSTER', 'IN_KMEANS_CLUSTER', 'HAS_ONTOLOGY_TAG']),
  target: z.string().min(1),
});

export const TaxonomyClassifierEvidenceSchema = z.object({
  domainClass: z.string().nullable(),
  domainConfidence: z.number().min(0).max(1).nullable(),
  domainClassifierTier: z.enum(['deterministic', 'naive_bayes', 'xgboost', 'llm_fallback']).nullable(),
  evidenceSource: z.enum(['metadata', 'cluster_summary', 'missing']),
});

export const TaxonomyCentroidEvidenceSchema = z.object({
  redisCentroidCount: z.number().int().nonnegative(),
  redisCentroidDim: z.number().int().positive().nullable(),
  redisCentroidTrainedAt: z.string().nullable(),
  clusterSummaryAvailable: z.boolean(),
  centroidDistanceMean: z.number().nullable(),
  karpathyBlendMax: z.number().nullable(),
});

export const TaxonomyTopologyPacketSummarySchema = z.object({
  featureId: z.string().min(1),
  nodeKey: z.string().min(1),
  displayName: z.string().min(1),
  level: z.number().int().nonnegative(),
  parentKey: z.string().nullable(),
  taxonomyPath: z.array(
    z.object({
      node_key: z.string().min(1),
      level: z.number().int().nonnegative(),
      display_name: z.string().min(1),
    })
  ),
  childCount: z.number().int().nonnegative(),
  topChildren: z.array(
    z.object({
      node_key: z.string().min(1),
      level: z.number().int().nonnegative(),
      display_name: z.string().min(1),
      member_count: z.number().int().nonnegative(),
    })
  ),
  topology: z.object({
    somCluster: z.string().nullable(),
    somRow: z.number().int().min(0).max(19).nullable(),
    somCol: z.number().int().min(0).max(19).nullable(),
    neighborCells: z.array(z.tuple([z.number(), z.number()])),
    kmeansClusters: z.array(z.number().int().nonnegative()),
    ontologyTags: z.array(z.string().min(1)),
  }),
  linkedTuples: z.array(TaxonomyTupleSchema),
  classifier: TaxonomyClassifierEvidenceSchema,
  centroid: TaxonomyCentroidEvidenceSchema,
  storageHints: z.object({
    qdrantCollections: z.array(z.string().min(1)),
    columnarTables: z.array(z.string().min(1)),
    mmapVectorRefs: z.array(z.string().min(1)),
  }),
});

export type TaxonomyTopologyPacketSummary = z.infer<typeof TaxonomyTopologyPacketSummarySchema>;

export interface BuildTaxonomyTopologyPacketInput {
  featureId: string;
  nodeKey: string;
  query?: string;
  limit?: number;
  asLatest?: boolean;
}

export interface BuildTaxonomyTopologyPacketResult {
  summary: TaxonomyTopologyPacketSummary;
  packet: AceFullPacket;
}

type TaxonomyNodeRow = {
  node_key: string;
  level: number;
  parent_key: string | null;
  display_name: string;
  member_count: number | null;
  metadata: Record<string, unknown> | null;
};

type ClusterSummaryRow = {
  centroid_distance_mean: number | null;
  summary: string | null;
  purpose: string | null;
  patterns: string[] | null;
  warnings: string[] | null;
  tags: string[] | null;
  summary_model: string | null;
  metadata: Record<string, unknown> | null;
};

function parseSomCell(value: unknown): { somCluster: string | null; somRow: number | null; somCol: number | null } {
  const text = String(value ?? '').trim();
  if (!text) return { somCluster: null, somRow: null, somCol: null };
  const parts = text.split(':').map((part) => Number(part));
  if (parts.length === 2 && parts.every(Number.isInteger)) {
    return { somCluster: text, somRow: parts[0], somCol: parts[1] };
  }
  return { somCluster: text, somRow: null, somCol: null };
}

function buildNeighborCells(row: number | null, col: number | null) {
  if (row === null || col === null) return [] as Array<[number, number]>;
  const cells: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextRow > 19 || nextCol < 0 || nextCol > 19) continue;
      cells.push([nextRow, nextCol]);
    }
  }
  return cells;
}

function stableList(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function numericList(values: unknown[]) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))];
}

function numberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function loadCentroidEvidence(node: TaxonomyNodeRow, somCluster: string | null) {
  const redis = getRedis();
  const [centroidMeta, karpathyRaw] = await Promise.all([
    redis.hgetall('gpu:autoencoder:centroids_64_meta').catch(() => ({} as Record<string, string>)),
    redis.hgetall('gpu:karpathy:scores').catch(() => ({} as Record<string, string>)),
  ]);

  let clusterSummary: ClusterSummaryRow | null = null;
  const clusterCandidate = numberOrNull(node.metadata?.kmeans_cluster ?? node.metadata?.cluster_id);
  if (clusterCandidate !== null) {
    const res = await pool.query<ClusterSummaryRow>(
      `SELECT centroid_distance_mean, summary, purpose, patterns, warnings, tags, summary_model, metadata
         FROM cluster_summaries
        WHERE gpu_cluster = $1
        LIMIT 1`,
      [clusterCandidate]
    ).catch(() => ({ rows: [] as ClusterSummaryRow[] }));
    clusterSummary = res.rows[0] ?? null;
  }

  let karpathyBlendMax: number | null = null;
  for (const value of Object.values(karpathyRaw)) {
    try {
      const parsed = JSON.parse(String(value)) as { blend?: number };
      if (typeof parsed.blend === 'number') {
        karpathyBlendMax = karpathyBlendMax === null ? parsed.blend : Math.max(karpathyBlendMax, parsed.blend);
      }
    } catch {
      continue;
    }
  }

  return {
    summary: clusterSummary,
    evidence: TaxonomyCentroidEvidenceSchema.parse({
      redisCentroidCount: Number(centroidMeta.count ?? 0),
      redisCentroidDim: numberOrNull(centroidMeta.dim),
      redisCentroidTrainedAt: String(centroidMeta.trainedAt ?? centroidMeta.trained_at ?? '').trim() || null,
      clusterSummaryAvailable: Boolean(clusterSummary),
      centroidDistanceMean: clusterSummary?.centroid_distance_mean ?? null,
      karpathyBlendMax,
    }),
  };
}

function deriveClassifierEvidence(
  node: TaxonomyNodeRow,
  clusterSummary: ClusterSummaryRow | null,
  ontologyTags: string[]
) {
  const metadata = node.metadata ?? {};
  const domainClass =
    String(metadata.domain_class ?? metadata.domainClass ?? clusterSummary?.metadata?.domain_class ?? '').trim() ||
    ontologyTags[0] ||
    null;
  const deterministicConf = numberOrNull(metadata.domain_confidence ?? metadata.domainConfidence);
  const nbConf = numberOrNull(metadata.naive_bayes_confidence ?? metadata.naiveBayesConfidence);
  const xgbConf = numberOrNull(metadata.xgboost_confidence ?? metadata.xgboostConfidence);
  const tier = domainClass ? selectClassifierTier(deterministicConf, nbConf, xgbConf) : null;

  const domainConfidence =
    tier === 'deterministic'
      ? deterministicConf
      : tier === 'xgboost'
        ? xgbConf
        : tier === 'naive_bayes'
          ? nbConf
          : numberOrNull(clusterSummary?.metadata?.domain_confidence) ?? null;

  const evidenceSource = metadata.domain_class || metadata.domainClass
    ? 'metadata'
    : clusterSummary?.metadata?.domain_class
      ? 'cluster_summary'
      : 'missing';

  return TaxonomyClassifierEvidenceSchema.parse({
    domainClass,
    domainConfidence,
    domainClassifierTier: tier,
    evidenceSource,
  });
}

export async function buildTaxonomyTopologyPacket(
  input: BuildTaxonomyTopologyPacketInput
): Promise<BuildTaxonomyTopologyPacketResult> {
  const featureId = String(input.featureId ?? '').trim();
  const nodeKey = String(input.nodeKey ?? '').trim();
  if (!featureId) throw new Error('featureId is required');
  if (!nodeKey) throw new Error('nodeKey is required');

  const limit = Math.min(Math.max(Number(input.limit ?? 8), 1), 32);

  const [nodeRes, pathRes, childrenRes] = await Promise.all([
    pool.query<TaxonomyNodeRow>(
      `SELECT node_key, level, parent_key, display_name, member_count, metadata
         FROM taxonomy_nodes
        WHERE node_key = $1
        LIMIT 1`,
      [nodeKey]
    ),
    pool.query<Pick<TaxonomyNodeRow, 'node_key' | 'level' | 'parent_key' | 'display_name'>>(
      `WITH RECURSIVE up AS (
         SELECT node_key, level, parent_key, display_name, 0 AS depth
           FROM taxonomy_nodes
          WHERE node_key = $1
         UNION ALL
         SELECT n.node_key, n.level, n.parent_key, n.display_name, up.depth + 1
           FROM taxonomy_nodes n
           JOIN up ON n.node_key = up.parent_key
       )
       SELECT node_key, level, parent_key, display_name
         FROM up
        ORDER BY depth DESC`,
      [nodeKey]
    ),
    pool.query<TaxonomyNodeRow>(
      `SELECT node_key, level, parent_key, display_name, member_count, metadata
         FROM taxonomy_nodes
        WHERE parent_key = $1
        ORDER BY member_count DESC NULLS LAST, display_name ASC
        LIMIT $2`,
      [nodeKey, limit]
    ),
  ]);

  const node = nodeRes.rows[0];
  if (!node) {
    throw new Error(`taxonomy node not found: ${nodeKey}`);
  }

  const metadata = (node.metadata ?? {}) as Record<string, unknown>;
  const parsedSom = parseSomCell(metadata.som_cluster ?? metadata.somCell ?? metadata.cluster_id);
  const topChildren = childrenRes.rows.map((row) => ({
    node_key: row.node_key,
    level: row.level,
    display_name: row.display_name,
    member_count: Number(row.member_count ?? 0),
  }));

  const ontologyTags = stableList([
    ...(Array.isArray(metadata.ontology_tags) ? (metadata.ontology_tags as unknown[]).map(String) : []),
    ...(Array.isArray(metadata.tags) ? (metadata.tags as unknown[]).map(String) : []),
    node.display_name,
  ]);
  const kmeansClusters = numericList([
    metadata.kmeans_cluster,
    ...(Array.isArray(metadata.kmeans_clusters) ? metadata.kmeans_clusters : []),
  ]);
  const neighborCells = buildNeighborCells(parsedSom.somRow, parsedSom.somCol);
  const centroidLoaded = await loadCentroidEvidence(node, parsedSom.somCluster);
  const classifier = deriveClassifierEvidence(node, centroidLoaded.summary, ontologyTags);

  const linkedTuples = [
    ...(node.parent_key ? [{ source: node.parent_key, relation: 'PARENT_OF' as const, target: node.node_key }] : []),
    ...topChildren.map((child) => ({ source: node.node_key, relation: 'CHILD_OF' as const, target: child.node_key })),
    ...(parsedSom.somCluster ? [{ source: node.node_key, relation: 'SAME_SOM_CLUSTER' as const, target: parsedSom.somCluster }] : []),
    ...kmeansClusters.map((clusterId) => ({
      source: node.node_key,
      relation: 'IN_KMEANS_CLUSTER' as const,
      target: `kmeans:${clusterId}`,
    })),
    ...ontologyTags.slice(0, 8).map((tag) => ({
      source: node.node_key,
      relation: 'HAS_ONTOLOGY_TAG' as const,
      target: tag,
    })),
  ];

  const summary = TaxonomyTopologyPacketSummarySchema.parse({
    featureId,
    nodeKey: node.node_key,
    displayName: node.display_name,
    level: node.level,
    parentKey: node.parent_key,
    taxonomyPath: pathRes.rows.map((row) => ({
      node_key: row.node_key,
      level: row.level,
      display_name: row.display_name,
    })),
    childCount: topChildren.length,
    topChildren,
    topology: {
      somCluster: parsedSom.somCluster,
      somRow: parsedSom.somRow,
      somCol: parsedSom.somCol,
      neighborCells,
      kmeansClusters,
      ontologyTags,
    },
    linkedTuples,
    classifier,
    centroid: centroidLoaded.evidence,
    storageHints: {
      qdrantCollections: stableList(['codebase_chunks_768', 'documents']),
      columnarTables: stableList(['taxonomy_nodes', 'taxonomy_edges', 'atlas_packets']),
      mmapVectorRefs: stableList(
        ontologyTags.slice(0, 4).map((tag) => `mmap:taxonomy:${tag.replace(/\s+/g, '_').toLowerCase()}`)
      ),
    },
  });

  const query = input.query?.trim() || `taxonomy topology ${summary.displayName} ${summary.nodeKey}`;
  const promptContext = [
    `Feature: ${featureId}`,
    `Node: ${summary.displayName} (${summary.nodeKey})`,
    `Level: ${summary.level}`,
    `Path: ${summary.taxonomyPath.map((part) => part.display_name).join(' > ')}`,
    `SOM: ${summary.topology.somCluster ?? 'unassigned'}`,
    `KMeans: ${summary.topology.kmeansClusters.join(', ') || 'none'}`,
    `Domain: ${summary.classifier.domainClass ?? 'unknown'} (${summary.classifier.domainClassifierTier ?? 'missing'})`,
    `Centroid meta: count=${summary.centroid.redisCentroidCount}, dim=${summary.centroid.redisCentroidDim ?? 'n/a'}, distance=${summary.centroid.centroidDistanceMean ?? 'n/a'}`,
    `Ontology tags: ${summary.topology.ontologyTags.slice(0, 8).join(', ')}`,
    `Children: ${summary.topChildren.slice(0, 6).map((child) => child.display_name).join(', ') || 'none'}`,
    `Linked tuples: ${summary.linkedTuples
      .slice(0, 8)
      .map((tuple) => `${tuple.source} ${tuple.relation} ${tuple.target}`)
      .join(' | ')}`,
  ].join('\n');

  const packet = await writeAcePacket(
    {
      packet_ulid: null,
      title_id: `taxonomy:${summary.nodeKey}`,
      query,
      query_hash: makeQueryHash(query),
      source_refs: stableList([
        `taxonomy:${summary.nodeKey}`,
        ...summary.topChildren.slice(0, 6).map((child) => `taxonomy:${child.node_key}`),
      ]),
      feature_ids: [featureId],
      lane_ids: ['taxonomy-topology', 'ontology-fanout', 'ace-packet'],
      cluster_id:
        summary.topology.somRow !== null && summary.topology.somCol !== null
          ? `${summary.topology.somRow}:${summary.topology.somCol}`
          : null,
      workspace_task_id: null,
      used_concepts: stableList([...(summary.topology.ontologyTags.slice(0, 12)), summary.classifier.domainClass ?? '']),
      lexical_nouns: stableList(summary.taxonomyPath.map((part) => part.display_name.toLowerCase())),
      lexical_verbs: ['classify', 'route', 'fanout'],
      lexical_adverbs_ly: ['semantically', 'topologically'],
      adjacency_packet_keys: summary.linkedTuples.map((tuple) => `${tuple.source}->${tuple.target}`).slice(0, 16),
      adjacency_feature_ids: [featureId],
      adjacency_source_refs: stableList([
        `taxonomy:${summary.nodeKey}`,
        ...summary.linkedTuples.map((tuple) => tuple.target),
      ]).slice(0, 16),
      packed_arrays: {
        packet_keys: summary.linkedTuples.map((tuple) => `${tuple.source}:${tuple.relation}:${tuple.target}`).slice(0, 16),
        feature_ids: [featureId],
        source_refs: stableList([`taxonomy:${summary.nodeKey}`, ...summary.topChildren.map((child) => `taxonomy:${child.node_key}`)]),
        title_ids: summary.taxonomyPath.map((part) => `taxonomy:${part.node_key}`),
      },
      columnar_tables: summary.storageHints.columnarTables,
      mmap_vector_refs: summary.storageHints.mmapVectorRefs,
      qdrant_point_ids: [],
      neo4j_neighbor_ids: summary.linkedTuples.map((tuple) => tuple.target).slice(0, 16),
      redis_hot_keys: [`taxonomy:children:${summary.nodeKey}`, `ace:feature:${featureId}`, 'gpu:autoencoder:centroids_64_meta'],
      som_cluster:
        summary.topology.somRow !== null && summary.topology.somCol !== null
          ? `${summary.topology.somRow}:${summary.topology.somCol}`
          : null,
      engram_ids: [],
      kag_hits: summary.topChildren.length,
      dag_hits: summary.linkedTuples.length,
      nes_chrom_packet_keys: [],
      prompt_context: promptContext,
      ranked_cards: summary.topChildren.map((child, index) => ({
        source_ref: `taxonomy:${child.node_key}`,
        score: Math.max(0.1, 1 - index * 0.1),
        feature_id: featureId,
        snippet: `${child.display_name} (${child.member_count} members)`,
      })),
      cache_hit: 'none',
      latency_ms: 0,
      degraded: false,
      ttl_seconds: 3600,
    },
    { asLatest: input.asLatest ?? false, ttl: 3600 }
  );

  return { summary, packet };
}
