/**
 * Parent Atlas Core Package — Identity, Schemas, Retrieval Contracts & Policies
 * Exports: frozen identity contract, Postgres schema types, retrieval facades, adapter interfaces
 * Zero dependencies: no databases, no SvelteKit, no infrastructure
 *
 * Core exports:
 *   - Retrieval contracts (RetrievalFacade, RetrievalRequest, RetrievalResult)
 *   - Retrieval policies (RetrievalPolicy, PolicyRegistry, DEFAULT_POLICIES)
 *   - Packet identity (canonical chain, dedupe contracts)
 *   - Context assembly (AceContext, RlmContext)
 *   - Provenance tracking (RetrievalTrace)
 */

// Retrieval facade and contracts
export type { RetrievalFacade, RetrievalRequest, RetrievalResult, RetrievalUseCase, RetrievalPolicy, PolicyRegistry, RankedCandidate } from './contracts/retrieval.js';
export { DEFAULT_POLICIES, DefaultPolicyRegistry, getPolicyRegistry, setPolicyRegistry } from './contracts/policy-registry.js';

// Identity contract (frozen lineage chain)
export type IdentityChain = {
  directory_path: string;
  source_ref: string;
  file_path: string;
  function_symbol: string;
  feature_id: string;
  feature_label: string;
  packet_key: string;
};

export const IDENTITY_CONTRACT = {
  version: '1.0',
  chain: ['directory_path', 'source_ref', 'file_path', 'function_symbol', 'feature_id', 'feature_label', 'packet_key'],
  canonical_store: 'postgres',
  mirrors: ['qdrant', 'neo4j', 'redis', 'couchdb'],
} as const;

// TurboVec metadata contract
export type TurboVecMetadata = {
  model: string;
  dimension: number;
  quantizer?: string;
  clusterId?: number;
  manifold4?: number[];
  sourceRef?: string;
};

// Postgres packet types
export type ParentAtlasPacket = {
  id: string;
  directory_path: string;
  source_ref: string;
  file_path: string;
  function_symbol: string;
  feature_id: string;
  feature_label: string;
  packet_key: string;
  summary: string;
  qdrant_point_id?: string;
  redis_key?: string;
  cold_storage_uri?: string;
  created_at: Date;
  updated_at: Date;
};

// Verification gates
export async function verifyLineageContract(packet: ParentAtlasPacket): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!packet.directory_path) errors.push('missing directory_path');
  if (!packet.source_ref) errors.push('missing source_ref');
  if (!packet.file_path) errors.push('missing file_path');
  if (!packet.function_symbol) errors.push('missing function_symbol');
  if (!packet.feature_id) errors.push('missing feature_id');
  if (!packet.feature_label) errors.push('missing feature_label');
  if (!packet.packet_key) errors.push('missing packet_key');

  return {
    passed: errors.length === 0,
    errors,
  };
}

// ================================================================================
// STAGE 7: GEMMA4 POLICY ORCHESTRATOR (Agent-to-Agent Thinking)
// ================================================================================

export type {
  PolicyOrchestratorConfig,
  DecomposedQuery,
  Subgoal,
  ScoredCandidate,
  PolicyScore,
  ACEContext,
  SynthesisResult,
  PolicyOrchestrationResult
} from './policy-orchestrator.js';

export {
  ParentAtlasPolicyOrchestrator,
  createPolicyOrchestrator
} from './policy-orchestrator.js';

// ================================================================================
// EXTENDED TYPES (Policy + Retrieval)
// ================================================================================

export type {
  PacketIdentity,
  Packet,
  CacheEntry,
  GPUMetrics,
  RetrievalTrace,
  PolicyTrace,
  SearchQuery,
  SearchResponse,
  BenchmarkResult,
  AtlasConfig,
  HealthCheck
} from './types.js';

/**
 * API version marker
 */
export const ATLAS_API_VERSION = '1.0.0-alpha';

/**
 * Complete stage inventory
 */
export const ATLAS_STAGES = [
  'Bifrost Semantic Cache',
  'TurboVec Prefilter',
  'TurboVec Reranking',
  'LibTorch GPU',
  'Rust SIMD',
  'Parent Atlas Identity Contract',
  'Gemma4 Policy Orchestrator'
] as const;
