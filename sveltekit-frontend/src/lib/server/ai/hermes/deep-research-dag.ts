import { StateGraph, START, END } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/server/db/client';
import { kagDagRuns, kagDagNodes } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { runHermesPlanner, buildFallbackPlan, type HermesPlan } from '../hermes-planner.js';
import { resolveRuntimeConfig, type InferenceRuntimeConfig } from '../inference-configs.js';
import { synthesize } from '../hermes-synth.js';
import { writeNote } from '$lib/server/integrations/obsidian-client.js';
import { runConcurrentResearch, formatGraphForClaudeCode } from '../langgraph-research.js';
import { predictChunk } from '$lib/server/analysis/hmm-section-classifier.js';
import { queryTopology } from '$lib/server/retrieval/topology-search-client.js';
import { CudaGraphManager } from '../cuda-graph-manager.js';

type ResearchStage = 'qdrant' | 'couchdb' | 'neo4j' | 'deepImport' | 'clusters' | 'cudaPrefilter' | 'skillExecution';

const SKILL_STAGE_MAP: Record<string, ResearchStage[]> = {
  // Research
  deep_research: ['qdrant', 'clusters', 'deepImport', 'neo4j', 'skillExecution'],
  source_summarize: ['qdrant', 'couchdb', 'skillExecution'],
  citation_builder: ['qdrant', 'neo4j', 'skillExecution'],
  web_fallback: ['qdrant', 'skillExecution'],
  compare_sources: ['qdrant', 'couchdb', 'neo4j', 'skillExecution'],
  write_obsidian_note: ['qdrant', 'skillExecution'],
  create_research_brief: ['clusters', 'skillExecution'],
  find_contradictions: ['qdrant', 'couchdb', 'neo4j', 'skillExecution'],
  generate_questions: ['qdrant', 'skillExecution'],
  trend_analysis: ['qdrant', 'clusters', 'skillExecution'],
  source_provenance_audit: ['qdrant', 'skillExecution'],
  multi_perspective_synthesis: ['qdrant', 'clusters', 'couchdb', 'skillExecution'],
  identify_knowledge_gaps: ['qdrant', 'clusters', 'skillExecution'],
  hypothesis_generator: ['qdrant', 'skillExecution'],
  fact_check_claims: ['qdrant', 'skillExecution'],
  literature_review_builder: ['qdrant', 'couchdb', 'skillExecution'],
  detect_research_redundancy: ['qdrant', 'skillExecution'],
  cross_domain_mapping: ['qdrant', 'skillExecution'],
  automated_citation_validation: ['qdrant', 'skillExecution'],

  // Codebase
  search_codebase: ['qdrant', 'deepImport', 'skillExecution'],
  explain_file: ['qdrant', 'skillExecution'],
  trace_imports: ['deepImport', 'neo4j', 'skillExecution'],
  find_path_aliases: ['deepImport', 'skillExecution'],
  detect_server_client_leaks: ['qdrant', 'skillExecution'],
  summarize_directory: ['deepImport', 'clusters', 'skillExecution'],
  inspect_routes: ['deepImport', 'skillExecution'],
  find_env_usage: ['deepImport', 'skillExecution'],
  find_duplicate_logic: ['qdrant', 'skillExecution'],
  audit_drizzle_schema: ['qdrant', 'skillExecution'],
  detect_circular_imports: ['deepImport', 'skillExecution'],
  scan_todo_comments: ['deepImport', 'skillExecution'],
  generate_fix_plan: ['qdrant', 'clusters', 'skillExecution'],

  // Graph
  deep_import_graph_expand: ['deepImport', 'neo4j'],
  neo4j_expand_neighborhood: ['neo4j'],
  find_missing_edges: ['neo4j'],
  export_graph_jsonl: ['neo4j'],
  materialize_cluster_edges: ['neo4j'],
  graph_health_check: ['neo4j'],
  visualize_entity_map: ['neo4j'],
  shortest_path_search: ['neo4j'],
  cluster_cohesion_audit: ['neo4j', 'clusters'],
  detect_orphan_nodes: ['neo4j'],
  prune_stale_edges: ['neo4j'],
  batch_triple_extraction: ['neo4j'],
  identify_influence_nodes: ['neo4j'],
  graph_schema_validator: ['neo4j'],
  generate_graph_summary: ['neo4j'],
  discover_community_clusters: ['neo4j', 'clusters'],
  detect_structural_isomorphisms: ['neo4j'],
  graph_temporal_audit: ['neo4j'],
  bridge_node_discovery: ['neo4j'],
  graph_density_analysis: ['neo4j'],
  automated_schema_inference: ['neo4j', 'qdrant'],
  entity_resolution_audit: ['neo4j'],
  knowledge_graph_completeness_score: ['neo4j'],
  pathway_feasibility_check: ['neo4j'],
  graph_backed_recommendation: ['neo4j'],
  identify_weak_links: ['neo4j'],

  // Evidence
  ingest_pdf: ['qdrant'],
  ingest_video: ['qdrant'],
  transcribe_audio: ['qdrant'],
  extract_keyframes: ['qdrant'],
  OCR_images: ['qdrant'],
  tag_evidence: ['qdrant'],
  build_timeline: ['qdrant', 'neo4j'],
  verify_chain_of_custody: ['qdrant'],
  extract_entities_from_transcript: ['qdrant'],
  cluster_evidence_by_topic: ['qdrant', 'clusters'],
  cross_reference_witnesses: ['qdrant'],
  find_missing_evidence: ['qdrant'],

  // Vector/Cluster
  qdrant_search: ['qdrant'],
  encoded64_rerank: ['qdrant', 'cudaPrefilter'],
  cluster_summary_lenses: ['clusters'],
  topological_encyclopedia: ['clusters'],
  did_you_mean_corpus: ['qdrant'],
  centroid_compare: ['clusters'],
  payload_filter_search: ['qdrant'],
  cluster_rebalance_check: ['clusters'],
  vector_drift_analysis: ['clusters'],
  identify_outlier_chunks: ['qdrant'],
  semantic_overlap_map: ['qdrant', 'clusters'],
  batch_reindex_collection: ['qdrant'],
  multi_collection_fusion: ['qdrant', 'clusters'],
  cluster_membership_trace: ['qdrant', 'clusters'],
  semantic_search_with_boost: ['qdrant'],
  cluster_label_regenerator: ['clusters'],
  detect_duplicate_vectors: ['qdrant'],

  // Memory
  couchdb_view_query: ['couchdb'],
  redis_cache_lookup: ['qdrant'],
  postgres_session_lookup: ['qdrant'],
  qdrant_memory_search: ['qdrant'],
  write_session_summary: ['couchdb'],
  forget_stale_context: ['qdrant'],
  merge_duplicate_memories: ['couchdb'],
  extract_entities_for_long_term: ['couchdb'],
  cross_session_insight_discovery: ['qdrant'],
  memory_consistency_check: ['couchdb'],
  archive_inactive_sessions: ['couchdb'],
  update_importance_weights: ['qdrant'],
  search_related_wiki_cards: ['couchdb', 'qdrant'],
  audit_privacy_compliance: ['qdrant'],

  // Batch
  batch_metadata_extraction: ['qdrant'],
  background_report_generation: ['qdrant'],
  bulk_reindex_evidence: ['qdrant'],
  multi_file_repair_loop: ['qdrant'],
  periodic_cache_warmup: ['qdrant'],
  scheduled_backup_sync: ['qdrant'],
  batch_token_audit: ['qdrant'],
  automated_vulnerability_scan: ['qdrant'],
  bulk_tag_update: ['couchdb'],
  parallel_translation_pipeline: ['qdrant'],
  batch_link_validation: ['couchdb'],

  // Repair
  auto_fix_lint_errors: ['deepImport'],
  repair_broken_wiki_links: ['couchdb'],
  database_index_rebuild: ['qdrant'],
  reconcile_missing_vector_payloads: ['qdrant'],
  self_heal_broken_dependencies: ['deepImport'],
  fix_orphaned_file_metadata: ['qdrant'],
  repair_corrupted_json_blobs: ['qdrant'],
  validate_and_fix_graph_types: ['neo4j'],
  reset_hung_background_tasks: ['qdrant'],
  refresh_stale_mcp_configs: ['qdrant'],
  sync_missing_minio_objects: ['qdrant'],

  // Legal/Case
  case_intake: ['qdrant'],
  issue_spotter: ['qdrant', 'neo4j'],
  prior_case_crossref: ['qdrant', 'neo4j'],
  opinion_summarizer: ['qdrant'],
  judgment_extractor: ['qdrant'],
  claim_mapper: ['neo4j'],
  elements_checker: ['qdrant'],
  statute_lookup: ['qdrant'],
  precedent_search: ['qdrant', 'cudaPrefilter'],
  draft_legal_argument: ['neo4j'],
  procedural_history_tracker: ['qdrant'],
  witness_credibility_audit: ['qdrant'],
  discovery_gap_analysis: ['neo4j'],
  admissibility_checker: ['qdrant'],
  settlement_value_estimator: ['qdrant'],
  jurisdictional_conflict_detector: ['qdrant'],
  entity_relationship_profiler: ['neo4j'],
  bluebook_citation_audit: ['qdrant'],
  detect_legal_bias: ['qdrant'],
  summarize_statutory_framework: ['qdrant'],
  cross_jurisdictional_analysis: ['qdrant'],
  legal_reasoning_audit: ['qdrant'],
  detect_conflicting_authority: ['qdrant'],
  automated_case_briefing: ['qdrant'],
  sanctions_risk_evaluator: ['qdrant'],
  discovery_request_generator: ['qdrant'],
  predict_judicial_disposition: ['qdrant'],
  rebuttal_strategy_planner: ['qdrant'],

  // Simulation
  mock_trial: ['qdrant', 'skillExecution'],
  prosecutor_argument: ['qdrant', 'skillExecution'],
  defense_counter: ['qdrant', 'skillExecution'],
  judge_questions: ['qdrant', 'skillExecution'],
  cross_exam_simulator: ['qdrant', 'skillExecution'],
  objection_checker: ['qdrant', 'skillExecution'],
  jury_question_generator: ['qdrant', 'skillExecution'],
  outcome_probability_matrix: ['qdrant', 'skillExecution'],
  witness_coaching_report: ['qdrant', 'skillExecution'],
  evidence_impact_analysis: ['qdrant', 'skillExecution'],

  // GPU / Acceleration
  gpu_vram_audit: ['cudaPrefilter'],
  evict_unused_resident_models: ['cudaPrefilter'],
  optimize_kv_cache_config: ['cudaPrefilter'],
  gpu_accelerated_rerank: ['qdrant', 'cudaPrefilter'],
  topological_graph_filter: ['clusters', 'cudaPrefilter'],
  warm_up_vision_tower: ['cudaPrefilter'],
  quantization_level_check: ['cudaPrefilter'],
  batch_embedding_dispatch: ['cudaPrefilter'],
  profiling_inference_latency: ['cudaPrefilter'],
  cuda_kernel_health_check: ['cudaPrefilter'],
  allocate_temp_vram_scratch: ['cudaPrefilter'],
  launch_rotorquant_tier: ['cudaPrefilter'],
  launch_atomicbot_tier: ['cudaPrefilter'],
  benchmark_quantization_performance: ['cudaPrefilter'],
  autonomous_model_tier_selection: ['cudaPrefilter'],
  gpu_thermal_throttling_check: ['cudaPrefilter'],
  vram_fragmentation_defrag: ['cudaPrefilter'],
  multi_gpu_load_balancer: ['cudaPrefilter'],
  inference_cost_audit: ['cudaPrefilter'],

  // UI / Diagnostics
  route_smoke_test: ['deepImport'],
  stack_health_report: ['qdrant', 'couchdb', 'neo4j', 'clusters'],
  screenshot_report: ['deepImport'],
  client_side_error_log_audit: ['qdrant'],
  svelte_runes_migration_audit: ['deepImport'],
  bundle_size_analysis: ['deepImport'],
  network_latency_probe: ['qdrant'],
  accessibility_audit: ['deepImport'],
  ui_component_regression_test: ['deepImport'],
  trace_request_timeline: ['qdrant', 'couchdb', 'neo4j'],
  database_migration_status: ['qdrant'],
  automated_lighthouse_scan: ['deepImport'],

  // SystemAudit
  check_redis_memory_fragmentation: ['qdrant'],
  qdrant_collection_integrity_check: ['qdrant'],
  audit_api_route_auth_guards: ['deepImport'],
  audit_zod_request_validation: ['deepImport'],
  measure_cold_start_latency: ['qdrant'],
  monitor_worker_thread_pool_saturation: ['qdrant'],
  verify_simdjson_hotpath_dispatch: ['qdrant'],
  check_dangling_gpu_leases: ['cudaPrefilter'],
  audit_env_secret_exposure: ['deepImport'],
  validate_legal_corpus_freshness: ['qdrant'],
  audit_error_brain_correlation_accuracy: ['qdrant'],
  check_disk_pressure_seaweedfs: ['qdrant'],
  verify_grpc_port_mapping_consistency: ['qdrant'],
  audit_cross_origin_resource_sharing: ['qdrant'],
  monitor_database_connection_pool_leak: ['qdrant'],
};

// Add all SystemAudit skills to the map automatically to point to skillExecution stage
import { SYSTEM_AUDIT_SKILLS } from './skills/system-audit.js';
Object.keys(SYSTEM_AUDIT_SKILLS).forEach(id => {
  if (!SKILL_STAGE_MAP[id]) SKILL_STAGE_MAP[id] = ['skillExecution'];
});

export type ResearchState = {
  query: string;
  queryVector768?: number[];
  mode: string;
  writeToObsidian: boolean;
  userId?: number;
  sessionId?: string;
  caseId?: string;
  runId: string;
  parentTaskId?: string;

  runtime?: InferenceRuntimeConfig;
  plan?: HermesPlan;
  stageMask?: Record<ResearchStage, boolean>;

  qdrantHits?: Array<{ path: string; score: number; content: string; clusterId?: number }>;
  couchRows?: unknown[];
  neo4jGraph?: unknown;
  importGraph?: unknown;
  clusterLenses?: unknown[];
  activeClusterIds?: number[];
  cudaPrefilter?: unknown;

  contextPacket?: ResearchContextPacket;
  skillResults?: Record<string, any>;
  answer?: string;
  obsidianPath?: string | null;
  redisKeys?: string[];
  topologyContext?: unknown;

  error?: string;
};

export interface DeepResearchArtifacts {
  redisKeys: string[];
  postgresRunId: string;
  obsidianPath: string | null;
}

export interface DeepResearchResult {
  runId: string;
  plan: HermesPlan;
  runtime: InferenceRuntimeConfig;
  activeClusterIds: number[];
  contextPacket: ResearchContextPacket;
  answer: string;
  artifacts: DeepResearchArtifacts;
}

type QueryHmmSummary = {
  section: ReturnType<typeof predictChunk>['primaryState'];
  confidence: number;
  tokenCount: number;
};

type CompactHitSummary = {
  path: string;
  score: number;
  clusterId?: number;
  preview: string;
};

type ClusterLensSummary = {
  bucket: string;
  count: number;
};

type CudaPrefilterSummary = {
  prefilterBackend: string;
  encoded64Bits?: number | null;
  runtime: string;
  kvCache: { k: string; v: string };
  rerankedCount: number;
  topScore: number;
  activeClusterIds: number[];
};

type ResearchContextPacket = {
  query: string;
  mode: string;
  runtime?: InferenceRuntimeConfig;
  plan?: HermesPlan;
  queryHmm: QueryHmmSummary;
  qdrantHits: CompactHitSummary[];
  couchRows: unknown[];
  neo4jGraph: unknown;
  importGraph: unknown;
  clusterLenses: ClusterLensSummary[];
  activeClusterIds: number[];
  cudaPrefilter: CudaPrefilterSummary | { status: 'skipped' };
  skillResults: Record<string, any>;
  pipelineGaps: string[];
  promptSummary: string;
  topologyContext: unknown;
};

function fnv1a8(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).slice(0, 8).padStart(8, '0');
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'research';
}

function makeObsidianPath(query: string, runId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Research/Deep/${date}-${sanitizeSegment(query)}-${runId.slice(0, 8)}.md`;
}

function summarizeHits(hits: ResearchState['qdrantHits']): CompactHitSummary[] {
  return (hits ?? [])
    .slice(0, 8)
    .map((hit) => ({
      path: hit.path,
      score: hit.score,
      clusterId: hit.clusterId,
      preview: hit.content.slice(0, 180),
    }));
}

function summarizeClusterLenses(lenses: unknown[]): ClusterLensSummary[] {
  return lenses
    .flatMap((lens) => {
      if (!lens || typeof lens !== 'object') return [];
      const row = lens as { bucket?: unknown; count?: unknown };
      if (typeof row.bucket !== 'string' || typeof row.count !== 'number') return [];
      return [{ bucket: row.bucket, count: row.count }];
    })
    .slice(0, 8);
}

function summarizePipelineGaps(state: ResearchState): string[] {
  const enabled = Object.entries(state.stageMask ?? {})
    .filter(([, value]) => value)
    .map(([stage]) => stage);

  return Object.entries(state.stageMask ?? {})
    .filter(([, value]) => !value)
    .map(([stage]) => stage)
    .slice(0, 8)
    .concat(enabled.length ? [] : ['qdrant', 'clusters']);
}

function formatContextPacketForSynthesis(packet: ResearchContextPacket): string {
  const lines: string[] = [
    '# Deep Research Context',
    '',
    `## Query`,
    `- ${packet.query}`,
    `- mode: ${packet.mode}`,
    `- HMM section: ${packet.queryHmm.section} (${packet.queryHmm.confidence.toFixed(2)})`,
    `- token count: ${packet.queryHmm.tokenCount}`,
    '',
    '## Retrieval',
    `- hits: ${packet.qdrantHits.length}`,
  ];

  for (const hit of packet.qdrantHits.slice(0, 5)) {
    lines.push(`- ${hit.path} (score ${hit.score.toFixed(3)}${hit.clusterId !== undefined ? `, cluster ${hit.clusterId}` : ''})`);
    if (hit.preview) lines.push(`  - ${hit.preview}`);
  }

  lines.push('', '## Clusters', `- active cluster IDs: ${packet.activeClusterIds.length ? packet.activeClusterIds.join(', ') : 'none'}`);
  for (const lens of packet.clusterLenses.slice(0, 5)) {
    lines.push(`- ${lens.bucket}: ${lens.count}`);
  }

  lines.push('', '## CUDA Prefilter');
  if ('status' in packet.cudaPrefilter) {
    lines.push('- skipped');
  } else {
    lines.push(`- backend: ${packet.cudaPrefilter.prefilterBackend}`);
    lines.push(`- reranked: ${packet.cudaPrefilter.rerankedCount}`);
    lines.push(`- top score: ${packet.cudaPrefilter.topScore.toFixed(3)}`);
    lines.push(`- encoded64 bits: ${packet.cudaPrefilter.encoded64Bits ?? 'n/a'}`);
    lines.push(`- runtime: ${packet.cudaPrefilter.runtime}`);
    lines.push(`- kv cache: ${packet.cudaPrefilter.kvCache.k}/${packet.cudaPrefilter.kvCache.v}`);
  }
  
  if (Array.isArray(packet.topologyContext) && packet.topologyContext.length > 0) {
    lines.push('', '## Topological Context');
    for (const topo of packet.topologyContext.slice(0, 5)) {
      lines.push(`- ${topo.clusterId}: ${topo.summary}`);
    }
  }

  if (packet.pipelineGaps.length > 0) {
    lines.push('', '## Pipeline Gaps', `- ${packet.pipelineGaps.join(', ')}`);
  }

  if (packet.plan) {
    lines.push('', '## Planner', `- intent: ${packet.plan.intent}`, `- risk: ${packet.plan.risk}`, `- tools: ${packet.plan.tools.map((tool) => tool.name).join(', ') || 'none'}`);
  }

  return lines.join('\n');
}

function shouldRunStage(stage: ResearchStage, plan: HermesPlan | undefined): boolean {
  if (!plan) return true;
  const selected = new Set<ResearchStage>(['qdrant', 'clusters']);
  for (const tool of plan.tools) {
    const mapped = SKILL_STAGE_MAP[tool.name];
    if (mapped) for (const item of mapped) selected.add(item);
  }
  return selected.has(stage);
}

async function logNode(
  runId: string,
  nodeKey: string,
  nodeType: string,
  input: unknown,
  output: unknown,
): Promise<void> {
  await db.insert(kagDagNodes).values({
    runId,
    nodeKey,
    nodeType,
    input,
    output,
    status: 'completed',
    finishedAt: new Date(),
  }).catch(() => {});
}

function buildStageMask(plan: HermesPlan): Record<ResearchStage, boolean> {
  const mask: Record<ResearchStage, boolean> = {
    qdrant: false,
    couchdb: false,
    neo4j: false,
    deepImport: false,
    clusters: false,
    cudaPrefilter: false,
    skillExecution: false,
  };

  for (const stage of Object.keys(mask) as ResearchStage[]) {
    mask[stage] = shouldRunStage(stage, plan);
  }

  return mask;
}

function buildContextPacket(state: ResearchState): ResearchContextPacket {
  const queryHmm = predictChunk(state.query);
  const qdrantHits = summarizeHits(state.qdrantHits);
  const clusterLenses = summarizeClusterLenses(state.clusterLenses ?? []);
  const pipelineGaps = summarizePipelineGaps(state);
  const cudaPrefilter = (state.cudaPrefilter ?? { status: 'skipped' }) as ResearchContextPacket['cudaPrefilter'];
  const promptSummary = formatContextPacketForSynthesis({
    query: state.query,
    mode: state.mode,
    runtime: state.runtime,
    plan: state.plan,
    queryHmm: {
      section: queryHmm.primaryState,
      confidence: queryHmm.confidence,
      tokenCount: queryHmm.stateSequence.length,
    },
    qdrantHits,
    couchRows: state.couchRows ?? [],
    neo4jGraph: state.neo4jGraph ?? {},
    importGraph: state.importGraph ?? {},
    clusterLenses,
    activeClusterIds: state.activeClusterIds ?? [],
    cudaPrefilter,
    skillResults: state.skillResults ?? {},
    pipelineGaps,
    promptSummary: '',
    topologyContext: state.topologyContext ?? [],
  } satisfies ResearchContextPacket);

  return {
    query: state.query,
    mode: state.mode,
    runtime: state.runtime,
    plan: state.plan,
    queryHmm: {
      section: queryHmm.primaryState,
      confidence: queryHmm.confidence,
      tokenCount: queryHmm.stateSequence.length,
    },
    qdrantHits,
    couchRows: state.couchRows ?? [],
    neo4jGraph: state.neo4jGraph ?? {},
    importGraph: state.importGraph ?? {},
    clusterLenses,
    activeClusterIds: state.activeClusterIds ?? [],
    cudaPrefilter,
    skillResults: state.skillResults ?? {},
    pipelineGaps,
    promptSummary,
    topologyContext: state.topologyContext ?? [],
  };
}

async function hermesPlanNode(state: ResearchState) {
  const signals = {
    hasEncoded64: true,
    hasClusterSummaries: true,
    hasNeo4j: true,
    hasCouchViews: true,
  };

  try {
    const plan = await runHermesPlanner({
      userQuery: state.query,
      aceMode: (state.mode === 'search' || state.mode === 'debug' || state.mode === 'repair' || state.mode === 'analyze') ? state.mode : 'analyze',
      availableSignals: signals,
    });
    await logNode(state.runId, 'plan', 'planner', { query: state.query, mode: state.mode }, plan);
    return { plan, stageMask: buildStageMask(plan) };
  } catch (err) {
    const plan = buildFallbackPlan('analyze', state.query, signals);
    await logNode(state.runId, 'plan', 'planner', { query: state.query, mode: state.mode, fallback: true }, plan);
    return { plan, stageMask: buildStageMask(plan), error: err instanceof Error ? err.message : String(err) };
  }
}

async function runtimeTruthNode(state: ResearchState) {
  const runtime = resolveRuntimeConfig();
  await logNode(state.runId, 'runtime', 'system', { mode: state.mode }, runtime);
  return { runtime };
}

async function redisTopologyNode(state: ResearchState) {
  const topologyContext: any[] = [];
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    
    // Fetch some hot cluster summaries to inject into context
    const keys = await redis.keys('summary:cluster:*');
    if (keys.length > 0) {
      const vals = await redis.mget(keys.slice(0, 5));
      for (const val of vals) {
        if (val) topologyContext.push(JSON.parse(val));
      }
    }
    await redis.quit();
    await logNode(state.runId, 'redisTopology', 'retrieval', { query: state.query }, { clustersFound: topologyContext.length });
  } catch (e) {
    console.warn('[DAG] Failed to fetch topology context from Redis:', e);
  }
  return { topologyContext };
}

async function qdrantNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('qdrant', state.plan)) {
    return { qdrantHits: [] };
  }

  const research = await runConcurrentResearch(state.query, {
    domains: undefined,
    limitPerWorker: 6,
    timeoutMs: 120_000,
  });

  const qdrantHits = research.workerFindings.flatMap((w) =>
    w.chunks.map((chunk) => ({
      path: chunk.path,
      score: chunk.score,
      content: chunk.content,
      clusterId: chunk.gpuCluster ?? undefined
    }))
  );

  await logNode(state.runId, 'qdrant', 'retrieval', { query: state.query }, {
    workerCount: research.workerFindings.length,
    hitCount: qdrantHits.length,
  });

  return { qdrantHits, queryVector768: research.queryEmbedding };
}

async function couchNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('couchdb', state.plan)) {
    return { couchRows: [] };
  }

  const couchRows = state.qdrantHits?.slice(0, 5).map((hit) => ({
    key: hit.path,
    score: hit.score,
    note: hit.content.slice(0, 240),
  })) ?? [];

  await logNode(state.runId, 'couchdb', 'retrieval', { query: state.query }, { rowCount: couchRows.length });
  return { couchRows };
}

async function neo4jNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('neo4j', state.plan)) {
    return { neo4jGraph: {} };
  }

  const neo4jGraph = {
    nodes: [...new Set((state.qdrantHits ?? []).map((hit) => hit.path.split('/')[0]).filter(Boolean))].slice(0, 12),
    edges: (state.qdrantHits ?? []).slice(0, 8).map((hit) => ({ from: hit.path, to: hit.path.split('/').slice(-1)[0] ?? hit.path })),
  };

  await logNode(state.runId, 'neo4j', 'retrieval', { query: state.query }, neo4jGraph);
  return { neo4jGraph };
}

async function deepImportNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('deepImport', state.plan)) {
    return { importGraph: {} };
  }

  const importGraph = {
    paths: (state.qdrantHits ?? []).slice(0, 10).map((hit) => hit.path),
  };

  await logNode(state.runId, 'deepImport', 'retrieval', { query: state.query }, importGraph);
  return { importGraph };
}

async function clusterLensNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('clusters', state.plan)) {
    return { clusterLenses: [], activeClusterIds: [] };
  }

  const activeClusterIds = [...new Set(
    (state.qdrantHits ?? [])
      .map((hit) => hit.clusterId)
      .filter((id): id is number => typeof id === 'number')
  )];

  const clusterLenses = [...new Map((state.qdrantHits ?? []).map((hit) => {
    const bucket = hit.path.split('/')[0] ?? 'root';
    return [bucket, { bucket, count: 1 }];
  })).values()];

  await logNode(state.runId, 'clusters', 'retrieval', { query: state.query }, { count: clusterLenses.length, activeClusterIds });
  return { clusterLenses, activeClusterIds };
}

async function cudaTopologyPrefilterNode(state: ResearchState) {
  if (!state.plan || !shouldRunStage('cudaPrefilter', state.plan) || !state.qdrantHits?.length) {
    return { cudaPrefilter: { status: 'skipped' } };
  }

  // ── Honest CUDA Graph Sidecar ───────────────────────────────────────────────
  // Use CUDA Graphs for fixed-shape GPU hot paths (768->64 projection).
  let prefilterBackend = 'none';
  let encoded64: number[] | null = null;

  if (state.queryVector768 && CudaGraphManager.isAvailable()) {
    const input = Float32Array.from(state.queryVector768);
    const key = 'topology:1x768';
    await CudaGraphManager.captureIfMissing(key, [1, 768]);
    const cuda = await CudaGraphManager.replay(key, input);
    if (cuda) {
      encoded64 = Array.from(cuda);
      prefilterBackend = 'cuda_graph';
    }
  }

  // Attempt real topological rerank via manifold4 service
  let rankedHits = [...state.qdrantHits];
  let topoResult = null;

  try {
    topoResult = await queryTopology(state.query, { limit: 20, radius: 0.8 });
    if (topoResult?.hits?.length) {
      prefilterBackend = prefilterBackend === 'cuda_graph' ? 'cuda_graph+manifold4' : 'manifold4_remote';
      // Map topo hits back to qdrant hits or use them directly
      rankedHits = topoResult.hits.map(h => ({
        path: h.path || '',
        score: h.manifoldScore || h.cosineScore || 0,
        content: h.contentPreview || '',
        clusterId: h.somCluster ?? undefined
      }));
    } else {
      // Fallback: simple score sort
      rankedHits.sort((a, b) => b.score - a.score).slice(0, 20);
    }
  } catch (err) {
    console.error('[cudaPrefilter] Topo query failed, falling back:', err);
    rankedHits.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  const activeClusterIdsFromTopo = topoResult?.hits
    .map(h => h.somCluster)
    .filter((id): id is number => typeof id === 'number') ?? [];

  const cudaPrefilter = {
    prefilterBackend,
    encoded64,
    runtime: state.runtime?.profile ?? 'unknown',
    kvCache: {
      k: state.runtime?.kvCacheTypeK ?? 'q8_0',
      v: state.runtime?.kvCacheTypeV ?? 'q8_0',
    },
    rerankedCount: rankedHits.length,
    topScore: rankedHits[0]?.score ?? 0,
    activeClusterIds: activeClusterIdsFromTopo
  };

  await logNode(state.runId, 'cudaPrefilter', 'gpu-accelerated-rerank', { hitCount: rankedHits.length, source: prefilterBackend }, cudaPrefilter);

  // Merge active cluster IDs
  const combinedClusterIds = [...new Set([...(state.activeClusterIds || []), ...activeClusterIdsFromTopo])];

  return { cudaPrefilter, qdrantHits: rankedHits, activeClusterIds: combinedClusterIds };
}

async function skillExecutionNode(state: ResearchState) {
  if (!state.plan?.tools?.length) return { skillResults: {} };

  const { hermesDispatcher } = await import('./dispatcher.js');
  const skillResults: Record<string, any> = {};

  for (const tool of state.plan.tools) {
    // If the skill is NOT one of the primary retrieval stages, execute it here
    const stages = SKILL_STAGE_MAP[tool.name] || [];
    if (stages.includes('skillExecution')) {
      const result = await hermesDispatcher.executeSkill(tool.name, tool.arguments, {
        userId: state.userId,
        runId: state.runId,
        userQuery: state.query,
        parentTaskId: state.runId, // Treat this node as parent for the skill execution
      });
      skillResults[tool.name] = result;
    }
  }

  await logNode(state.runId, 'skills', 'skill-execution', { skillCount: Object.keys(skillResults).length }, skillResults);
  return { skillResults };
}

async function contextPackerNode(state: ResearchState) {
  const contextPacket = buildContextPacket(state);
  await logNode(state.runId, 'pack', 'synthesis', {}, { size: JSON.stringify(contextPacket).length });
  return { contextPacket };
}

async function gemmaComposerNode(state: ResearchState) {
  const contextPacket = state.contextPacket ?? buildContextPacket(state);
  const synthesis = await synthesize('gemma4', state.query, contextPacket.promptSummary);
  await logNode(state.runId, 'compose', 'synthesis', { contextSize: contextPacket.promptSummary.length }, { answer: synthesis.answer.slice(0, 200) });
  return { answer: synthesis.answer };
}

async function persistResultNode(state: ResearchState) {
  if (!state.writeToObsidian) return { obsidianPath: null };

  const obsidianPath = makeObsidianPath(state.query, state.runId);
  const markdown = [
    `---`,
    `type: deep-research`,
    `runId: ${state.runId}`,
    `mode: ${state.mode}`,
    `runtime: ${state.runtime?.profile ?? 'unknown'}`,
    `---`,
    '',
    `# ${state.query}`,
    '',
    state.answer ?? '',
    '',
    `## Context`,
    '```json',
    JSON.stringify(state.contextPacket ?? {}, null, 2),
    '```',
  ].join('\n');

  const ok = await writeNote(obsidianPath, markdown);
  const persistedPath = ok ? obsidianPath : null;
  await logNode(state.runId, 'persist', 'persist', { obsidianPath }, { ok, obsidianPath: persistedPath });
  return { obsidianPath: persistedPath };
}

export function buildResearchDag() {
  const graph = new StateGraph<ResearchState>({
    channels: {
      query: null,
      mode: null,
      writeToObsidian: null,
      userId: null,
      sessionId: null,
      caseId: null,
      runId: null,
      parentTaskId: null,
      runtime: null,
      plan: null,
      stageMask: null,
      qdrantHits: null,
      couchRows: null,
      neo4jGraph: null,
      importGraph: null,
      clusterLenses: null,
      cudaPrefilter: null,
      skillResults: null,
      contextPacket: null,
      answer: null,
      obsidianPath: null,
      redisKeys: null,
      topologyContext: null,
      error: null,
    },
  });

  graph.addNode('planner', hermesPlanNode);
  graph.addNode('runtimeCheck', runtimeTruthNode);
  graph.addNode('redisTopology', redisTopologyNode);
  graph.addNode('qdrant', qdrantNode);
  graph.addNode('couchdb', couchNode);
  graph.addNode('neo4j', neo4jNode);
  graph.addNode('deepImport', deepImportNode);
  graph.addNode('clusters', clusterLensNode);
  graph    .addNode('cudaTopologyPrefilter', cudaTopologyPrefilterNode)
    .addNode('skillExecution', skillExecutionNode)
    .addNode('pack', contextPackerNode);
  graph.addNode('compose', gemmaComposerNode);
  graph.addNode('persist', persistResultNode);

  const workflow = graph as any;
  workflow.addEdge(START, 'planner');
  workflow.addEdge('planner', 'runtimeCheck');
  workflow.addEdge('runtimeCheck', 'redisTopology');
  workflow.addEdge('redisTopology', 'qdrant');
  workflow.addEdge('redisTopology', 'cudaTopologyPrefilter');
  workflow.addEdge('qdrant', 'couchdb');
  workflow.addEdge('qdrant', 'neo4j');
  workflow.addEdge('qdrant', 'deepImport');
  workflow.addEdge('qdrant', 'clusters');
  workflow.addEdge('qdrant', 'pack');
  workflow.addEdge('couchdb', 'pack');
  workflow.addEdge('neo4j', 'pack');
  workflow    .addEdge('deepImport', 'clusters')
    .addEdge('clusters', 'cudaTopologyPrefilter')
    .addEdge('cudaTopologyPrefilter', 'skillExecution')
    .addEdge('skillExecution', 'pack')
    .addEdge('pack', 'compose');
  workflow.addEdge('compose', 'persist');
  workflow.addEdge('persist', END);

  return workflow.compile();
}

export async function executeDeepResearch(params: {
  query: string;
  mode?: string;
  writeToObsidian?: boolean;
  userId?: number;
  sessionId?: string;
  caseId?: string;
  parentTaskId?: string;
}): Promise<DeepResearchResult> {
  const runId = uuidv4();
  const queryHash = fnv1a8(params.query);

  await db.insert(kagDagRuns).values({
    id: runId,
    query: params.query,
    queryHash: sql`md5(${params.query})`,
    status: 'running',
    model: 'hermes-langgraph-dag',
    metadata: { parentTaskId: params.parentTaskId, mode: params.mode ?? 'deep-research' },
  });

  const dag: any = buildResearchDag();
  const initialState: ResearchState = {
    query: params.query,
    mode: params.mode ?? 'deep-research',
    writeToObsidian: params.writeToObsidian ?? false,
    userId: params.userId,
    sessionId: params.sessionId,
    caseId: params.caseId,
    parentTaskId: params.parentTaskId,
    runId,
    qdrantHits: [],
    couchRows: [],
    clusterLenses: [],
    activeClusterIds: [],
    redisKeys: [`hermes:deep:plan:${queryHash}`, `hermes:deep:graph:${queryHash}`],
  };

  const finalState = (await dag.invoke(initialState)) as ResearchState;
  const artifacts: DeepResearchArtifacts = {
    redisKeys: finalState.redisKeys ?? initialState.redisKeys ?? [],
    postgresRunId: runId,
    obsidianPath: finalState.obsidianPath ?? null,
  };

  await db.update(kagDagRuns)
    .set({
      status: finalState.error ? 'failed' : 'completed',
      finalAnswer: finalState.answer,
      totalDurationMs: null,
      finishedAt: new Date(),
    })
    .where(sql`${kagDagRuns.id} = ${runId}`);

  return {
    runId,
    plan: finalState.plan ?? buildFallbackPlan('analyze', params.query, {
      hasEncoded64: true,
      hasClusterSummaries: true,
      hasNeo4j: true,
      hasCouchViews: true,
    }),
    runtime: finalState.runtime ?? resolveRuntimeConfig(),
    activeClusterIds: finalState.activeClusterIds ?? [],
    contextPacket: finalState.contextPacket ?? buildContextPacket(finalState),
    answer: finalState.answer ?? '',
    artifacts,
  };
}

export { formatGraphForClaudeCode };
