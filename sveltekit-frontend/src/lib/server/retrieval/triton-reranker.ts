import { ENV } from '$lib/server/env.server.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

/**
 * Triton Reranker Client
 * 
 * Optimized for Cross-Encoder models (e.g. BGE Reranker) running on Triton/TRT-LLM.
 * Supports batch inference to minimize RTT latency.
 */

const getEndpoint = () => ENV.TRITON_URL;
const getModel = () => ENV.TRITON_RERANKER_MODEL || 'bge-reranker';
const withBasePath = (path: string) => `${getEndpoint().replace(/\/$/, '')}${path}`;

export interface TritonRerankResult {
    score: number;
    error?: string;
}

/**
 * Score a batch of query-document pairs via Triton.
 * 
 * Triton Input Format (example for BGE):
 * - texts: [ [query, doc1], [query, doc2], ... ]
 * 
 * Returns scores in the same order as candidates.
 */
export async function scoreBatchTriton(
    query: string,
    candidates: string[]
): Promise<number[]> {
    if (candidates.length === 0) return [];
    
    try {
        const payload = {
            inputs: [
                {
                    name: 'TEXT',
                    shape: [candidates.length, 2],
                    datatype: 'BYTES',
                    data: candidates.flatMap(content => [query, content])
                }
            ],
            outputs: [{ name: 'SCORE' }]
        };

        const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(getModel())}/infer`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn(`[triton-reranker] Error ${response.status}: ${errText.slice(0, 200)}`);
            return candidates.map(() => 0.5); // neutral fallback
        }

        const data = await response.json();
        const scoresOutput = data.outputs?.find((o: any) => o.name === 'SCORE');
        
        if (scoresOutput && Array.isArray(scoresOutput.data)) {
            return scoresOutput.data.map((s: number) => Math.max(0, Math.min(1, s)));
        }

        return candidates.map(() => 0.5);
    } catch (err) {
        console.error('[triton-reranker] Batch inference failed:', err);
        return candidates.map(() => 0.5);
    }
}

/**
 * Readiness check for the reranker model.
 */
export async function isRerankerReady(): Promise<boolean> {
    try {
        const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(getModel())}/ready`), {
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    } catch {
        return false;
    }
}
