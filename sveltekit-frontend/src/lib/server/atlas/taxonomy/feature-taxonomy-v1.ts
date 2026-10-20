/**
 * Atlas Curated Feature Taxonomy Contract (v1)
 *
 * Defines the canonical 21 product feature labels for SvelteKit, verified against
 * existing route handlers in `sveltekit-frontend/src/routes`.
 *
 * Anchors the Query -> Feature Label -> NES FSM -> Ewin Tang -> ACE Token Prefix pipeline.
 * Aligns with `docs/architecture/atlas-feature-taxonomy-sveltekit-draft.md`.
 */
import { z } from 'zod';

export const CANONICAL_FEATURE_LABELS = [
  'chat',
  'ai_chat',
  'auth',
  'canvas',
  'html5_visual_playground',
  'image_creator',
  'wiki',
  'user_db',
  'cases',
  'evidence',
  'search_rag',
  'knowledge_graph',
  'recommendations',
  'reports',
  'reconstruction_sim',
  'media_transcribe',
  'upload_ingest',
  'rich_text',
  'code_intel',
  'admin_ops',
  'terminal',
] as const;

export type CanonicalFeatureLabel = (typeof CANONICAL_FEATURE_LABELS)[number];

export const CanonicalFeatureLabelSchema = z.enum(CANONICAL_FEATURE_LABELS);

export interface FeatureTaxonomyEntryV1 {
  featureLabel: CanonicalFeatureLabel;
  displayName: string;
  description: string;
  sveltekitRoutes: readonly string[];
  coreComponents: readonly string[];
  databaseTables: readonly string[];
  backendServices: readonly string[];
  tokenBudget: number;
  nesFsmState: string;
  queryKeywords: readonly string[];
}

export const FEATURE_TAXONOMY_V1: Record<CanonicalFeatureLabel, FeatureTaxonomyEntryV1> = {
  chat: {
    featureLabel: 'chat',
    displayName: 'Operational Server Messaging',
    description: 'Server-backed multi-agent messaging, terminal sessions, and asynchronous event streams.',
    sveltekitRoutes: ['/chat', '/api/chat', '/api/v1'],
    coreComponents: ['src/routes/(app)/chat/+page.svelte', 'src/lib/server/evidence/rabbitmq.ts'],
    databaseTables: ['chat_messages', 'chat_conversations'],
    backendServices: ['RabbitMQ (:5673)', 'Valkey Pub/Sub (:6379)'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_CHAT_DISPATCH',
    queryKeywords: ['chat', 'message', 'conversation', 'channel', 'stream', 'agent-chat'],
  },
  ai_chat: {
    featureLabel: 'ai_chat',
    displayName: 'Client-Side AI & Assistant',
    description: 'Client-side ONNX chat, local AI assistant, and direct synthesis chat demos.',
    sveltekitRoutes: ['/demos/client-ai-chat', '/demos/client-inference', '/demos/ai-assistant', '/demos/ask-ai'],
    coreComponents: ['src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte', 'src/lib/components/ai/CaseScoringDashboard.svelte'],
    databaseTables: ['atlas_analysis_jobs', 'dossier_records'],
    backendServices: ['Ornith 1.5 9B (:8090)', 'WebGPU ONNX Runtime'],
    tokenBudget: 4096,
    nesFsmState: 'NES_STATE_AI_ASSISTANT',
    queryKeywords: ['ai chat', 'client ai', 'assistant', 'ask ai', 'synthesis chat', 'client-inference'],
  },
  auth: {
    featureLabel: 'auth',
    displayName: 'Authentication & Session Control',
    description: 'User login, registration, session management, and Lucia auth.',
    sveltekitRoutes: ['/login', '/register', '/api/auth'],
    coreComponents: ['src/lib/components/auth/LoginForm.svelte', 'src/lib/server/auth/lucia.ts'],
    databaseTables: ['user', 'session', 'user_roles'],
    backendServices: ['PostgreSQL 18 (:5434)', 'Valkey Session Cache (:6379)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_AUTH_SESSION',
    queryKeywords: ['login', 'register', 'auth', 'session', 'lucia', 'permission'],
  },
  canvas: {
    featureLabel: 'canvas',
    displayName: 'Interactive Evidence Canvas',
    description: 'Collaborative evidence canvas, graph layout nodes, and 2D visual boards.',
    sveltekitRoutes: ['/demos/collab-canvas', '/demos/evidence-canvas', '/api/collaboration'],
    coreComponents: ['src/lib/components/evidence/EvidenceGraphVisualization.svelte', 'src/lib/components/ui/gaming/n64/Switch.svelte'],
    databaseTables: ['graph_node_metrics', 'topology_clusters'],
    backendServices: ['cuGraph (:8098)', 'Qdrant (:6333)'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_CANVAS_TOPOLOGY',
    queryKeywords: ['canvas', 'collab canvas', 'evidence canvas', 'whiteboard', 'diagram'],
  },
  html5_visual_playground: {
    featureLabel: 'html5_visual_playground',
    displayName: 'WebGPU Visual Playground',
    description: 'WebGPU memory palace showcase, particle benchmarks, and Bento dashboard concepts.',
    sveltekitRoutes: ['/demos/webgpu-showcase', '/demos/webgpu-memory-palace', '/demos/particles', '/demos/bento-dashboard'],
    coreComponents: ['src/routes/(app)/demos/bento-dashboard/+page.svelte', 'src/lib/components/dashboard/PipelineOverview.svelte'],
    databaseTables: ['benchmark_runs', 'demo_profiles'],
    backendServices: ['WebGPU ONNX Runtime', 'Vite Dev Server (:5173)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_VISUAL_PLAYGROUND',
    queryKeywords: ['webgpu', 'memory palace', 'particles', 'bento', 'visual playground'],
  },
  image_creator: {
    featureLabel: 'image_creator',
    displayName: 'ComfyUI & Vision Reconstruction',
    description: 'ComfyUI workflows, Vision-Language Model inference, and scene reconstruction.',
    sveltekitRoutes: ['/api/comfyui', '/api/vision', '/api/vlm', '/api/reconstruction'],
    coreComponents: ['src/lib/components/ai/LocalImageGenerator.svelte', 'src/lib/server/seaweed-client.ts'],
    databaseTables: ['generated_assets', 'evidence_media'],
    backendServices: ['ComfyUI', 'SeaweedFS S3 (:8333)'],
    tokenBudget: 1536,
    nesFsmState: 'NES_STATE_IMAGE_GENERATION',
    queryKeywords: ['image creator', 'comfyui', 'vision', 'vlm', 'reconstruction'],
  },
  wiki: {
    featureLabel: 'wiki',
    displayName: 'Codebase Wiki & Knowledge Base',
    description: 'Codebase wiki articles, legal knowledge bases, and API documentation.',
    sveltekitRoutes: ['/codebase-wiki', '/api/wiki'],
    coreComponents: ['src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts'],
    databaseTables: ['codebase_chunk_index', 'legal_glossary'],
    backendServices: ['PostgreSQL pgvector (:5434)', 'CouchDB Wiki Store'],
    tokenBudget: 3072,
    nesFsmState: 'NES_STATE_WIKI_RETRIEVAL',
    queryKeywords: ['wiki', 'codebase wiki', 'knowledge base', 'statutes', 'documentation'],
  },
  user_db: {
    featureLabel: 'user_db',
    displayName: 'User & Person Of Interest Directory',
    description: 'Person of interest profiles, identity dossiers, and user account records.',
    sveltekitRoutes: ['/persons-of-interest', '/api/user', '/api/persons'],
    coreComponents: ['src/routes/(app)/persons-of-interest/+page.svelte'],
    databaseTables: ['users', 'persons_of_interest'],
    backendServices: ['PostgreSQL 18 (:5434)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_USER_ADMIN',
    queryKeywords: ['user db', 'poi', 'persons of interest', 'dossier', 'identity'],
  },
  cases: {
    featureLabel: 'cases',
    displayName: 'Case & Theory Management',
    description: 'Active case dossiers, litigation strategy, theory building, and status tracking.',
    sveltekitRoutes: ['/cases', '/active-cases', '/api/cases', '/api/case-theory'],
    coreComponents: ['src/routes/(app)/cases/+page.svelte', 'src/lib/components/yorha/dashboard/ActiveCasesWidget.svelte'],
    databaseTables: ['cases', 'case_theories', 'case_deadlines'],
    backendServices: ['PostgreSQL 18 (:5434)'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_CASE_THEORY',
    queryKeywords: ['cases', 'active cases', 'case theory', 'litigation', 'lawsuit'],
  },
  evidence: {
    featureLabel: 'evidence',
    displayName: 'Evidence Library & Custody Board',
    description: 'Evidence inventory, chain-of-custody tracking, and evidence board visualization.',
    sveltekitRoutes: ['/evidence', '/evidence-library', '/evidence-board', '/api/evidence'],
    coreComponents: ['src/routes/(app)/evidence/+page.svelte', 'src/lib/components/evidence/EvidencePrimaryUpload.svelte'],
    databaseTables: ['evidence', 'evidence_metadata', 'chain_of_custody'],
    backendServices: ['PostgreSQL 18 (:5434)', 'SeaweedFS (:8333)'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_EVIDENCE_CUSTODY',
    queryKeywords: ['evidence', 'evidence library', 'evidence board', 'custody', 'exhibit'],
  },
  search_rag: {
    featureLabel: 'search_rag',
    displayName: 'Global RAG & Vector Search',
    description: 'Global hybrid search, dense 768-d vector search, and dual-lane RRF retrieval.',
    sveltekitRoutes: ['/rag-search', '/global-search', '/api/rag', '/api/search', '/api/vector-search'],
    coreComponents: ['src/lib/server/retrieval/orchestrator.ts', 'src/lib/server/search/qdrant-search.ts'],
    databaseTables: ['codebase_chunk_index', 'retrieval_runs'],
    backendServices: ['Qdrant (:6333)', 'PostgreSQL pgvector (:5434)', 'Go Retrieval (:8100)'],
    tokenBudget: 4096,
    nesFsmState: 'NES_STATE_SEARCH_RRF',
    queryKeywords: ['search', 'rag', 'vector search', 'global search', 'rrf', 'dense search'],
  },
  knowledge_graph: {
    featureLabel: 'knowledge_graph',
    displayName: 'Codebase & Evidence Knowledge Graph',
    description: 'Neo4j and cuGraph topological traversal, AST dependencies, and relationship projections.',
    sveltekitRoutes: ['/codebase-graph', '/knowledge', '/admin/gpu-evidence-graph', '/api/graph'],
    coreComponents: ['src/lib/server/graph/graph-contract.ts', 'src/lib/server/graph/neo4j-gds-client.ts'],
    databaseTables: ['graph_node_metrics', 'atlas_som_cells'],
    backendServices: ['Neo4j (:7474)', 'cuGraph (:8098)'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_GRAPH_TOPOLOGY',
    queryKeywords: ['knowledge graph', 'codebase graph', 'neo4j', 'cugraph', 'ast topology'],
  },
  recommendations: {
    featureLabel: 'recommendations',
    displayName: 'Automated Recommendations & Suggestions',
    description: 'Next-best legal actions, related evidence suggestions, and procedure recommendations.',
    sveltekitRoutes: ['/recommendations', '/api/recommendations'],
    coreComponents: ['src/routes/(app)/recommendations/+page.svelte'],
    databaseTables: ['recommendation_records', 'feature_recommendations'],
    backendServices: ['PostgreSQL 18 (:5434)'],
    tokenBudget: 1536,
    nesFsmState: 'NES_STATE_RECOMMENDATIONS',
    queryKeywords: ['recommendations', 'suggestions', 'next actions', 'procedure suggestions'],
  },
  reports: {
    featureLabel: 'reports',
    displayName: 'Legal Reports & Brief Generator',
    description: 'Formal court reports, charging memo templates, and Markdown/HTML/PDF exports.',
    sveltekitRoutes: ['/reports', '/api/reports'],
    coreComponents: ['src/routes/(app)/reports/+page.svelte', 'src/routes/(app)/reports/new/+page.svelte'],
    databaseTables: ['reports', 'report_templates'],
    backendServices: ['PostgreSQL 18 (:5434)'],
    tokenBudget: 3072,
    nesFsmState: 'NES_STATE_REPORT_EXPORT',
    queryKeywords: ['reports', 'brief', 'charging memo', 'export report', 'pdf report'],
  },
  reconstruction_sim: {
    featureLabel: 'reconstruction_sim',
    displayName: 'Crime Reconstruction & Courtroom Simulation',
    description: '2D scene intent reconstruction, courtroom trial simulation, and scenario modeling.',
    sveltekitRoutes: ['/demos/crime-reconstruction', '/demos/scene-intent-2d', '/demos/courtroom-sim', '/simulation'],
    coreComponents: ['src/routes/(app)/simulation/+page.svelte'],
    databaseTables: ['simulation_runs', 'scene_events'],
    backendServices: ['YOLO-SAM (:3001)', 'WebGPU Canvas'],
    tokenBudget: 2048,
    nesFsmState: 'NES_STATE_SIMULATION_MODEL',
    queryKeywords: ['reconstruction', 'crime reconstruction', 'scene intent', 'courtroom sim', 'simulation'],
  },
  media_transcribe: {
    featureLabel: 'media_transcribe',
    displayName: 'Audio & Video Transcription Engine',
    description: 'Speech-to-text pipeline, whisper diarization, and audio ingestion services.',
    sveltekitRoutes: ['/api/video', '/api/audio', '/api/whisper'],
    coreComponents: ['src/lib/server/audio/whisper-client.ts'],
    databaseTables: ['transcription_jobs'],
    backendServices: ['nodejs-whisper / PyTorch STT', 'SeaweedFS (:8333)'],
    tokenBudget: 1536,
    nesFsmState: 'NES_STATE_SPEECH_TRANSCRIBE',
    queryKeywords: ['whisper', 'transcribe', 'audio transcribe', 'video audio', 'speech to text'],
  },
  upload_ingest: {
    featureLabel: 'upload_ingest',
    displayName: 'Modular Document & Evidence Upload',
    description: 'Multi-part file uploader, AI document pipeline ingestion, and virus scanning.',
    sveltekitRoutes: ['/demos/ai-file-upload', '/demos/modular-upload', '/api/ingest', '/api/ingestion'],
    coreComponents: ['src/lib/components/evidence/EvidencePrimaryUpload.svelte'],
    databaseTables: ['upload_jobs', 'analysis_jobs'],
    backendServices: ['SeaweedFS S3 (:8333)', 'RabbitMQ (:5673)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_UPLOAD_INGESTION',
    queryKeywords: ['upload', 'ingest', 'modular upload', 'file upload', 'document ingest'],
  },
  rich_text: {
    featureLabel: 'rich_text',
    displayName: 'Legal Rich Text & TipTap Editor',
    description: 'WYSIWYG document drafting, legal template formatting, and inline citation insertion.',
    sveltekitRoutes: ['/demos/rich-text-editor'],
    coreComponents: ['src/lib/components/ui/RichTextEditor.svelte', 'src/lib/components/editor/TipTapEditor.svelte'],
    databaseTables: ['draft_documents'],
    backendServices: ['Client TipTap Editor'],
    tokenBudget: 1536,
    nesFsmState: 'NES_STATE_DOCUMENT_DRAFT',
    queryKeywords: ['rich text', 'tiptap', 'editor', 'draft', 'wysiwyg'],
  },
  code_intel: {
    featureLabel: 'code_intel',
    displayName: 'Codebase Intelligence & AST Indexer',
    description: 'Tree-sitter CST analysis, semantic chunking, and repository function indexing.',
    sveltekitRoutes: ['/code-intel', '/codebase-index', '/api/codeintel'],
    coreComponents: ['src/lib/server/indexer/chunk-stream-pipeline.ts', 'src/lib/server/indexer/ast-ingest-logger.ts'],
    databaseTables: ['codebase_chunk_index', 'repo_function_registry'],
    backendServices: ['Tree-sitter Sidecar (:8095)', 'PostgreSQL 18 (:5434)'],
    tokenBudget: 3072,
    nesFsmState: 'NES_STATE_CODE_INTEL',
    queryKeywords: ['code intel', 'codebase index', 'ast', 'tree sitter', 'function registry'],
  },
  admin_ops: {
    featureLabel: 'admin_ops',
    displayName: 'System Administration & Operations',
    description: 'System configuration, cache monitors, TCP health gates, and service dashboard.',
    sveltekitRoutes: ['/admin', '/system-configuration', '/cache-monitor', '/api/admin'],
    coreComponents: ['src/routes/(app)/admin/+page.svelte', 'src/routes/(app)/system-configuration/+page.svelte'],
    databaseTables: ['audit_logs', 'system_metrics'],
    backendServices: ['PostgreSQL 18 (:5434)', 'Valkey / Redis (:6379)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_ADMIN_OPS',
    queryKeywords: ['admin', 'system configuration', 'cache monitor', 'ops', 'health check'],
  },
  terminal: {
    featureLabel: 'terminal',
    displayName: 'YoRHa Command-Line Interface',
    description: 'Raw console terminal, low-level command dispatch, and interactive system diagnostics.',
    sveltekitRoutes: ['/terminal'],
    coreComponents: ['src/routes/(app)/terminal/+page.svelte'],
    databaseTables: ['terminal_command_logs'],
    backendServices: ['PostgreSQL 18 (:5434)', 'Valkey Stream (:6379)'],
    tokenBudget: 1024,
    nesFsmState: 'NES_STATE_TERMINAL_CLI',
    queryKeywords: ['terminal', 'cli', 'console', 'command line', 'yorha terminal'],
  },
};

export const FEATURE_ALIASES_V1: Record<string, CanonicalFeatureLabel> = {
  'video_editor': 'media_transcribe',
  'video editor': 'media_transcribe',
  'video': 'media_transcribe',
  'photo_editor': 'image_creator',
  'photo editor': 'image_creator',
  'photo': 'image_creator',
  'forum': 'chat',
  'discussion': 'chat',
  'discussion board': 'chat',
  'message board': 'chat',
  'user db': 'user_db',
  'user database': 'user_db',
  'users': 'user_db',
  'ai assistant': 'ai_chat',
  'inference': 'ai_chat',
  'visual playground': 'html5_visual_playground',
  'bento': 'html5_visual_playground',
  'knowledge graph': 'knowledge_graph',
  'graph': 'knowledge_graph',
  'vector search': 'search_rag',
  'rag': 'search_rag',
};

export function isCanonicalFeatureLabel(label: string): label is CanonicalFeatureLabel {
  return (CANONICAL_FEATURE_LABELS as readonly string[]).includes(label);
}

export function resolveFeatureLabel(labelOrAlias: string): CanonicalFeatureLabel | null {
  const normalized = labelOrAlias.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isCanonicalFeatureLabel(normalized)) return normalized;
  const rawNormalized = labelOrAlias.trim().toLowerCase();
  if (FEATURE_ALIASES_V1[rawNormalized]) return FEATURE_ALIASES_V1[rawNormalized];
  if (FEATURE_ALIASES_V1[normalized]) return FEATURE_ALIASES_V1[normalized];
  return null;
}

export function getFeatureTaxonomyEntry(label: CanonicalFeatureLabel): FeatureTaxonomyEntryV1 {
  return FEATURE_TAXONOMY_V1[label];
}

export function matchFeatureLabel(queryOrPath: string): CanonicalFeatureLabel | null {
  const normalized = queryOrPath.trim().toLowerCase();
  if (!normalized) return null;

  const resolved = resolveFeatureLabel(normalized);
  if (resolved) return resolved;

  for (const [label, entry] of Object.entries(FEATURE_TAXONOMY_V1) as [CanonicalFeatureLabel, FeatureTaxonomyEntryV1][]) {
    for (const route of entry.sveltekitRoutes) {
      if (normalized === route || normalized.startsWith(`${route}/`)) {
        return label;
      }
    }
  }

  let bestLabel: CanonicalFeatureLabel | null = null;
  let highestScore = 0;

  // Score against taxonomy keywords
  for (const [label, entry] of Object.entries(FEATURE_TAXONOMY_V1) as [CanonicalFeatureLabel, FeatureTaxonomyEntryV1][]) {
    let score = 0;
    for (const kw of entry.queryKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(normalized)) {
        score += kw.length * 2;
      } else if (normalized.includes(kw)) {
        score += kw.length;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestLabel = label;
    }
  }

  // Score against aliases
  for (const [alias, targetLabel] of Object.entries(FEATURE_ALIASES_V1)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'i');
    let aliasScore = 0;
    if (regex.test(normalized)) {
      aliasScore = alias.length * 2;
    } else if (normalized.includes(alias)) {
      aliasScore = alias.length;
    }
    if (aliasScore > highestScore) {
      highestScore = aliasScore;
      bestLabel = targetLabel;
    }
  }

  return bestLabel;
}
