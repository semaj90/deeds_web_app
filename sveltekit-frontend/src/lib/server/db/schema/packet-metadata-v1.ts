/**
 * Packet Metadata V1 Schema — Structured envelope for atlas_packets.metadata JSONB
 *
 * Rule: file_path / server_path / workspace_path = EVIDENCE
 *       source_ref + packet_key + feature_id = IDENTITY
 *
 * Never let path/runtime evidence replace packet identity.
 * Split into 4 orthogonal categories: identity, runtime, workspace, ranking.
 */

/** Core packet identity — immutable, keys the entire system */
export type PacketIdentity = {
  packet_key: string; // Unique packet ID within universe (atlas:* or nes:*)
  source_ref: string; // Canonical source location (src/lib/server/...)
  feature_id: string; // Semantic group (api_endpoints, database_orm, ...)
  feature_label: string; // Human-readable feature name
};

/** Runtime evidence — code shape, symbols, imports/exports */
export type PacketRuntimeMetadata = {
  language?: string; // 'typescript' | 'javascript' | 'python' | 'sql' | 'yaml' | ...
  symbol_name?: string; // Function/class/export name
  symbol_kind?: string; // 'function' | 'class' | 'interface' | 'const' | 'type' | ...
  imports?: string[]; // Direct imports from this packet
  exports?: string[]; // Symbols exported by this packet
  commands?: string[]; // npm/git/shell commands referenced
  env_vars?: string[]; // Environment variables referenced
  encoding?: 'utf-8' | 'base64'; // Text encoding if applicable
};

/** Workspace/file evidence — paths, VS Code, package.json context */
export type PacketWorkspaceMetadata = {
  file_path?: string; // Relative path in repo: src/lib/server/auth.ts
  repo_path?: string; // Absolute repo root path
  server_path?: string; // Container/server path (e.g., /home/user/deeds-web-app/...)
  workspace_path?: string; // VS Code workspace path
  package_json_path?: string; // Nearest package.json
  vscode_workspace?: string; // .code-workspace file reference
  vscode_tasks?: string[]; // npm script names this packet is used in
  vscode_debug_configs?: string[]; // launch.json debug config names
};

/** Topology/embedding evidence — vector coordinates, clusters, manifold position */
export type PacketTopologyMetadata = {
  embedding_dim?: 768; // Vector dimension (embeddinggemma native)
  latent_dim?: 64; // Autoencoder latent dimension
  encoded64?: number[]; // 64-dim autoencoder output (if available)
  som_cluster?: string; // SOM cell assignment (row,col or label)
  som_bmu_row?: number; // Self-Organizing Map best-matching unit row
  som_bmu_col?: number; // Self-Organizing Map best-matching unit col
  kmeans_cluster?: string; // K-means cluster ID
  manifold4d?: {
    x_cosine: number; // Qdrant cosine similarity axis
    y_graph: number; // Neo4j PageRank / authority axis
    z_som: number; // SOM neighborhood axis
    w_authority: number; // Karpathy authority score axis
  };
};

/** Ranking/retrieval evidence — scores, indices, cache keys */
export type PacketRankingMetadata = {
  qdrant_point_id?: string; // Qdrant vector DB point ID
  qdrant_tags?: string[]; // Qdrant payload tags for filtering
  qdrant_collection?: string; // Collection name in Qdrant
  cosine_similarity?: number; // Last cosine search score (0-1)
  pgvector_rank?: number; // PostgreSQL pgvector ranking position
  bm25_rank?: number; // Full-text search ranking position
  rerank_score?: number; // XGBoost / cross-encoder rerank score
  karpathy_score?: number; // Karpathy GPU authority blend (0-10)
  authority_score?: number; // PageRank / Neo4j authority (0-1)
  reward_prior?: number; // Policy learning reward signal
  ace_reward?: number; // ACE context assembly reward boost
  recency_boost?: number; // Time-decay ranking boost
};

/** Graph/community evidence — semantic relationships, group membership */
export type PacketGraphMetadata = {
  community_id?: string; // Community detection group ID
  cluster_id?: string; // Cluster assignment (SOM, K-means, etc.)
  domain?: string; // Domain class (auth, retrieval, ui, ...)
  ontology?: string[]; // Concept tags (database_orm, caching, ...)
  neo4j_node_id?: string; // Neo4j graph node ID
  parent_ids?: string[]; // Parent packet IDs in hierarchy
  chunk_ids?: string[]; // Child chunks if this is a summary packet
  similar_packets?: { packet_id: string; similarity: number }[]; // Top-K similar
};

/** Cache/memory evidence — hot key locations, memory references */
export type PacketMemoryMetadata = {
  redis_hot_key?: string; // Redis key for this packet (if cached)
  bifrost_cache_key?: string; // Bifrost semantic cache key
  engram_memory_id?: string; // Engram episodic memory reference
  ace_hit_id?: string; // ACE context assembly cache hit ID
  cache_ttl_seconds?: number; // Time-to-live for hot cache
  last_cached_at?: string; // ISO timestamp of last cache write
};

/** Access control — visibility, write/execute gates, provenance source */
export type PacketPermission = {
  visibility?: 'internal' | 'admin' | 'agent' | 'public';
  can_write?: boolean;
  can_execute?: boolean;
  can_export?: boolean;
  source?: 'repo_index' | 'runtime_capture' | 'agent_trace' | 'user_upload';
};

/** Provenance/tracking — versioning, inference flags, audit trail */
export type PacketProvenanceMetadata = {
  lineage_version: 'packet-identity-v1'; // Schema version (always this)
  packet_universe: 'atlas' | 'nes_chrom' | 'glyph' | 'codebase_chunk'; // Source table
  feature_id_inferred?: boolean; // Was feature_id computed, not loaded?
  feature_id_source?: 'atlas_feature_map' | 'feature-prefix' | 'orphan_fallback' | 'no-prefix-match'; // How was feature_id derived?
  feature_label_inferred?: boolean; // Was feature_label humanized from feature_id?
  metadata_version?: number; // Version of metadata structure
  updated_at: string; // ISO timestamp of last metadata update
  updated_by?: string; // System that updated (backfill-feature-metadata, qdrant-sync, ...)
  source_hash?: string; // Hash of source content (for change detection)
};

/** Complete metadata envelope — all categories combined */
export type PacketMetadataV1 = PacketIdentity &
  Partial<PacketRuntimeMetadata> &
  Partial<PacketWorkspaceMetadata> &
  Partial<PacketTopologyMetadata> &
  Partial<PacketRankingMetadata> &
  Partial<PacketGraphMetadata> &
  Partial<PacketMemoryMetadata> &
  Partial<PacketPermission> &
  PacketProvenanceMetadata;

/**
 * Metadata builder — type-safe construction with validation
 */
export class PacketMetadataBuilder {
  private data: Partial<PacketMetadataV1> = {};

  constructor(packet_key: string, source_ref: string, feature_id: string) {
    this.data.packet_key = packet_key;
    this.data.source_ref = source_ref;
    this.data.feature_id = feature_id;
    this.data.lineage_version = 'packet-identity-v1';
    this.data.updated_at = new Date().toISOString();
  }

  identity(id: Partial<PacketIdentity>): this {
    Object.assign(this.data, id);
    return this;
  }

  runtime(rt: Partial<PacketRuntimeMetadata>): this {
    Object.assign(this.data, rt);
    return this;
  }

  workspace(ws: Partial<PacketWorkspaceMetadata>): this {
    Object.assign(this.data, ws);
    return this;
  }

  topology(topo: Partial<PacketTopologyMetadata>): this {
    Object.assign(this.data, topo);
    return this;
  }

  ranking(rank: Partial<PacketRankingMetadata>): this {
    Object.assign(this.data, rank);
    return this;
  }

  graph(gr: Partial<PacketGraphMetadata>): this {
    Object.assign(this.data, gr);
    return this;
  }

  memory(mem: Partial<PacketMemoryMetadata>): this {
    Object.assign(this.data, mem);
    return this;
  }

  permissions(perm: Partial<PacketPermission>): this {
    Object.assign(this.data, perm);
    return this;
  }

  provenance(prov: Partial<PacketProvenanceMetadata>): this {
    Object.assign(this.data, prov);
    return this;
  }

  build(): PacketMetadataV1 {
    if (!this.data.packet_key || !this.data.source_ref || !this.data.feature_id) {
      throw new Error('Missing required identity fields: packet_key, source_ref, feature_id');
    }
    if (!this.data.feature_label) {
      this.data.feature_label = this.humanizeFeatureLabel(this.data.feature_id);
    }
    if (!this.data.packet_universe) {
      this.data.packet_universe = 'atlas';
    }
    return this.data as PacketMetadataV1;
  }

  private humanizeFeatureLabel(featureId: string): string {
    return featureId
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b([a-z])/g, (match) => match.toUpperCase());
  }
}

/**
 * Category selectors — extract specific metadata categories without the junk drawer
 */
export const packetMetadataSelectors = {
  identity: (m: PacketMetadataV1): PacketIdentity => ({
    packet_key: m.packet_key,
    source_ref: m.source_ref,
    feature_id: m.feature_id,
    feature_label: m.feature_label,
  }),

  runtime: (m: PacketMetadataV1): Partial<PacketRuntimeMetadata> => ({
    language: m.language,
    symbol_name: m.symbol_name,
    symbol_kind: m.symbol_kind,
    imports: m.imports,
    exports: m.exports,
    commands: m.commands,
    env_vars: m.env_vars,
  }),

  workspace: (m: PacketMetadataV1): Partial<PacketWorkspaceMetadata> => ({
    file_path: m.file_path,
    repo_path: m.repo_path,
    server_path: m.server_path,
    workspace_path: m.workspace_path,
    package_json_path: m.package_json_path,
    vscode_workspace: m.vscode_workspace,
    vscode_tasks: m.vscode_tasks,
  }),

  topology: (m: PacketMetadataV1): Partial<PacketTopologyMetadata> => ({
    som_cluster: m.som_cluster,
    som_bmu_row: m.som_bmu_row,
    som_bmu_col: m.som_bmu_col,
    kmeans_cluster: m.kmeans_cluster,
    manifold4d: m.manifold4d,
  }),

  ranking: (m: PacketMetadataV1): Partial<PacketRankingMetadata> => ({
    qdrant_point_id: m.qdrant_point_id,
    cosine_similarity: m.cosine_similarity,
    karpathy_score: m.karpathy_score,
    authority_score: m.authority_score,
    rerank_score: m.rerank_score,
    ace_reward: m.ace_reward,
  }),

  graph: (m: PacketMetadataV1): Partial<PacketGraphMetadata> => ({
    community_id: m.community_id,
    cluster_id: m.cluster_id,
    domain: m.domain,
    ontology: m.ontology,
    neo4j_node_id: m.neo4j_node_id,
  }),

  memory: (m: PacketMetadataV1): Partial<PacketMemoryMetadata> => ({
    redis_hot_key: m.redis_hot_key,
    bifrost_cache_key: m.bifrost_cache_key,
    engram_memory_id: m.engram_memory_id,
  }),

  permissions: (m: PacketMetadataV1): Partial<PacketPermission> => ({
    visibility: m.visibility,
    can_write: m.can_write,
    can_execute: m.can_execute,
    can_export: m.can_export,
    source: m.source,
  }),

  provenance: (m: PacketMetadataV1): Partial<PacketProvenanceMetadata> => ({
    lineage_version: m.lineage_version,
    feature_id_inferred: m.feature_id_inferred,
    feature_id_source: m.feature_id_source,
    updated_at: m.updated_at,
  }),
};