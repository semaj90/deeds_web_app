import { describe, it, expect } from 'vitest';
import {
  NesFeatureFsm,
  sampleEwinTangLowRank,
  FORBIDDEN_STORAGE_KEYS,
} from './nes-feature-fsm.js';
import {
  runNesFeatureTokenPipeline,
  buildFeatureAcePacketV1,
} from './nes-feature-token-pipeline.js';
import { CANONICAL_FEATURE_LABELS } from '../taxonomy/feature-taxonomy-v1.js';

describe('NES Feature FSM & Low-Rank Ewin Tang Token Pipeline', () => {
  it('transitions through the full lifecycle to PREFIX_HOT', () => {
    const fsm = new NesFeatureFsm();
    expect(fsm.getState()).toBe('IDLE');

    fsm.stepQuery('Can you help me authenticate and check user credentials?');
    expect(fsm.getState()).toBe('QUERY_RECEIVED');

    fsm.stepClassify();
    expect(fsm.getState()).toBe('FEATURE_CLASSIFIED');
    expect(fsm.getContext().featureLabel).toBe('auth');

    fsm.stepEwinTangSample(42);
    expect(fsm.getState()).toBe('EWIN_TANG_SAMPLED');
    expect(fsm.getContext().admittedComponents.length).toBeGreaterThan(0);

    fsm.stepAdmitAcePacket('test-run-001');
    expect(fsm.getState()).toBe('ACE_PACKET_ADMITTED');

    const descriptor = fsm.stepPrefixHot('test-run-001');
    expect(fsm.getState()).toBe('PREFIX_HOT');
    expect(descriptor.schema).toBe('atlas.token-cache-instructions.v1');
    expect(descriptor.featureLabel).toBe('auth');
    expect(descriptor.allocatedTokens).toBeGreaterThan(0);
    expect(descriptor.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('performs deterministic quantum-inspired Ewin Tang low-rank L2 sampling', () => {
    const matrix = [
      [1.0, 2.0, 0.5],
      [0.2, 0.1, 0.0],
      [3.0, 4.0, 5.0], // High norm row
      [0.5, 0.5, 0.5],
    ];

    const res1 = sampleEwinTangLowRank(matrix, 2, 1337);
    const res2 = sampleEwinTangLowRank(matrix, 2, 1337);

    // Deterministic with same seed
    expect(res1.shortlistIndices).toEqual(res2.shortlistIndices);
    // Probabilities proportional to L2 norm squared
    expect(res1.rowProbabilities[2]).toBeGreaterThan(res1.rowProbabilities[1]);
    expect(res1.sampledRank).toBe(2);
  });

  it('correctly classifies all user-specified target features and aliases', async () => {
    const testCases: Array<{ query: string; expected: string }> = [
      { query: 'need to login and setup my session', expected: 'auth' },
      { query: 'send a message to the team in the channel', expected: 'chat' },
      { query: 'draw nodes on the evidence canvas whiteboard', expected: 'canvas' },
      { query: 'open the video editor and transcribe dialogue', expected: 'media_transcribe' },
      { query: 'launch the photo editor to inspect scene imagery', expected: 'image_creator' },
      { query: 'ask client assistant for case scoring', expected: 'ai_chat' },
      { query: 'generate visual comfyui reconstruction', expected: 'image_creator' },
      { query: 'open the webgpu visual playground and particle benchmark', expected: 'html5_visual_playground' },
      { query: 'discuss legal strategies on the community forum', expected: 'chat' },
      { query: 'search legal knowledge base in codebase wiki', expected: 'wiki' },
      { query: 'query the user database schema and roles', expected: 'user_db' },
    ];

    for (const tc of testCases) {
      const result = await runNesFeatureTokenPipeline(tc.query);
      expect(result.success).toBe(true);
      expect(result.featureLabel).toBe(tc.expected);
      expect(result.fsmState).toBe('PREFIX_HOT');
      expect(result.descriptor.tokenBudget).toBeGreaterThan(0);
    }
  });

  it('strictly rejects and excludes forbidden keys from persistence structures', () => {
    const acePacket = buildFeatureAcePacketV1('chat', 'test-run-audit');

    // Forbidden keys verification per AGENTS.md
    for (const forbidden of Array.from(FORBIDDEN_STORAGE_KEYS)) {
      expect((acePacket as Record<string, unknown>)[forbidden]).toBeUndefined();
    }

    expect(acePacket.canonicalAuthority).toBe(false);
    expect(acePacket.writesPerformed).toBe(false);
    expect(acePacket.checksum.length).toBe(64);
  });
});
