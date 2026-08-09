/**
 * Optional graph-analysis sidecar.
 *
 * This is the GPU-parity / batch-analytics boundary. It is intentionally
 * fail-closed and returns null on any connection or protocol failure.
 */

import type { GraphAlgorithm } from './graph-analysis-types.js';

export interface GraphAnalysisSidecarResult {
  runId: string;
  algorithm: GraphAlgorithm;
  sidecarRevision?: string | null;
  metrics?: Record<string, unknown>;
  notes?: string[] | null;
}

export interface GraphAnalysisSidecarClient {
  baseUrl: string;
  health(): Promise<boolean>;
  run(
    algorithm: GraphAlgorithm,
    input: Record<string, unknown>,
  ): Promise<GraphAnalysisSidecarResult | null>;
}

function resolveBaseUrl(): string {
  return process.env.GRAPH_ANALYSIS_SIDECAR_URL
    ?? process.env.GPU_ANALYSIS_SIDECAR_URL
    ?? 'http://127.0.0.1:8092';
}

async function readErrorBody(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export function createGraphAnalysisSidecarClient(baseUrl = resolveBaseUrl()): GraphAnalysisSidecarClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return {
    baseUrl: normalizedBaseUrl,

    async health() {
      try {
        const response = await fetch(`${normalizedBaseUrl}/health`, { signal: AbortSignal.timeout(2000) });
        return response.ok;
      } catch {
        return false;
      }
    },

    async run(algorithm, input) {
      try {
        const response = await fetch(`${normalizedBaseUrl}/graph/${algorithm}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          const body = await readErrorBody(response);
          console.warn(
            `[graph-analysis-sidecar] ${algorithm} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
          );
          return null;
        }

        return (await response.json()) as GraphAnalysisSidecarResult;
      } catch {
        return null;
      }
    },
  };
}
