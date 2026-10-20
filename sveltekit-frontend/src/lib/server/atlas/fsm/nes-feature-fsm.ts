/**
 * NES Feature Finite State Machine (NES-FSM-V1)
 *
 * Implements the lifecycle:
 * IDLE -> QUERY_RECEIVED -> FEATURE_CLASSIFIED -> EWIN_TANG_SAMPLED -> ACE_PACKET_ADMITTED -> PREFIX_HOT
 *
 * Adheres strictly to AGENTS.md:
 * - No forbidden keys: never persist hiddenThoughts, chainOfThought, kv_cache, or tensor bytes.
 * - Advisory only: canonicalAuthority = false.
 * - Quantum-inspired Ewin Tang classical low-rank L2-norm squared sampling for fast sublinear component selection.
 */
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  type CanonicalFeatureLabel,
  FEATURE_TAXONOMY_V1,
  getFeatureTaxonomyEntry,
  resolveFeatureLabel,
  matchFeatureLabel,
} from '../taxonomy/feature-taxonomy-v1.js';

export const NES_FSM_STATES = [
  'IDLE',
  'QUERY_RECEIVED',
  'FEATURE_CLASSIFIED',
  'EWIN_TANG_SAMPLED',
  'ACE_PACKET_ADMITTED',
  'PREFIX_HOT',
  'FAILED',
] as const;

export type NesFsmState = (typeof NES_FSM_STATES)[number];

export const FORBIDDEN_STORAGE_KEYS = new Set([
  'hiddenthoughts',
  'chainofthought',
  'kv_cache',
  'kvcache',
  'tensor',
  'tensors',
  'reasoning_content',
]);

export interface EwinTangSampleResult {
  shortlistIndices: number[];
  shortlistComponents: string[];
  rowProbabilities: number[];
  normSquareTotal: number;
  sampledRank: number;
}

/**
 * Quantum-inspired classical Ewin Tang length-square (L2 norm squared) row sampler.
 * Given a component feature matrix (or feature weight vectors), samples indices proportional
 * to their squared Euclidean norm in O(poly(k, r)) time without full matrix inversion.
 */
export function sampleEwinTangLowRank(
  matrix: number[][],
  sampleCount: number = 3,
  seed: number = 42
): EwinTangSampleResult {
  if (!matrix || matrix.length === 0) {
    return {
      shortlistIndices: [],
      shortlistComponents: [],
      rowProbabilities: [],
      normSquareTotal: 0,
      sampledRank: 0,
    };
  }

  const rowNormsSq = matrix.map((row) =>
    row.reduce((acc, val) => acc + val * val, 0)
  );
  const totalNormSq = rowNormsSq.reduce((acc, val) => acc + val, 0);

  if (totalNormSq <= 0) {
    const indices = Array.from({ length: Math.min(sampleCount, matrix.length) }, (_, i) => i);
    return {
      shortlistIndices: indices,
      shortlistComponents: [],
      rowProbabilities: matrix.map(() => 1 / matrix.length),
      normSquareTotal: 0,
      sampledRank: indices.length,
    };
  }

  const probabilities = rowNormsSq.map((normSq) => normSq / totalNormSq);

  // Deterministic PRNG using seed
  let s = seed >>> 0;
  function nextRandom(): number {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  }

  const sampledIndices: number[] = [];
  const targetSamples = Math.min(sampleCount, matrix.length);
  const used = new Set<number>();

  for (let trial = 0; trial < targetSamples * 4 && sampledIndices.length < targetSamples; trial++) {
    const r = nextRandom();
    let cumulative = 0;
    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (r <= cumulative) {
        if (!used.has(i)) {
          used.add(i);
          sampledIndices.push(i);
        }
        break;
      }
    }
  }

  // Fallback if random choice missed some
  for (let i = 0; i < matrix.length && sampledIndices.length < targetSamples; i++) {
    if (!used.has(i)) {
      used.add(i);
      sampledIndices.push(i);
    }
  }

  return {
    shortlistIndices: sampledIndices,
    shortlistComponents: [],
    rowProbabilities: probabilities,
    normSquareTotal: totalNormSq,
    sampledRank: sampledIndices.length,
  };
}

export interface CacheInstructionsTensorDescriptorV1 {
  schema: 'atlas.token-cache-instructions.v1';
  runId: string;
  featureLabel: CanonicalFeatureLabel;
  fsmState: NesFsmState;
  tokenBudget: number;
  allocatedTokens: number;
  promptPrefix: string;
  admittedComponents: readonly string[];
  admittedDatabaseTables: readonly string[];
  backendServices: readonly string[];
  residencySlot: string;
  valkeyPacketKey: string;
  checksum: string;
  canonicalAuthority: false;
  timestamp: string;
}

export interface NesFsmContext {
  state: NesFsmState;
  query: string;
  rawFeatureCandidate?: string;
  featureLabel?: CanonicalFeatureLabel;
  tokenBudget: number;
  samplingResult?: EwinTangSampleResult;
  admittedComponents: string[];
  descriptor?: CacheInstructionsTensorDescriptorV1;
  error?: string;
}

export class NesFeatureFsm {
  private context: NesFsmContext;

  constructor() {
    this.context = {
      state: 'IDLE',
      query: '',
      tokenBudget: 0,
      admittedComponents: [],
    };
  }

  public getState(): NesFsmState {
    return this.context.state;
  }

  public getContext(): Readonly<NesFsmContext> {
    return this.context;
  }

  public stepQuery(rawQuery: string): NesFsmState {
    const trimmed = rawQuery?.trim() ?? '';
    if (!trimmed) {
      this.context.state = 'FAILED';
      this.context.error = 'Empty query provided';
      return this.context.state;
    }
    this.context.query = trimmed;
    this.context.state = 'QUERY_RECEIVED';
    return this.context.state;
  }

  public stepClassify(featureCandidate?: string): NesFsmState {
    if (this.context.state !== 'QUERY_RECEIVED') {
      this.context.state = 'FAILED';
      this.context.error = `Invalid state transition from ${this.context.state} to FEATURE_CLASSIFIED`;
      return this.context.state;
    }

    let resolved: CanonicalFeatureLabel | null = null;
    if (featureCandidate) {
      resolved = resolveFeatureLabel(featureCandidate) ?? matchFeatureLabel(featureCandidate);
    }
    if (!resolved) {
      resolved = matchFeatureLabel(this.context.query);
    }
    if (!resolved) {
      // Default safely to chat if unclassified
      resolved = 'chat';
    }

    const taxonomyEntry = getFeatureTaxonomyEntry(resolved);
    this.context.featureLabel = resolved;
    this.context.tokenBudget = taxonomyEntry.tokenBudget;
    this.context.state = 'FEATURE_CLASSIFIED';
    return this.context.state;
  }

  public stepEwinTangSample(seed: number = 42): NesFsmState {
    if (this.context.state !== 'FEATURE_CLASSIFIED' || !this.context.featureLabel) {
      this.context.state = 'FAILED';
      this.context.error = `Invalid state transition from ${this.context.state} to EWIN_TANG_SAMPLED`;
      return this.context.state;
    }

    const entry = getFeatureTaxonomyEntry(this.context.featureLabel);
    const components = entry.coreComponents;

    // Build synthetic feature matrix based on component string length and route overlap
    const matrix: number[][] = components.map((comp) => {
      const len = comp.length;
      const isRoute = comp.includes('+page') ? 2.0 : 1.0;
      const depth = comp.split('/').length;
      return [len / 100, isRoute, depth / 10, entry.tokenBudget / 4096];
    });

    const sampling = sampleEwinTangLowRank(matrix, Math.min(2, components.length), seed);
    const shortlisted = sampling.shortlistIndices.map((idx) => components[idx] ?? components[0]);

    sampling.shortlistComponents = shortlisted;
    this.context.samplingResult = sampling;
    this.context.admittedComponents = shortlisted;
    this.context.state = 'EWIN_TANG_SAMPLED';
    return this.context.state;
  }

  public stepAdmitAcePacket(runId?: string): NesFsmState {
    if (this.context.state !== 'EWIN_TANG_SAMPLED' || !this.context.featureLabel) {
      this.context.state = 'FAILED';
      this.context.error = `Invalid state transition from ${this.context.state} to ACE_PACKET_ADMITTED`;
      return this.context.state;
    }

    this.context.state = 'ACE_PACKET_ADMITTED';
    return this.context.state;
  }

  public stepPrefixHot(runId?: string): CacheInstructionsTensorDescriptorV1 {
    if (this.context.state !== 'ACE_PACKET_ADMITTED' || !this.context.featureLabel) {
      throw new Error(`Cannot transition to PREFIX_HOT from state ${this.context.state}`);
    }

    const entry = getFeatureTaxonomyEntry(this.context.featureLabel);
    const resolvedRunId = runId || crypto.randomUUID();
    const packetKey = `ace:packet:${this.context.featureLabel}:${resolvedRunId}`;

    // Prompt prefix template providing grounding for the feature
    const promptPrefix = [
      `[FEATURE_CONTEXT: ${entry.displayName.toUpperCase()}]`,
      `Feature: ${entry.featureLabel} (${entry.description})`,
      `Verified Components: ${this.context.admittedComponents.join(', ')}`,
      `Verified Tables: ${entry.databaseTables.join(', ')}`,
      `FSM State: ${entry.nesFsmState}`,
    ].join('\n');

    // Allocated tokens adjusted by low rank sampling ratio
    const allocatedTokens = Math.min(
      this.context.tokenBudget,
      Math.max(512, Math.round(this.context.tokenBudget * 0.75))
    );

    const descriptorPayload = {
      schema: 'atlas.token-cache-instructions.v1' as const,
      runId: resolvedRunId,
      featureLabel: this.context.featureLabel,
      fsmState: 'PREFIX_HOT' as const,
      tokenBudget: entry.tokenBudget,
      allocatedTokens,
      promptPrefix,
      admittedComponents: this.context.admittedComponents,
      admittedDatabaseTables: entry.databaseTables,
      backendServices: entry.backendServices,
      residencySlot: `valkey:slot:${this.context.featureLabel}`,
      valkeyPacketKey: packetKey,
      canonicalAuthority: false as const,
      timestamp: new Date().toISOString(),
    };

    // Verify no forbidden keys exist in descriptor payload
    for (const key of Object.keys(descriptorPayload)) {
      if (FORBIDDEN_STORAGE_KEYS.has(key.toLowerCase())) {
        throw new Error(`Forbidden key '${key}' detected in token cache instructions descriptor!`);
      }
    }

    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(descriptorPayload))
      .digest('hex');

    const finalDescriptor: CacheInstructionsTensorDescriptorV1 = {
      ...descriptorPayload,
      checksum,
    };

    this.context.descriptor = finalDescriptor;
    this.context.state = 'PREFIX_HOT';
    return finalDescriptor;
  }
}
