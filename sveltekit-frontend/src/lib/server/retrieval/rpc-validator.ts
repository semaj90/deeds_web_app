import { z } from 'zod';

// Define the required contract schemas according to the Parent Atlas Contract Spine
export const AtlasSearchRequestSchema = z.object({
  query: z.string().min(1),
  query_hash: z.string().optional(),
  story_id: z.string().optional(),
  task_id: z.string().optional(),
  worker_id: z.string().optional(),
  trace_id: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const PacketContextSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  source_ref_key: z.string().optional(),
  canonical_source_ref: z.string().optional(),
  feature_id: z.string(),
  feature_label: z.string().optional(),
  story_id: z.string().optional(),
  task_id: z.string().optional(),
  worker_id: z.string().optional(),
  trace_id: z.string().optional(),
  domain_class: z.string().optional(),
  path_label: z.string().optional(),
  ontology_label: z.string().optional(),
  topology_label: z.string().optional(),
  som_cluster: z.string().optional(),
  kmeans_cluster: z.string().optional(),
  cluster_key: z.string().optional(),
  community_id: z.string().optional(),
  fusion_score: z.number().optional(),
});

export const ProvenanceRecordSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  source_ref_key: z.string().optional(),
  feature_id: z.string(),
  story_id: z.string().optional(),
  task_id: z.string().optional(),
  worker_id: z.string().optional(),
  trace_id: z.string().optional(),
  verdict: z.string().optional(),
});

export const CacheProofSchema = z.object({
  cache_namespace: z.string().min(1),
  cache_key: z.string().min(1),
  cache_hit_source: z.string().optional(),
  packet_key: z.string().optional(),
  feature_id: z.string().optional(),
});

export const GraphProofSchema = z.object({
  packet_key: z.string().optional(),
  traversal_path: z.array(z.string()),
  graph_stage_status: z.string().min(1),
});

export const Gemma4RecommendationSchema = z.object({
  recommendedFiles: z.array(z.string()),
  recommendedCommands: z.array(z.string()),
  repairPrompt: z.string().min(1),
  story_id: z.string().optional(),
  task_id: z.string().optional(),
});

export const VerifierVerdictSchema = z.object({
  verdict: z.enum(['PASS', 'FAIL', 'PARTIAL']),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  story_id: z.string().optional(),
  task_id: z.string().optional(),
});

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.record(z.string(), z.any()).default({}),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

// Mapping from known aliases to the canonical spine fields
const FIELD_ALIASES: Record<string, string> = {
  packetKey: 'packet_key',
  sourceRef: 'source_ref',
  sourceRefKey: 'source_ref_key',
  canonicalSourceRef: 'canonical_source_ref',
  featureId: 'feature_id',
  featureLabel: 'feature_label',
  storyId: 'story_id',
  taskId: 'task_id',
  workerId: 'worker_id',
  traceId: 'trace_id',
  queryHash: 'query_hash',
  cacheNamespace: 'cache_namespace',
  cacheKey: 'cache_key',
  cacheHitSource: 'cache_hit_source',
  graphStageStatus: 'graph_stage_status',
  traversalPath: 'traversal_path',
  domainClass: 'domain_class',
  pathLabel: 'path_label',
  ontologyLabel: 'ontology_label',
  topologyLabel: 'topology_label',
  somCluster: 'som_cluster',
  kmeansCluster: 'kmeans_cluster',
  clusterKey: 'cluster_key',
  communityId: 'community_id',
  fusionScore: 'fusion_score',
};

const ALLOWED_METHODS = new Set([
  'atlas.search',
  'atlas.packet.get',
  'atlas.cache.warm',
  'atlas.graph.expand',
  'atlas.provenance.get',
  'atlas.replay.verify',
  'atlas.recommend.fix',
]);

const COARSE_FEATURE_ID_VALUES = new Set([
  'db',
  'routes',
  'ai',
  'api',
  'ui',
  'graph',
  'search',
  'retrieval',
  'packet',
]);

function isCoarseFeatureId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (COARSE_FEATURE_ID_VALUES.has(normalized)) return true;
  return /^[a-z]{1,4}$/.test(normalized) && !/[./:_-]/.test(normalized);
}

/**
 * Normalizes input object fields to canonical contract fields.
 */
export function normalizeContractFields(params: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, val] of Object.entries(params)) {
    const canonicalKey = FIELD_ALIASES[key] || key;
    normalized[canonicalKey] = val;
  }
  return normalized;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedMethod?: string;
  normalizedParams?: Record<string, any>;
  jsonrpc?: '2.0';
  id?: string | number | null;
}

/**
 * Parses and validates an incoming JSON-RPC 2.0 message against the Parent Atlas schemas.
 */
export function validateJsonRpcMessage(rawMessage: string | Record<string, any>): ValidationResult {
  let parsed: any;
  if (typeof rawMessage === 'string') {
    try {
      parsed = JSON.parse(rawMessage);
    } catch (e: any) {
      return { valid: false, error: `Invalid JSON format: ${e.message}` };
    }
  } else {
    parsed = rawMessage;
  }

  // 1. Validate envelope basic shape
  const envelopeResult = JsonRpcRequestSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    return {
      valid: false,
      error: `Invalid JSON-RPC 2.0 envelope: ${envelopeResult.error.message}`,
    };
  }

  const { jsonrpc, method, params, id } = envelopeResult.data;

  // Reject mixed protobuf/gRPC styles
  if (parsed.proto || parsed.protobuf || method.includes('/') || parsed.service) {
    return { valid: false, error: 'Rejection: Mixed gRPC/protobuf fields into JSON-RPC payload.' };
  }

  // 2. Allowlist check
  if (!ALLOWED_METHODS.has(method)) {
    return { valid: false, error: `Rejection: Unknown method '${method}'` };
  }

  // 3. Normalize parameters aliases
  const normalizedParams = normalizeContractFields(params);

  // 4. Validate parameters based on method type
  try {
    switch (method) {
      case 'atlas.search': {
        // Must validate AtlasSearchRequest
        const check = AtlasSearchRequestSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        break;
      }
      case 'atlas.packet.get': {
        // Must validate PacketContext
        const check = PacketContextSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        // Omit check: required fields
        if (!normalizedParams.packet_key || !normalizedParams.source_ref || !normalizedParams.feature_id) {
          return { valid: false, error: 'Rejection: missing required fields packet_key/source_ref/feature_id.' };
        }
        if (isCoarseFeatureId(normalizedParams.feature_id)) {
          return {
            valid: false,
            error: 'Rejection: coarse labels must not occupy feature_id; use domain_class or path_label instead.',
          };
        }
        break;
      }
      case 'atlas.cache.warm': {
        // Must validate CacheProof
        const check = CacheProofSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        // Reject if cache key has no namespace
        const cacheKey = normalizedParams.cache_key || '';
        const namespace = normalizedParams.cache_namespace || '';
        if (!cacheKey || !namespace || !cacheKey.includes(':') || !cacheKey.startsWith(namespace + ':')) {
          return { valid: false, error: 'Rejection: cache keys must contain the namespace prefix.' };
        }
        break;
      }
      case 'atlas.graph.expand': {
        // Must validate GraphProof
        const check = GraphProofSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        // Reject if traversal_path is empty or missing
        if (!normalizedParams.traversal_path || !normalizedParams.traversal_path.length) {
          return { valid: false, error: 'Rejection: traversal_path is empty or missing.' };
        }
        break;
      }
      case 'atlas.provenance.get': {
        // Must validate ProvenanceRecord
        const check = ProvenanceRecordSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        if (isCoarseFeatureId(normalizedParams.feature_id)) {
          return {
            valid: false,
            error: 'Rejection: coarse labels must not occupy feature_id; use domain_class or path_label instead.',
          };
        }
        break;
      }
      case 'atlas.replay.verify': {
        // Must validate VerifierVerdict
        const check = VerifierVerdictSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        // Claim PASS without evidence
        if (normalizedParams.verdict === 'PASS' && (!normalizedParams.evidence || normalizedParams.evidence.length === 0)) {
          return { valid: false, error: 'Rejection: Cannot claim PASS without supporting evidence.' };
        }
        break;
      }
      case 'atlas.recommend.fix': {
        // Must validate Gemma4Recommendation
        const check = Gemma4RecommendationSchema.safeParse(normalizedParams);
        if (!check.success) {
          return { valid: false, error: `Params validation failed for ${method}: ${check.error.message}` };
        }
        break;
      }
      default:
        return { valid: false, error: `Unimplemented method validation '${method}'` };
    }
  } catch (err: any) {
    return { valid: false, error: `Internal validator error: ${err.message}` };
  }

  return {
    valid: true,
    jsonrpc,
    normalizedMethod: method,
    normalizedParams,
    id,
  };
}
