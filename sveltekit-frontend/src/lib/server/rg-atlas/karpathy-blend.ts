/**
 * Stage 3 — GPU Karpathy Blend
 * Per-hit HGET from Redis + attentionScoreGPU fallback.
 */

import { redis } from '$lib/server/redis.js';
import { getAddonInternal, acquireFloat32, releaseFloat32 } from '$lib/server/gpu/libtorch-bridge.js';
import { getBatchedEmbeddings } from './embed.js';

const KARPATHY_SCORES_KEY = 'gpu:karpathy:scores';

/**
 * Retrieves Karpathy blend scores for a set of hits.
 * @param query Query text for attention fallback
 * @param filePaths Paths to check in the Karpathy cache
 */
export async function getKarpathyBlendScores(
    query: string,
    filePaths: string[]
): Promise<number[]> {
    const scores: number[] = new Array(filePaths.length).fill(0);
    const misses: { path: string; index: number }[] = [];

    // 1. Bulk HGET from Redis
    try {
        const cachedScores = await redis.hmget(KARPATHY_SCORES_KEY, ...filePaths);
        for (let i = 0; i < filePaths.length; i++) {
            const s = cachedScores[i];
            if (s !== null && s !== undefined) {
                try {
                    const parsed = JSON.parse(s);
                    scores[i] = parsed.blend ?? 0;
                } catch {
                    // Fallback to direct parse if not JSON
                    scores[i] = parseFloat(s) || 0;
                }
            } else {
                misses.push({ path: filePaths[i], index: i });
            }
        }
    } catch (err) {
        console.warn('[karpathy-blend] Redis HMGET failed:', err);
        filePaths.forEach((path, i) => misses.push({ path, index: i }));
    }

    if (misses.length === 0) return scores;

    // 2. Fallback — attentionScoreGPU for misses
    // Note: This requires embeddings for the query and the missing files.
    // In a full implementation, we'd fetch codebase embeddings for these files.
    // For this design, we'll try to embed them on the fly (expensive but correct for fallback).
    try {
        const addon = getAddonInternal();
        if (addon?.attentionScoreGPU) {
            const queryEmb = await getBatchedEmbeddings([query]);
            if (!queryEmb[0]) return scores;

            const fileEmbeds = await getBatchedEmbeddings(misses.map(m => m.path)); // Simplified: should be content-based
            const validEmbeds = fileEmbeds.filter(e => e && e.length > 0);
            
            if (validEmbeds.length > 0) {
                const qArr = new Float32Array(queryEmb[0]);
                const cFlat = acquireFloat32(validEmbeds.length * 768);
                validEmbeds.forEach((emb, i) => cFlat.set(emb, i * 768));

                const result = addon.attentionScoreGPU(qArr, 768, cFlat, validEmbeds.length);
                
                let validIdx = 0;
                for (let i = 0; i < misses.length; i++) {
                    if (fileEmbeds[i]) {
                        scores[misses[i].index] = result[validIdx++];
                    }
                }
                releaseFloat32(cFlat);
            }
        }
    } catch (err) {
        console.warn('[karpathy-blend] GPU fallback failed:', err);
    }

    return scores;
}
