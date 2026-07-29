import { EnrichedTreeNodeSchema, type EnrichedTreeNode } from './enriched-tree-node-contract.js';
import type { AtlasKnowledgeEnvelope, QdrantPayloadProjection } from './atlas-knowledge-envelope.js';
import type { HyperRagFactResponse } from './projections/hyperrag-packet-projection.js';
import type { QdrantPayload, SemanticPacketDomainObject } from './projections/qdrant-packet-projection.js';

export interface EnrichedTreeNodeProjectionSeed {
  node: EnrichedTreeNode;
  packetKey: string;
  sourceRef: string;
  workspaceId: string;
  workspaceRevision: string;
  collectionName: string;
  titleId?: string | null;
  chunkId: string;
  repositoryId: string;
  filePath: string;
  contentHash: string;
  ontologyId?: string | null;
  ontologyVersion?: string | null;
  somClusterId?: number | null;
  somCellX?: number | null;
  somCellY?: number | null;
}

export function normalizeEnrichedTreeNode(node: EnrichedTreeNode): EnrichedTreeNode {
  return EnrichedTreeNodeSchema.parse(node);
}

export function toAtlasKnowledgeEnvelopeFromEnrichedTreeNode(seed: EnrichedTreeNodeProjectionSeed): AtlasKnowledgeEnvelope {
  const node = normalizeEnrichedTreeNode(seed.node);
  return {
    schemaVersion: 'atlas-knowledge-envelope-v1',
    identity: {
      packetKey: seed.packetKey,
      chunkId: seed.chunkId,
      packetId: null,
      treeNodeId: node.identity.tree_node_id,
      repositoryId: seed.repositoryId,
    },
    source: {
      sourceRef: seed.sourceRef,
      sourceKind: 'repo',
      filePath: seed.filePath,
      revision: seed.workspaceRevision,
      startLine: null,
      endLine: null,
      contentHash: seed.contentHash,
    },
    structure: {
      language: seed.node.ast.language,
      symbolKind: seed.node.ast.node_kind,
      symbolName: seed.node.identity.function_symbol,
      parentTreeNodeId: seed.node.ast.parent_tree_node_id,
      imports: [],
      exports: [],
      astFacts: [],
    },
    semantics: {
      summary: null,
      purpose: null,
      keywords: [],
      conceptIds: seed.node.ontology_links.map((link) => link.concept_id),
      usedConcepts: [],
      domainClass: seed.node.identity.domain_class,
      domainConfidence: seed.node.domains[0]?.probability ?? null,
      domainClassifierTier: seed.node.domains[0]?.classifier === 'xgboost' ? 'xgboost' : 'deterministic',
    },
    topology: {
      kmeans: seed.node.identity.kmeans_cluster_id == null
        ? null
        : {
            cluster: seed.node.identity.kmeans_cluster_id,
            centroidDistance: 0,
            secondClusterId: null,
            clusterMargin: null,
            version: 'strict-enriched-node.v1',
          },
      som: null,
      latent: null,
      communityId: seed.node.identity.community_id,
      pageRank: null,
    },
    projection: {
      embeddingContract: 'embeddinggemma-768-strict-enriched-node.v1',
      sparseContract: null,
      qdrantContract: seed.collectionName,
      graphContract: 'neo4j:strict-enriched-node.v1',
      projectionHash: seed.contentHash,
    },
    provenance: {
      extractorVersions: {
        'tree-node': 'strict-enriched-node.v1',
        'atlas-projection': 'strict-enriched-node.v1',
      },
      classifierVersion: seed.node.revisions.classifier_revision,
      generatedAt: new Date().toISOString(),
      validatedAt: null,
    },
  };
}

export function toQdrantPayloadFromEnrichedTreeNode(seed: EnrichedTreeNodeProjectionSeed): QdrantPayloadProjection {
  const envelope = toAtlasKnowledgeEnvelopeFromEnrichedTreeNode(seed);
  return {
    packet_key: envelope.identity.packetKey,
    chunk_id: envelope.identity.chunkId,
    source_ref: envelope.source.sourceRef,
    file_path: envelope.source.filePath,
    repository_id: envelope.identity.repositoryId,
    tree_node_id: envelope.identity.treeNodeId,
    content_hash: envelope.source.contentHash,
    language: envelope.structure.language,
    symbol_kind: envelope.structure.symbolKind,
    symbol_name: envelope.structure.symbolName,
    domain_class: envelope.semantics.domainClass,
    domain_confidence: envelope.semantics.domainConfidence,
    keywords: envelope.semantics.keywords,
    concept_ids: envelope.semantics.conceptIds,
    kmeans_cluster: envelope.topology.kmeans?.cluster ?? null,
    kmeans_model_version: envelope.topology.kmeans?.version ?? null,
    second_cluster_id: envelope.topology.kmeans?.secondClusterId ?? null,
    som_cell: envelope.topology.som?.cell ?? null,
    community_id: envelope.topology.communityId,
    embedding_contract: envelope.projection.embeddingContract,
    sparse_contract: envelope.projection.sparseContract,
    projection_hash: envelope.projection.projectionHash,
  };
}

export function toSemanticPacketFromEnrichedTreeNode(seed: EnrichedTreeNodeProjectionSeed): SemanticPacketDomainObject {
  const node = normalizeEnrichedTreeNode(seed.node);
  return {
    packetKey: seed.packetKey,
    sourceRef: seed.sourceRef,
    filePath: seed.filePath,
    featureId: node.identity.feature_id,
    featureLabel: node.identity.feature_label,
    domainClass: node.identity.domain_class ?? '',
    titleId: seed.titleId ?? '',
    treeNodeId: node.identity.tree_node_id,
    contentHash: seed.contentHash,
    workspaceId: seed.workspaceId,
    workspaceRevision: seed.workspaceRevision,
    ontologyId: seed.ontologyId ?? null,
    ontologyVersion: seed.ontologyVersion ?? null,
    collectionName: seed.collectionName,
    somClusterId: seed.somClusterId ?? null,
    somCellX: seed.somCellX ?? null,
    somCellY: seed.somCellY ?? null,
  };
}

export interface Neo4jProjection {
  nodeKey: string;
  labels: string[];
  properties: Record<string, string | number | null>;
  relationships: Array<{
    type: string;
    targetKey: string;
    properties: Record<string, string | number | null>;
  }>;
}

export function toNeo4jProjectionFromEnrichedTreeNode(seed: EnrichedTreeNodeProjectionSeed): Neo4jProjection {
  const node = normalizeEnrichedTreeNode(seed.node);
  return {
    nodeKey: node.identity.tree_node_id,
    labels: ['TreeNode', node.identity.node_type, node.identity.domain_class ?? 'unknown'].filter(Boolean),
    properties: {
      packet_key: seed.packetKey,
      source_ref: seed.sourceRef,
      tree_node_id: node.identity.tree_node_id,
      feature_id: node.identity.feature_id,
      feature_label: node.identity.feature_label,
      domain_class: node.identity.domain_class,
      community_id: node.identity.community_id,
      kmeans_cluster_id: node.identity.kmeans_cluster_id,
      source_hash: node.identity.source_hash,
      workspace_revision: seed.workspaceRevision,
      graph_revision: node.revisions.graph_revision,
      ontology_revision: node.revisions.ontology_revision,
      classifier_revision: node.revisions.classifier_revision,
    },
    relationships: node.ontology_links.map((link) => ({
      type: link.relation,
      targetKey: link.concept_id,
      properties: {
        ontology_id: link.ontology_id,
        confidence: link.confidence,
        evidence_ref: link.evidence_ref,
      },
    })),
  };
}

export function toHyperRagRequestFromEnrichedTreeNode(seed: EnrichedTreeNodeProjectionSeed): Omit<
  HyperRagFactResponse,
  'n_ary_facts' | 'rpc_received_at' | 'rpc_version'
> {
  const node = normalizeEnrichedTreeNode(seed.node);
  return {
    packet_key: seed.packetKey,
    source_ref: seed.sourceRef,
    feature_id: node.identity.feature_id,
    feature_label: node.identity.feature_label,
    workspace_id: seed.workspaceId,
    workspace_revision: seed.workspaceRevision,
    ontology_id: seed.ontologyId ?? null,
    ontology_version: seed.ontologyVersion ?? null,
    content_hash: seed.contentHash,
    tree_node_id: node.identity.tree_node_id,
  };
}
