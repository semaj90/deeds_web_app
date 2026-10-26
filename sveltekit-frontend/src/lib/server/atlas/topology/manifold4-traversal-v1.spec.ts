import { describe, expect, it } from 'vitest';
import {
  computeManifold4Distance,
  traverseManifold4MultiHop,
  type Manifold4Node,
  type Manifold4Adjacency,
} from './manifold4-traversal-v1.js';

describe('Manifold4 Multi-Hop Traversal (v1)', () => {
  it('computes 4D Euclidean distance accurately with coordinate weighting', () => {
    const a = [0, 0, 0, 0] as const;
    const b = [3, 4, 0, 0] as const;
    const dist2D = computeManifold4Distance(a, b);
    expect(dist2D).toBeCloseTo(5.0, 5);

    const c = [1, 2, 2, 4] as const;
    const d = [1, 2, 0, 0] as const;
    // dz = 2, dw = 4, sqrt(4 + 16) = sqrt(20) ~ 4.4721
    const dist4D = computeManifold4Distance(c, d);
    expect(dist4D).toBeCloseTo(Math.sqrt(20), 4);

    const weightedDist = computeManifold4Distance(c, d, { w: 0.5 });
    // dz = 2*1=2, dw = 4*0.5=2, sqrt(4 + 4) = sqrt(8) ~ 2.8284
    expect(weightedDist).toBeCloseTo(Math.sqrt(8), 4);
  });

  it('performs bounded multi-hop expansion and filters low-grade nodes', () => {
    const nodes: Record<string, Manifold4Node> = {
      seed1: {
        id: 'seed1',
        ordinal: 0,
        sourceRef: 'src/routes/chat/+page.svelte',
        coords: [5, 5, 0.1, 0.9],
        gradeScore: 0.9,
        featureLabel: 'chat',
      },
      hop1_a: {
        id: 'hop1_a',
        ordinal: 1,
        sourceRef: 'src/lib/chat/ChatWindow.svelte',
        coords: [5.2, 5.1, 0.15, 0.85],
        gradeScore: 0.85,
        featureLabel: 'chat',
      },
      hop1_low_grade: {
        id: 'hop1_low_grade',
        ordinal: 2,
        sourceRef: 'src/lib/legacy/old-chat.js',
        coords: [6, 6, 0.4, 0.2],
        gradeScore: 0.2, // Below 0.35 threshold
        featureLabel: 'chat',
      },
      hop2_a: {
        id: 'hop2_a',
        ordinal: 3,
        sourceRef: 'src/lib/server/ai/local-llama-provider.ts',
        coords: [5.5, 5.3, 0.2, 0.8],
        gradeScore: 0.8,
        featureLabel: 'ai_chat',
      },
      hop3_distant: {
        id: 'hop3_distant',
        ordinal: 4,
        sourceRef: 'src/lib/server/db/schema.ts',
        coords: [10, 10, 0.9, 0.7],
        gradeScore: 0.7,
        featureLabel: 'user_db',
      },
    };

    const adjacency: Manifold4Adjacency = {
      seed1: ['hop1_a', 'hop1_low_grade'],
      hop1_a: ['hop2_a'],
      hop2_a: ['hop3_distant'],
    };

    // Max 2 hops: should reach seed1 (hop 0), hop1_a (hop 1), and hop2_a (hop 2).
    // hop1_low_grade should be filtered out (gradeScore 0.2 < 0.35).
    // hop3_distant should not be reached (hop 3 > maxHops 2).
    const result = traverseManifold4MultiHop(['seed1'], nodes, adjacency, {
      maxHops: 2,
      minGradeScore: 0.35,
    });

    expect(result.schema).toBe('atlas.manifold4-multihop-traversal.v1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
    expect(result.seeds).toEqual(['seed1']);
    expect(result.totalDiscovered).toBe(3);

    const discoveredIds = result.candidates.map((c) => c.id);
    expect(discoveredIds).toContain('seed1');
    expect(discoveredIds).toContain('hop1_a');
    expect(discoveredIds).toContain('hop2_a');
    expect(discoveredIds).not.toContain('hop1_low_grade');
    expect(discoveredIds).not.toContain('hop3_distant');

    // Verify deterministic traversal digest
    expect(result.traversalDigest).toMatch(/^[a-f0-9]{64}$/);

    // Verify candidate ranking: seed1 and hop1_a have high gradeScore and small manifoldDistance
    expect(result.candidates[0].combinedRankScore).toBeGreaterThanOrEqual(
      result.candidates[1].combinedRankScore
    );
  });

  it('handles empty seeds and respects maxCandidates limit', () => {
    const emptyResult = traverseManifold4MultiHop([], {}, {});
    expect(emptyResult.totalDiscovered).toBe(0);
    expect(emptyResult.candidates).toEqual([]);

    // Test maxCandidates capping
    const nodes: Record<string, Manifold4Node> = {
      s: { id: 's', ordinal: 0, sourceRef: 's', coords: [0, 0, 0, 1], gradeScore: 1 },
      n1: { id: 'n1', ordinal: 1, sourceRef: 'n1', coords: [0, 0, 0, 1], gradeScore: 1 },
      n2: { id: 'n2', ordinal: 2, sourceRef: 'n2', coords: [0, 0, 0, 1], gradeScore: 1 },
      n3: { id: 'n3', ordinal: 3, sourceRef: 'n3', coords: [0, 0, 0, 1], gradeScore: 1 },
    };
    const adj: Manifold4Adjacency = { s: ['n1', 'n2', 'n3'] };

    const cappedResult = traverseManifold4MultiHop(['s'], nodes, adj, {
      maxHops: 1,
      maxCandidates: 2,
    });

    expect(cappedResult.candidates.length).toBeLessThanOrEqual(2);
  });
});
