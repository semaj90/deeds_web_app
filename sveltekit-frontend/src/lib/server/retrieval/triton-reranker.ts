import { ENV } from '$lib/server/env.server.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

/**
 * Triton Reranker Client
 *
 * Optimized for cross-encoder rerankers (Mixedbread / BGE-style) running on Triton/TRT-LLM
 * or a Triton-compatible sidecar.
 * Supports batch inference to minimize RTT latency.
 */

const getEndpoint = () => ENV.TRITON_URL;
const getModel = (modelOverride?: string) =>
  modelOverride?.trim() ||
  ENV.CROSS_ENCODER_MODEL ||
  ENV.TRITON_RERANKER_MODEL ||
  'mixedbread-ai/mxbai-rerank-base-v2';
const withBasePath = (path: string) => `${getEndpoint().replace(/\/$/, '')}${path}`;

export interface TritonRerankResult {
    score: number;
    error?: string;
}

interface RerankSidecarRow {
    packet_key: unknown;
    score: unknown;
}

interface RerankSidecarResponse {
    model_id?: unknown;
    ranked?: unknown;
}

/**
 * Validate and restore a sidecar response to the request order.
 * Missing or ambiguous rows must fail closed; filling them with zero would
 * silently change the ranking contract.
 */
export function parseRerankSidecarScores(
    value: unknown,
    expectedModelId: string,
    candidateCount: number,
): number[] | null {
    if (!value || typeof value !== 'object') return null;
    const response = value as RerankSidecarResponse;
    if (response.model_id !== expectedModelId || !Array.isArray(response.ranked)) return null;
    if (response.ranked.length !== candidateCount) return null;

    const scores = new Array<number>(candidateCount);
    const seen = new Set<number>();
    for (const rawRow of response.ranked) {
        if (!rawRow || typeof rawRow !== 'object') return null;
        const row = rawRow as RerankSidecarRow;
        if (typeof row.packet_key !== 'string' || !/^\d+$/.test(row.packet_key)) return null;
        const index = Number(row.packet_key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= candidateCount || seen.has(index)) return null;
        if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 1) return null;
        seen.add(index);
        scores[index] = row.score;
    }

    return seen.size === candidateCount && scores.every((score) => Number.isFinite(score)) ? scores : null;
}

/**
 * Score a batch of query-document pairs via Triton or a Triton-compatible sidecar.
 *
 * Input format is backend-specific but always batch-oriented:
 * - texts: [ [query, doc1], [query, doc2], ... ]
 * 
 * Returns scores in the same order as candidates.
 */
export async function scoreBatchCrossEncoder(
    query: string,
    candidates: string[],
    modelOverride?: string
): Promise<number[]> {
    if (candidates.length === 0) return [];

    // Try sidecar first if configured
    if (ENV.RERANKER_SIDECAR_URL) {
        try {
            const res = await fetch(`${ENV.RERANKER_SIDECAR_URL}/rerank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    candidates: candidates.map((text, i) => ({ packet_key: String(i), text })),
                    batch_size: 32,
                    model: getModel(modelOverride),
                }),
                signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) {
                const data = await res.json();
                const scores = parseRerankSidecarScores(data, getModel(modelOverride), candidates.length);
                if (scores) return scores;
            }
        } catch {
            // fall through to Triton
        }
    }

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

        const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(getModel(modelOverride))}/infer`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn(`[triton-reranker] Error ${response.status}: ${errText.slice(0, 200)}`);
            return [];
        }

        const data = await response.json();
        const scoresOutput = data.outputs?.find((o: any) => o.name === 'SCORE');
        
        if (scoresOutput && Array.isArray(scoresOutput.data) && scoresOutput.data.length === candidates.length) {
            if (!scoresOutput.data.every((score: unknown) => typeof score === 'number' && Number.isFinite(score))) {
                return [];
            }
            return scoresOutput.data.map((s: number) => Math.max(0, Math.min(1, s)));
        }

        return [];
    } catch (err) {
        const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code ?? (err as { code?: string }).code;
        if (code === 'ECONNREFUSED') {
            console.warn('[triton-reranker] Triton unavailable (ECONNREFUSED), falling back to cross-encoder legacy scorer.');
        } else {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[triton-reranker] Batch inference failed, falling back to cross-encoder legacy scorer: ${message}`);
        }
        return [];
    }
}

/**
 * Readiness check for the reranker model.
 */
export async function isRerankerReady(modelOverride?: string): Promise<boolean> {
  try {
    const response = await fetch(withBasePath(`/v2/models/${encodeURIComponent(getModel(modelOverride))}/ready`), {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
