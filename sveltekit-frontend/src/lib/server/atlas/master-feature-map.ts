/**
 * src/lib/server/atlas/master-feature-map.ts
 * 
 * Definitive mapping of the 18 core features for the Deeds Web App.
 * Hardened with status, provenance, and architectural family mapping.
 */

export interface FeatureEvidence {
  files: string[];
  tests?: string[];
  smoke?: string[];
  lastValidatedAt?: string;
}

export interface MasterFeatureEntry {
  id: string;
  name: string;
  intent: string;
  service: string;
  stores: string[];
  modules?: string[];
  imports?: string[];
  dependencies?: string[];
  languages?: string[];
  networking?: string[];
  offlineProcessing?: string[];
  cache?: string[];
  inferenceFallbacks?: string[];
  clusters: number[];
  status: 'active' | 'partial' | 'dry_run' | 'planned' | 'research_spike' | 'deprecated';
  params: Record<string, any>;
  pathMapping?: string[];
  evidence?: FeatureEvidence;
  failOpen: boolean;
}

export const MASTER_FEATURE_MAP: Record<string, MasterFeatureEntry> = {
  // Family 1: HyperRAG Retrieval
  'hyperrag-fusion': {
    id: 'hyperrag-fusion',
    name: 'HyperRAG Retrieval (L0-L11)',
    intent: 'multi-signal retrieval fusion (Lexical/Topology/Task/Graph)',
    service: 'SearchRuntime (legacy HyperRAG compatibility wrapper)',
    stores: ['Qdrant', 'Redis', 'Neo4j', 'Postgres'],
    clusters: [72, 73, 94, 25, 32, 47, 92, 82, 20, 23, 80],
    status: 'active',
    params: { lanes: 6, fusion: 'RRF', budget: 12000 },
    pathMapping: ['src/lib/server/retrieval'],
    evidence: {
      files: ['src/lib/server/retrieval/search-runtime.ts', 'src/lib/server/retrieval/hyperrag-packet-rpc.ts'],
      smoke: ['scripts/smoke-manifold4-routing.mjs'],
      lastValidatedAt: '2026-05-15T02:40:00Z'
    },
    failOpen: true
  },
  // Family 2: ACE / BitFrost Context Cache
  'ace-envelope': {
    id: 'ace-envelope',
    name: 'ACE / BitFrost Context Cache',
    intent: 'low-latency context assembly and budgeting',
    service: 'ContextPacketBudgeter',
    stores: ['Redis', 'Postgres'],
    clusters: [72, 94],
    status: 'active',
    params: { tokenLimit: 12288, entities: 50 },
    pathMapping: ['src/lib/server/ace'],
    evidence: {
      files: ['src/lib/server/ace/context-packet-budgeter.ts'],
      tests: ['tests/unit/context-packet-budgeter.test.ts']
    },
    failOpen: true
  },
  // Family 3: TRACE MCP / Agentic Tool Surface
  'trace-mcp': {
    id: 'trace-mcp',
    name: 'TRACE MCP / Agentic Tool Surface',
    intent: 'model context protocol tool orchestration',
    service: 'TraceMcpService',
    stores: ['Redis'],
    clusters: [82],
    status: 'active',
    params: { protocol: 'MCP 1.0', tools: 12 },
    pathMapping: ['src/mcp'],
    evidence: {
      files: ['src/mcp/trace-mcp-server.ts'],
      smoke: ['scripts/smoke-trace-mcp-tools.mjs']
    },
    failOpen: true
  },
  // Family 4: Manifold4 / Hypergraph / Topological Routing
  'hypergraph-4d': {
    id: 'hypergraph-4d',
    name: 'Manifold4 / Hypergraph / Topological Routing',
    intent: '4D manifold routing (som_x, som_y, semantic_z, activity_w)',
    service: 'HypergraphRoutingService',
    stores: ['Redis', 'Qdrant'],
    clusters: [72, 73],
    status: 'active',
    params: { dimensions: 4, manifold: 'SOM-Kmeans', compression: '64d' },
    pathMapping: ['src/lib/server/retrieval'],
    evidence: {
      files: ['src/lib/server/retrieval/hypergraph-routing-service.ts'],
      smoke: ['scripts/smoke-hypergraph-routing.mjs']
    },
    failOpen: true
  },
  // Family 5: Karpathy / GPU Blend / Codebase Indexing
  'karpathy-blend': {
    id: 'karpathy-blend',
    name: 'Karpathy / GPU Blend / Codebase Indexing',
    intent: 'NanoFlow streaming context synthesis and autoencoding',
    service: 'KarpathyBlendOrchestrator',
    stores: ['Redis'],
    clusters: [],
    status: 'active',
    params: { blendMode: 'streaming', latencyTarget: 200 },
    pathMapping: ['src/lib/server/ace'],
    evidence: {
      files: ['src/lib/server/ace/karpathy-blend-orchestrator.ts']
    },
    failOpen: true
  },
  // Family 5b: GPU Compute Plane / Resilient Context Retrieval
  'gpu-compute-plane': {
    id: 'gpu-compute-plane',
    name: 'GPU Compute Plane Integration',
    intent: 'resilient GPU-accelerated graph analysis and retrieval fallback coordination',
    service: 'GpuPipeline',
    stores: ['Redis', 'Qdrant', 'Postgres'],
    clusters: [],
    status: 'active',
    params: {
      executionModel: 'queued-gpu-with-cpu-fallback',
      synthesisBoundary: 'bifrost-only',
      docRef: 'docs/features/feature_gpu_compute_plane.md'
    },
    pathMapping: [
      'src/mcp-gpu-orchestrator.ts',
      'src/lib/server/gpu',
      'src/lib/server/retrieval',
      'src/lib/server/graph',
      'src/lib/server/topology'
    ],
    evidence: {
      files: [
        'docs/features/feature_gpu_compute_plane.md',
        'src/mcp-gpu-orchestrator.ts',
        'src/lib/server/gpu/gpu-pipeline.ts',
        'src/lib/server/retrieval/gpu-reranker.ts',
        'src/lib/server/audit/gpu-audit-orchestrator.ts'
      ]
    },
    failOpen: true
  },
  // Family 6: Feature Mapping Atlas
  'feature-atlas': {
    id: 'feature-atlas',
    name: 'Feature Mapping Atlas',
    intent: 'central registry for architectural intents and anchors',
    service: 'MasterFeatureMap',
    stores: ['Postgres'],
    modules: ['src/lib/server/atlas', 'scripts/atlas', 'docs/atlas-index'],
    imports: ['MASTER_FEATURE_MAP', 'route-feature-map', 'feature-label-registry'],
    dependencies: ['route atlas', 'import map', 'feature cards', 'postgres registry'],
    languages: ['TypeScript', 'JSON', 'Markdown'],
    networking: ['Redis', 'Postgres', 'Qdrant'],
    offlineProcessing: ['DuckDB', 'CouchDB'],
    cache: ['Redis atlas cache', 'feature-map cache'],
    inferenceFallbacks: ['Gemma4 Opencode', 'CPU rerank fallback'],
    clusters: [],
    status: 'active',
    params: { families: 11 },
    pathMapping: ['src/lib/server/atlas/master-feature-map.ts'],
    evidence: {
      files: ['src/lib/server/atlas/master-feature-map.ts']
    },
    failOpen: true
  },
  // Family 7: Static / Dynamic Import Atlas
  'import-atlas': {
    id: 'import-atlas',
    name: 'Static / Dynamic Import Atlas',
    intent: 'dependency graph and topological sorting',
    service: 'DeepImportGraph',
    stores: ['Neo4j', 'Postgres'],
    modules: ['src/lib/server/atlas', 'src/lib/server/retrieval', 'scripts/atlas'],
    imports: ['STATIC_IMPORTS', 'DYNAMIC_IMPORTS', 'route-feature-map'],
    dependencies: ['route atlas', 'import map', 'neo4j projection'],
    languages: ['TypeScript', 'JSON'],
    networking: ['Neo4j', 'Postgres'],
    offlineProcessing: ['DuckDB', 'CouchDB'],
    cache: ['Redis graph cache'],
    inferenceFallbacks: ['CPU dependency analysis'],
    clusters: [],
    status: 'partial',
    params: { edgeTypes: ['STATIC_IMPORTS', 'DYNAMIC_IMPORTS'] },
    pathMapping: ['scripts/graph/build-codebase-relationships.mjs'],
    evidence: {
      files: ['scripts/graph/build-codebase-relationships.mjs']
    },
    failOpen: true
  },
  // Family 8: Route / Env / Sidecar Map
  'route-map': {
    id: 'route-map',
    name: 'Route / Env / Sidecar Map',
    intent: 'mapping routes to services, envs, and sidecars',
    service: 'RouteFeatureMap',
    stores: ['Postgres'],
    modules: ['src/lib/server/atlas', 'src/routes', 'src/lib/server/db'],
    imports: ['route-feature-map', 'feature-label-registry', 'db schema'],
    dependencies: ['route atlas', 'feature registry', 'env mapping'],
    languages: ['TypeScript'],
    networking: ['HTTP', 'SvelteKit endpoints'],
    offlineProcessing: ['DuckDB'],
    cache: ['Redis route cards'],
    inferenceFallbacks: ['static route analysis'],
    clusters: [],
    status: 'active',
    params: { edges: ['USES_ENV', 'USES_STORE'] },
    pathMapping: ['src/lib/server/atlas/route-feature-map.ts'],
    evidence: {
      files: ['src/lib/server/atlas/route-feature-map.ts']
    },
    failOpen: true
  },
  // Family 9: Legal-AI Product Layer
  'legal-product': {
    id: 'legal-product',
    name: 'Legal-AI Product Layer (KAG/DAG)',
    intent: 'high-level legal reasoning and synthesis',
    service: 'Gemma4Synthesizer',
    stores: ['Neo4j', 'Postgres'],
    clusters: [47],
    status: 'active',
    params: { model: 'gemma4-rotorquant:latest' },
    pathMapping: ['src/lib/server/ai', 'src/lib/server/kag'],
    evidence: {
      files: ['src/lib/server/ai/gemma4-agent.ts']
    },
    failOpen: true
  },
  // Family 10: Docling / LangExtract / OCR Ingestion
  'ingestion-layer': {
    id: 'ingestion-layer',
    name: 'Docling / LangExtract / OCR Ingestion',
    intent: 'multimodal document and code ingestion pipeline',
    service: 'TopologyProcessor',
    stores: ['Postgres', 'Qdrant'],
    clusters: [32, 92],
    status: 'active',
    params: { batchSize: 1000 },
    pathMapping: ['src/lib/server/db/schema/topology.ts'],
    evidence: {
      files: ['src/lib/server/db/schema/topology.ts']
    },
    failOpen: true
  },
  // Family 11: Master Atlas Reconciliation
  'atlas-reconciliation': {
    id: 'atlas-reconciliation',
    name: 'Master Atlas Reconciliation',
    intent: 'drift detection and automatic manifold repair',
    service: 'ManifoldDriftMonitor',
    stores: ['Redis', 'Postgres', 'Qdrant'],
    clusters: [],
    status: 'active',
    params: { checkInterval: 3600 },
    pathMapping: ['scripts/atlas/detect-manifold-drift.mjs'],
    evidence: {
      files: ['scripts/atlas/detect-manifold-drift.mjs']
    },
    failOpen: true
  },
  'trust-tiers': {
    id: 'trust-tiers',
    name: 'Trust Tiers (L1-L3)',
    intent: 'tiered verification and retrieval',
    service: 'TrustManager',
    stores: ['Postgres'],
    clusters: [],
    status: 'partial',
    params: { levels: ['verified', 'trusted', 'candidate'] },
    pathMapping: ['src/lib/server/security'],
    evidence: {
      files: ['src/lib/server/db/client.ts'] // Placeholder anchor
    },
    failOpen: true
  },
  'gpu-ast': {
    id: 'gpu-ast',
    name: 'GPU AST Mapping',
    intent: 'fast multi-language parsing',
    service: 'GpuAstMapper',
    stores: [],
    clusters: [],
    status: 'dry_run',
    params: { engines: ['simdjson', 'libtorch'] },
    pathMapping: ['src/lib/server/atlas'],
    evidence: {
      files: ['src/lib/server/db/schema/topology.ts'] // Placeholder anchor
    },
    failOpen: true
  },
  'bit-glyphs': {
    id: 'bit-glyphs',
    name: 'Bit-Glyphs / HMM',
    intent: 'rapid topological pattern matching',
    service: 'ManifoldAutocoder',
    stores: ['Redis'],
    clusters: [],
    status: 'dry_run',
    params: { size: 64 },
    pathMapping: ['scripts/atlas'],
    evidence: {
      files: ['scripts/atlas/compress-manifold-vectors.mjs']
    },
    failOpen: true
  },
  'context-dag': {
    id: 'context-dag',
    name: 'Context DAG',
    intent: 'knowledge synthesis graph',
    service: 'ContextDagSynthesis',
    stores: ['Neo4j'],
    clusters: [],
    status: 'planned',
    params: {},
    pathMapping: ['src/lib/server/kag'],
    failOpen: true
  },
  'cuda-streams': {
    id: 'cuda-streams',
    name: 'CUDA Kernel Streams',
    intent: 'batch GPU synthesis',
    service: 'CudaStreamManager',
    stores: [],
    clusters: [],
    status: 'planned',
    params: {},
    pathMapping: ['src/lib/server/gpu'],
    failOpen: true
  },
  'grpc-mcp': {
    id: 'grpc-mcp',
    name: 'gRPC MCP Functions',
    intent: 'multi-language function calling',
    service: 'GrpcMcpService',
    stores: [],
    clusters: [82],
    status: 'active',
    params: { ports: [50051, 50057] },
    pathMapping: ['src/routes/api/mcp'],
    evidence: {
      files: ['src/routes/api/mcp/+server.ts']
    },
    failOpen: true
  },
  'dense-hmm-search': {
    id: 'dense-hmm-search',
    name: 'Hyper Dense HMM Search',
    intent: 'manifold pattern search',
    service: 'DenseHmmSearchService',
    stores: ['Redis'],
    clusters: [],
    status: 'planned',
    params: {},
    pathMapping: ['src/lib/server/search'],
    failOpen: true
  }
};

export function getFeatureByCluster(clusterId: number): MasterFeatureEntry | null {
  for (const feat of Object.values(MASTER_FEATURE_MAP)) {
    if (feat.clusters.includes(clusterId)) return feat;
  }
  return null;
}
