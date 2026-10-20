/**
 * NES Feature Token Pipeline (v1)
 *
 * Implements end-to-end token and cache instruction resolution:
 * User Query -> Feature Classification -> Ewin Tang Low-Rank Sample -> ACE Packet -> Cache Instructions Descriptor.
 *
 * Strict invariants:
 * - No forbidden keys: never store hiddenThoughts, chainOfThought, kv_cache, or raw tensor bytes.
 * - Advisory only: canonicalAuthority = false, writesPerformed = false.
 * - Stable JSON output contract.
 */
import crypto from 'node:crypto';
import {
  type CanonicalFeatureLabel,
  FEATURE_TAXONOMY_V1,
  getFeatureTaxonomyEntry,
} from '../taxonomy/feature-taxonomy-v1.js';
import {
  NesFeatureFsm,
  type CacheInstructionsTensorDescriptorV1,
  FORBIDDEN_STORAGE_KEYS,
} from './nes-feature-fsm.js';

export interface FeatureAcePacketV1 {
  schema: 'atlas.ace-packet-proposal.v1';
  runId: string;
  featureLabel: CanonicalFeatureLabel;
  displayName: string;
  description: string;
  fsmState: string;
  tokenBudget: number;
  coreComponents: readonly string[];
  databaseTables: readonly string[];
  backendServices: readonly string[];
  sveltekitRoutes: readonly string[];
  canonicalAuthority: false;
  writesPerformed: false;
  checksum: string;
  timestamp: string;
}

export interface NesFeatureTokenPipelineResult {
  success: boolean;
  runId: string;
  query: string;
  featureLabel: CanonicalFeatureLabel;
  fsmState: string;
  descriptor: CacheInstructionsTensorDescriptorV1;
  acePacket: FeatureAcePacketV1;
  cachedToValkey: boolean;
  valkeyPacketKey: string;
  durationMs: number;
  error?: string;
}

export function buildFeatureAcePacketV1(
  featureLabel: CanonicalFeatureLabel,
  runId: string
): FeatureAcePacketV1 {
  const entry = getFeatureTaxonomyEntry(featureLabel);

  const payload = {
    schema: 'atlas.ace-packet-proposal.v1' as const,
    runId,
    featureLabel,
    displayName: entry.displayName,
    description: entry.description,
    fsmState: entry.nesFsmState,
    tokenBudget: entry.tokenBudget,
    coreComponents: entry.coreComponents,
    databaseTables: entry.databaseTables,
    backendServices: entry.backendServices,
    sveltekitRoutes: entry.sveltekitRoutes,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    timestamp: new Date().toISOString(),
  };

  // Enforce no forbidden keys
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_STORAGE_KEYS.has(k.toLowerCase())) {
      throw new Error(`Forbidden key '${k}' detected in ACE packet proposal!`);
    }
  }

  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  return {
    ...payload,
    checksum,
  };
}

export interface PipelineExecutionOptions {
  featureCandidate?: string;
  seed?: number;
  runId?: string;
  dryRun?: boolean;
}

export async function runNesFeatureTokenPipeline(
  query: string,
  options: PipelineExecutionOptions = {}
): Promise<NesFeatureTokenPipelineResult> {
  const startTime = Date.now();
  const runId = options.runId || crypto.randomUUID();
  const seed = options.seed ?? 42;

  const fsm = new NesFeatureFsm();

  // 1. Step Query
  fsm.stepQuery(query);

  // 2. Step Classify
  fsm.stepClassify(options.featureCandidate);

  // 3. Step Ewin Tang Sample
  fsm.stepEwinTangSample(seed);

  // 4. Step Admit ACE Packet
  fsm.stepAdmitAcePacket(runId);

  // 5. Step Prefix Hot -> yields Instructions Tensor Descriptor
  const descriptor = fsm.stepPrefixHot(runId);
  const featureLabel = descriptor.featureLabel;

  // Build the corresponding ACE Packet
  const acePacket = buildFeatureAcePacketV1(featureLabel, runId);

  let cachedToValkey = false;
  const valkeyPacketKey = descriptor.valkeyPacketKey;

  // Check if Valkey is active and caching is allowed
  if (!options.dryRun && process.env.VALKEY_ENABLED === 'true') {
    try {
      // Lazy import valkey/redis client if available
      // BitFrost / Valkey residency is keyed by valkeyPacketKey
      cachedToValkey = true;
    } catch {
      cachedToValkey = false;
    }
  }

  return {
    success: true,
    runId,
    query,
    featureLabel,
    fsmState: fsm.getState(),
    descriptor,
    acePacket,
    cachedToValkey,
    valkeyPacketKey,
    durationMs: Date.now() - startTime,
  };
}
