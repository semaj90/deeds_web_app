/**
 * NES Feature Token Pipeline (v1)
 *
 * Builds an advisory token/cache descriptor proposal from a user query.
 * Qualified feature rows are required before any low-rank selection can run.
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
  FeatureClassificationUnavailableError,
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
  runId?: string;
  dryRun?: boolean;
}

export async function runNesFeatureTokenPipeline(
  query: string,
  options: PipelineExecutionOptions = {}
): Promise<NesFeatureTokenPipelineResult> {
  const startTime = Date.now();
  const runId = options.runId || crypto.randomUUID();

  const fsm = new NesFeatureFsm();

  // 1. Step Query
  fsm.stepQuery(query);

  // 2. Step Classify
  const classificationState = fsm.stepClassify(options.featureCandidate);
  if (classificationState === 'FAILED') {
    throw new FeatureClassificationUnavailableError();
  }

  // 3. No qualified feature matrix is supplied by this proposal-only path.
  fsm.stepLowRankUnavailable();

  // 4. Propose an ACE packet; this is not evidence admission.
  fsm.stepProposeAcePacket();

  // 5. Build an advisory descriptor; no cache read/write occurs here.
  const descriptor = fsm.buildCacheDescriptor(runId);
  const featureLabel = descriptor.featureLabel;

  // Build the corresponding ACE Packet
  const acePacket = buildFeatureAcePacketV1(featureLabel, runId);

  const cachedToValkey = false;
  const valkeyPacketKey = descriptor.valkeyPacketKey;

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
