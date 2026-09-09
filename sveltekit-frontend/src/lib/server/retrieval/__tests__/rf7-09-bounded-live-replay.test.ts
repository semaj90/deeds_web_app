// @vitest-environment node
/**
 * RF7-09 — bounded LIVE replay (real Qdrant-sourced packetKey identities, not synthetic
 * fixtures), the prerequisite RF7-05/06/07 (production delegation to FusionCoreV1) is explicitly
 * gated behind. Requires a live Qdrant at QDRANT_URL (default 127.0.0.1:6333); skips gracefully
 * if unreachable rather than failing CI on an infra dependency.
 *
 * Scope: proves FusionCoreV1's fuseContributionsV1() numerically reproduces
 * rrf-fuse.ts::reciprocalRankFusion()'s real fusionScore on REAL production identity data for
 * the unweighted, no-tie case -- the scenario RF7-04's synthetic fixtures already predicted
 * would agree. Does NOT claim agreement for the two confirmed divergent scenarios (per-lane
 * weighting, tie-break) -- those remain real, documented differences a migration must design for
 * at the call site, not something this replay can or should paper over.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { reciprocalRankFusion } from '../rrf-fuse.js';
import { projectRrfLanesToContributions } from '../fusion-contribution-adapters.js';
import { fuseContributionsV1 } from '../fusion-core-v1.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

interface RealPoint { id: number | string; packetKey: string; path?: string }

let realPoints: RealPoint[] = [];
let qdrantReachable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 40, with_payload: ['packet_key', 'path'], with_vector: false }),
    });
    if (!res.ok) { qdrantReachable = false; return; }
    const data = await res.json() as { result: { points: Array<{ id: number | string; payload?: { packet_key?: string; path?: string } }> } };
    realPoints = (data.result?.points ?? [])
      .filter((p) => p.payload?.packet_key)
      .map((p) => ({ id: p.id, packetKey: p.payload!.packet_key!, path: p.payload?.path }));
  } catch {
    qdrantReachable = false;
  }
});

describe('RF7-09 bounded live replay (real Qdrant identities)', () => {
  it('reciprocalRankFusion vs FusionCoreV1 agree on fusionScore for real single-lane candidates (unweighted, no ties)', () => {
    if (!qdrantReachable || realPoints.length < 10) {
      console.warn('RF7-09: Qdrant unreachable or insufficient real data -- skipping (infra dependency, not a code failure)');
      return;
    }
    // Dedup by packetKey (real Qdrant chunks repeat packetKey across multiple points for the
    // same file) -- rrf-fuse.ts fuses by packetKey identity, so distinct-identity input is the
    // real-world shape this replay needs.
    const distinctByPacketKey = new Map<string, RealPoint>();
    for (const p of realPoints) if (!distinctByPacketKey.has(p.packetKey)) distinctByPacketKey.set(p.packetKey, p);
    const distinct = [...distinctByPacketKey.values()].slice(0, 10);
    expect(distinct.length).toBeGreaterThanOrEqual(5); // real data must actually have enough distinct identities to be meaningful

    const hits = distinct.map((p, index) => ({ packetKey: p.packetKey, rank: index + 1 }));
    const lanes = [{ lane: 'dense_768', hits }];

    const real = reciprocalRankFusion(lanes, {}, 60, 50);
    const contributions = projectRrfLanesToContributions(lanes);
    const fused = fuseContributionsV1(contributions);

    expect(fused.length).toBe(real.length);
    const realByPacket = new Map(real.map((hit) => [hit.packetKey, hit.fusionScore]));
    let compared = 0;
    for (const candidate of fused) {
      const expected = realByPacket.get(candidate.canonicalId);
      expect(expected).toBeDefined();
      expect(candidate.fusionScore).toBeCloseTo(expected!, 12);
      compared++;
    }
    expect(compared).toBe(distinct.length); // every real candidate was actually compared, not silently skipped
  });

  it('reciprocalRankFusion vs FusionCoreV1 agree on cross-lane summed fusionScore for a real shared candidate', () => {
    if (!qdrantReachable || realPoints.length < 10) {
      console.warn('RF7-09: Qdrant unreachable or insufficient real data -- skipping');
      return;
    }
    const distinctByPacketKey = new Map<string, RealPoint>();
    for (const p of realPoints) if (!distinctByPacketKey.has(p.packetKey)) distinctByPacketKey.set(p.packetKey, p);
    const distinct = [...distinctByPacketKey.values()];
    if (distinct.length < 2) { console.warn('RF7-09: insufficient distinct real packetKeys -- skipping'); return; }

    const shared = distinct[0].packetKey;
    const other = distinct[1].packetKey;
    const lanes = [
      { lane: 'bm42', hits: [{ packetKey: shared, rank: 1 }, { packetKey: other, rank: 3 }] },
      { lane: 'dense_768', hits: [{ packetKey: shared, rank: 2 }] },
    ];

    const real = reciprocalRankFusion(lanes, {}, 60, 50);
    const contributions = projectRrfLanesToContributions(lanes);
    const fused = fuseContributionsV1(contributions);

    const realShared = real.find((hit) => hit.packetKey === shared);
    const fusedShared = fused.find((candidate) => candidate.canonicalId === shared);
    expect(realShared).toBeDefined();
    expect(fusedShared).toBeDefined();
    expect(fusedShared!.fusionScore).toBeCloseTo(realShared!.fusionScore, 12);
    expect(fusedShared!.laneVotes).toHaveLength(2); // real cross-lane vote for this real candidate
  });
});
