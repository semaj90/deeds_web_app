// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getRedis } from '../src/lib/server/redis.js';
import { getTopoCandidates, setTopoCandidates } from '../src/lib/server/cache/topo-candidate-cache.js';
import { TOPO_CLASS } from '../src/lib/server/cache/topo-candidate-cache.js';
import { buildCartridge, parseCartridge, type RuneData } from '../src/lib/server/cartridge/chr97-builder.js';

describe('Stage A0 Revision Caching & Ephemeral Cartridge Validation', () => {
  const topoClass = TOPO_CLASS.EXPERT;
  const query = 'analyze standard legal contract formats';
  const dummyCandidates = [
    { stableKey: 'card:codebase:src/lib/server/db/client.ts', score: 0.95, path: 'src/lib/server/db/client.ts' },
    { stableKey: 'card:codebase:src/lib/server/ai/ace.ts', score: 0.88, path: 'src/lib/server/ai/ace.ts' },
  ];

  it('correctly uses karpathyRev in key builders to enable clean cache invalidation', async () => {
    const redis = getRedis();

    // 1. Save with revision "rev_alpha"
    await setTopoCandidates(topoClass, query, dummyCandidates, 'rev_alpha');

    // 2. Fetch with revision "rev_alpha" (should hit)
    const hitAlpha = await getTopoCandidates(topoClass, query, 'rev_alpha');
    expect(hitAlpha).not.toBeNull();
    expect(hitAlpha).toHaveLength(2);
    expect(hitAlpha![0].stableKey).toBe(dummyCandidates[0].stableKey);

    // 3. Fetch with revision "rev_beta" (should miss / return null)
    const missBeta = await getTopoCandidates(topoClass, query, 'rev_beta');
    expect(missBeta).toBeNull();

    // 4. Save with "rev_beta"
    await setTopoCandidates(topoClass, query, [dummyCandidates[1]], 'rev_beta');

    // 5. Fetch again with "rev_beta" (should hit with the new subset)
    const hitBeta = await getTopoCandidates(topoClass, query, 'rev_beta');
    expect(hitBeta).toHaveLength(1);
    expect(hitBeta![0].stableKey).toBe(dummyCandidates[1].stableKey);
  });

  it('packs a cartridge cleanly and executes CPU cosine similarity using dequantized FP16 tensors', () => {
    // Construct 2 dummy codebase notecards
    const runes: RuneData[] = [
      {
        id: 0,
        clusterId: 5,
        // Mock a 768-dimension vector with positive unit magnitude in the first few slots
        embedding: new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : i === 1 ? 0.5 : 0)),
        text: 'DB client initializer',
        sourceName: 'src/lib/server/db/client.ts',
      },
      {
        id: 1,
        clusterId: 12,
        // Mock another vector orthogonal to the query vector
        embedding: new Array(768).fill(0).map((_, i) => (i === 10 ? 1 : 0)),
        text: 'Native N-API SIMD bridge',
        sourceName: 'simd-bridge/src/lib.rs',
      },
    ];

    // Build the CHR97 binary cartridge
    const metadata = {
      caseId: 'codebase_kb',
      createdAt: new Date().toISOString(),
      runeCount: runes.length,
      embeddingDim: 768,
      collections: ['codebase_chunks_768'],
      sources: runes.map((r) => r.sourceName).filter(Boolean) as string[],
    };

    const cartridgeBuffer = buildCartridge(runes, metadata);
    expect(cartridgeBuffer).toBeInstanceOf(ArrayBuffer);
    expect(cartridgeBuffer.byteLength).toBeGreaterThan(4096); // Header + RuneBlocks + Tensors

    // Parse/Dequantize back
    const parsed = parseCartridge(new Uint8Array(cartridgeBuffer));
    expect(parsed.tensors).toHaveLength(2);
    expect(parsed.tensors[0]).toHaveLength(768);

    // Mock query vector matching the first document closely
    const queryVec = new Float32Array(768);
    queryVec[0] = 1.0;
    queryVec[1] = 0.5;

    const results: Array<{ path: string; score: number }> = [];
    const dim = 768;

    for (let i = 0; i < parsed.tensors.length; i++) {
      const docTensor = parsed.tensors[i];
      let dot = 0, normQ = 0, normD = 0;
      for (let d = 0; d < dim; d++) {
        const q = queryVec[d];
        const v = docTensor[d];
        dot += q * v;
        normQ += q * q;
        normD += v * v;
      }
      const denom = Math.sqrt(normQ) * Math.sqrt(normD);
      const score = denom > 0 ? dot / denom : 0;
      results.push({
        path: runes[i].sourceName ?? '',
        score,
      });
    }

    // First document should have a very high cosine similarity (~1.0)
    expect(results[0].path).toBe('src/lib/server/db/client.ts');
    expect(results[0].score).toBeGreaterThan(0.99);

    // Second orthogonal document should have a zero score
    expect(results[1].path).toBe('simd-bridge/src/lib.rs');
    expect(results[1].score).toBeCloseTo(0, 5);
  });
});
