export type AtlasRegistryStatus = 'active' | 'partial' | 'planned' | 'blocked';

export type AtlasRuntimeRegistrySectionId =
  | 'contract'
  | 'capability'
  | 'projection'
  | 'model'
  | 'embedding'
  | 'worker'
  | 'pipeline'
  | 'feature'
  | 'recommendation';

export interface AtlasRuntimeRegistryItem {
  key: string;
  title: string;
  path: string;
  owner: string;
  status: AtlasRegistryStatus;
  notes: string;
}

export interface AtlasRuntimeRegistrySection {
  id: AtlasRuntimeRegistrySectionId;
  title: string;
  owner: string;
  status: AtlasRegistryStatus;
  adminPath: string;
  searchPath: string;
  notes: string;
  items: AtlasRuntimeRegistryItem[];
}

export interface AtlasRuntimeRegistrySnapshot {
  version: string;
  adminPath: string;
  searchPath: string;
  sections: AtlasRuntimeRegistrySection[];
}

export const ATLAS_RUNTIME_REGISTRY_VERSION = 'atlas-runtime-registry-v1';

export const ATLAS_RUNTIME_REGISTRY: AtlasRuntimeRegistrySection[] = [
  {
    id: 'contract',
    title: 'Contract Registry',
    owner: 'atlas-contracts',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Frozen contract surfaces for identity, AST facts, knowledge layers, and graphify sequencing.',
    items: [
      {
        key: 'canonical-envelope',
        title: 'Canonical packet envelope',
        path: 'scripts/atlas/lib/envelope-schema.mjs',
        owner: 'atlas-contracts',
        status: 'active',
        notes: 'Canonical identity and projection envelope for packet materialization.',
      },
      {
        key: 'ast-facts',
        title: 'AST facts contract',
        path: 'scripts/atlas/lib/ast-facts-contract.mjs',
        owner: 'atlas-contracts',
        status: 'active',
        notes: 'Structural facts lane for Tree-sitter and AST-grep outputs.',
      },
      {
        key: 'knowledge-layer',
        title: 'Knowledge layer contract',
        path: 'scripts/atlas/lib/knowledge-layer-contract.mjs',
        owner: 'atlas-contracts',
        status: 'active',
        notes: 'Shared knowledge-layer contract for registry and projection boundaries.',
      },
      {
        key: 'daily-graphify',
        title: 'Daily graphify contract',
        path: 'scripts/atlas/lib/daily-graphify-contract.mjs',
        owner: 'atlas-contracts',
        status: 'active',
        notes: 'Graph refresh contract for topology derivation and projection sequencing.',
      },
    ],
  },
  {
    id: 'capability',
    title: 'Capability Registry',
    owner: 'search-runtime',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Control-plane capabilities for retrieval, query planning, and agentic orchestration.',
    items: [
      {
        key: 'search-runtime',
        title: 'SearchRuntime',
        path: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
        owner: 'search-runtime',
        status: 'active',
        notes: 'Primary multi-lane retrieval authority for Atlas search.',
      },
      {
        key: 'registry-search-api',
        title: 'Atlas registry search API',
        path: 'sveltekit-frontend/src/routes/api/admin/atlas/registry/search/+server.ts',
        owner: 'admin-atlas',
        status: 'active',
        notes: 'Current admin search path used by the Atlas control plane.',
      },
      {
        key: 'langgraph-research',
        title: 'LangGraph research lane',
        path: 'sveltekit-frontend/src/lib/server/ai/langgraph-research.ts',
        owner: 'agentic-orchestration',
        status: 'active',
        notes: 'Durable orchestration lane for research and recovery workflows.',
      },
    ],
  },
  {
    id: 'projection',
    title: 'Projection Registry',
    owner: 'projection-workers',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Mirror and outbox surfaces that project canonical packets into disposable stores.',
    items: [
      {
        key: 'hyperrag-projection-adapter',
        title: 'HyperRAG projection adapter',
        path: 'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-projection-adapter.ts',
        owner: 'hyperrag',
        status: 'active',
        notes: 'Builds projection intents from canonical packet state.',
      },
      {
        key: 'projection-outbox',
        title: 'Projection outbox',
        path: 'sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts',
        owner: 'projection-workers',
        status: 'active',
        notes: 'Transactional outbox for packet, summary, payload, and feature refresh intents.',
      },
      {
        key: 'packet-binary-registry',
        title: 'Packet binary registry',
        path: 'sveltekit-frontend/src/lib/server/db/schema/packet-binary-registry.ts',
        owner: 'serialization',
        status: 'active',
        notes: 'Transient binary handoff registry for ACE and open-memory routing.',
      },
      {
        key: 'dag-hit-envelope-persist',
        title: 'DAG-hit envelope persistence',
        path: 'sveltekit-frontend/src/lib/server/serialization/dag-hit-envelope-persist.ts',
        owner: 'serialization',
        status: 'active',
        notes: 'Best-effort binary registry warm path for derived packet envelopes.',
      },
    ],
  },
  {
    id: 'model',
    title: 'Local Chat + Document Models',
    owner: 'model-routing',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Atlas-relevant local model surfaces used by chat, retrieval, and document understanding.',
    items: [
      {
        key: 'gemma4-rotorquant-iq4xs-direct',
        title: 'Gemma 4 RotorQuant IQ4_XS Direct',
        path: 'models/gemma4-rotorquant:latest-iq4xs-direct.gguf',
        owner: 'reasoning',
        status: 'active',
        notes: 'Canonical local chat GGUF for Gemma 4 synthesis and reasoning; served from the /models lane.',
      },
      {
        key: 'embeddinggemma-768d',
        title: 'EmbeddingGemma server lane',
        path: 'sveltekit-frontend/src/lib/ai/model-ids.ts',
        owner: 'embedding',
        status: 'active',
        notes: 'Canonical retrieval embedding lane used for Qdrant, clustering, and cache routing.',
      },
      {
        key: 'hforf-gguf',
        title: 'HFORF GGUF lab lane',
        path: 'models/hfor/hforf.gguf',
        owner: 'model-routing',
        status: 'active',
        notes: 'Current default local chat / synthesis lane for the admin atlas surface; RotorQuant remains fallback.',
      },
      {
        key: 'embeddinggemma-300m-onnx',
        title: 'EmbeddingGemma ONNX artifact',
        path: 'models/embeddinggemma_300m_onnx/model.onnx',
        owner: 'embedding',
        status: 'active',
        notes: 'ONNX embedding artifact for local fallback and browser-local model parity checks.',
      },
      {
        key: 'packet-jepa-pt',
        title: 'Packet-JEPA latent encoder',
        path: 'models/packet-jepa/packet-jepa.pt',
        owner: 'graphify',
        status: 'partial',
        notes: 'Torch checkpoint for latent/topology feature work; derived lane, not canonical identity.',
      },
      {
        key: 'granite-docling-258m',
        title: 'Granite Docling 258M',
        path: 'granite-docling-258M/README.md',
        owner: 'document-understanding',
        status: 'active',
        notes: 'Local Docling artifact directory for document understanding; not a chat lane.',
      },
    ],
  },
  {
    id: 'embedding',
    title: 'Embedding Registry',
    owner: 'vector-pipeline',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Embedding and vector-lane descriptors for dense, sparse, and latent vector handling.',
    items: [
      {
        key: 'feature-registry-vectors',
        title: 'Feature registry vectors',
        path: 'sveltekit-frontend/src/lib/server/db/schema/feature-registry-vectors.ts',
        owner: 'vector-pipeline',
        status: 'active',
        notes: 'Dense embedding registry for feature-level vector lanes.',
      },
      {
        key: 'atlas-packets',
        title: 'Atlas packet embeddings',
        path: 'sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts',
        owner: 'vector-pipeline',
        status: 'active',
        notes: 'Primary packet table holding dense and sparse projection metadata.',
      },
      {
        key: 'dense-proof',
        title: 'Dense retrieval proof',
        path: 'sveltekit-frontend/scripts/atlas/prove-dense-retrieval.ts',
        owner: 'vector-pipeline',
        status: 'active',
        notes: 'Smoke harness for dense embedding and Qdrant retrieval availability.',
      },
      {
        key: 'bm42-sparse-population',
        title: 'BM42 sparse population',
        path: 'sveltekit-frontend/scripts/atlas/qdrant-bm42-sparse-population.mjs',
        owner: 'vector-pipeline',
        status: 'active',
        notes: 'Sparse lexical population path for the hybrid Qdrant collection.',
      },
    ],
  },
  {
    id: 'worker',
    title: 'Worker Registry',
    owner: 'background-workers',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Background workers and durable executors for projection, graph, and retrieval upkeep.',
    items: [
      {
        key: 'queue-worker',
        title: 'Queue worker registry',
        path: 'sveltekit-frontend/src/lib/server/queue/queue-worker.ts',
        owner: 'background-workers',
        status: 'active',
        notes: 'Central queue worker registry for background jobs.',
      },
      {
        key: 'langgraph-dag',
        title: 'LangGraph DAG',
        path: 'sveltekit-frontend/src/lib/server/ai/langgraph-dag.ts',
        owner: 'agentic-orchestration',
        status: 'active',
        notes: 'Durable DAG execution and checkpoint-aware recovery lane.',
      },
      {
        key: 'retrieval-executor-tree',
        title: 'Retrieval executor tree',
        path: 'sveltekit-frontend/src/lib/server/retrieval/executor-tree.ts',
        owner: 'search-runtime',
        status: 'active',
        notes: 'Lazy executor-tree barrel for cross-encoder, LangExtract, and trace rerank lanes.',
      },
      {
        key: 'daily-graphify',
        title: 'Daily graphify',
        path: 'sveltekit-frontend/scripts/atlas/daily-graphify.mjs',
        owner: 'graphify',
        status: 'active',
        notes: 'Daily graph refresh and projection orchestration.',
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline Registry',
    owner: 'atlas-pipelines',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'End-to-end packet pipelines that materialize, summarize, and project Atlas state.',
    items: [
      {
        key: 'hyperrag-packet-pipeline',
        title: 'HyperRAG packet pipeline',
        path: 'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts',
        owner: 'hyperrag',
        status: 'active',
        notes: 'Canonical HyperRAG packet materialization pipeline.',
      },
      {
        key: 'tree-sitter-ast-facts',
        title: 'Tree-sitter AST facts',
        path: 'sveltekit-frontend/scripts/atlas/materialize-tree-sitter-ast-facts.mjs',
        owner: 'ast-intelligence',
        status: 'active',
        notes: 'AST fact materializer for structural evidence lanes.',
      },
      {
        key: 'socraticode-graph-facts',
        title: 'SocratiCode graph facts',
        path: 'sveltekit-frontend/scripts/atlas/materialize-socraticode-graph-facts.mjs',
        owner: 'graphify',
        status: 'active',
        notes: 'Graph fact projection for SocratiCode-derived topology.',
      },
    ],
  },
  {
    id: 'feature',
    title: 'Feature Registry',
    owner: 'feature-classification',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Feature and function registries used for labeling, normalization, and metadata joins.',
    items: [
      {
        key: 'feature-registry',
        title: 'Feature registry',
        path: 'sveltekit-frontend/src/lib/server/db/schema/feature-registry.ts',
        owner: 'feature-classification',
        status: 'active',
        notes: 'Canonical feature tracking and validation registry.',
      },
      {
        key: 'repo-function-registry',
        title: 'Repo function registry',
        path: 'sveltekit-frontend/src/lib/server/db/schema/repo-function-registry.ts',
        owner: 'feature-classification',
        status: 'active',
        notes: 'Structural function registry for source-ref keyed joins.',
      },
      {
        key: 'atlas-artifacts',
        title: 'Atlas artifacts',
        path: 'sveltekit-frontend/src/lib/server/db/schema/atlas-artifacts.ts',
        owner: 'feature-classification',
        status: 'active',
        notes: 'Universal derived artifact registry for generated payloads.',
      },
    ],
  },
  {
    id: 'recommendation',
    title: 'Recommendation Registry',
    owner: 'agentic-repair',
    status: 'active',
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    notes: 'Recommendation and feedback lanes for HMM-gated repair and ranking decisions.',
    items: [
      {
        key: 'agentic-recommendation-workflow',
        title: 'Agentic recommendation workflow',
        path: 'sveltekit-frontend/scripts/atlas/agentic-recommendation-workflow.mjs',
        owner: 'agentic-repair',
        status: 'active',
        notes: 'Persistent recommendation run path for workstation repair selection.',
      },
      {
        key: 'langgraph-agentic-reranker',
        title: 'LangGraph agentic reranker',
        path: 'sveltekit-frontend/scripts/atlas/langgraph-agentic-reranker-workflow.mjs',
        owner: 'agentic-repair',
        status: 'active',
        notes: 'Workflow for learned reranking and fallback-safe candidate selection.',
      },
      {
        key: 'hmm-tool-selector',
        title: 'HMM tool selector',
        path: 'sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.ts',
        owner: 'agentic-repair',
        status: 'active',
        notes: 'Stateful tool selection lane for agentic error fixing.',
      },
      {
        key: 'engram-registry',
        title: 'Engram registry',
        path: 'sveltekit-frontend/src/lib/server/ai/engram-registry.ts',
        owner: 'agentic-repair',
        status: 'active',
        notes: 'Durable experience registry for repair and memory evidence.',
      },
    ],
  },
] as const;

const ATLAS_RUNTIME_REGISTRY_INDEX = new Map<AtlasRuntimeRegistrySectionId, AtlasRuntimeRegistrySection>(
  ATLAS_RUNTIME_REGISTRY.map((section) => [section.id, section]),
);

export function listAtlasRuntimeRegistrySections(): AtlasRuntimeRegistrySection[] {
  return ATLAS_RUNTIME_REGISTRY.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item })),
  }));
}

export function getAtlasRuntimeRegistrySection(
  sectionId: AtlasRuntimeRegistrySectionId,
): AtlasRuntimeRegistrySection | null {
  const section = ATLAS_RUNTIME_REGISTRY_INDEX.get(sectionId);
  if (!section) return null;
  return {
    ...section,
    items: section.items.map((item) => ({ ...item })),
  };
}

export function getAtlasRuntimeRegistrySnapshot(): AtlasRuntimeRegistrySnapshot {
  return {
    version: ATLAS_RUNTIME_REGISTRY_VERSION,
    adminPath: '/admin/atlas',
    searchPath: '/api/admin/atlas/registry/search',
    sections: listAtlasRuntimeRegistrySections(),
  };
}
