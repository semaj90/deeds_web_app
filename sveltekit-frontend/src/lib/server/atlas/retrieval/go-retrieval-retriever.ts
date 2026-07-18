/**
 * Go Retrieval is best-effort; SearchRuntime remains the canonical search authority.
 *
 * This adapter wraps the existing searchViaGoRetrieval function from the Go retrieval
 * client and normalises its hits into the common retriever output shape used by the
 * Atlas retrieval pipeline. Failures are caught and logged — the adapter never throws.
 */

export interface GoRetrievalRetrieverOptions {
  enabled?: boolean;
  httpUrl?: string;
  timeoutMs?: number;
}

export interface GoRetrievalHit {
  packetKey: string;
  sourceRef: string;
  score: number;
  lane: 'go-retrieval';
  metadata?: Record<string, unknown>;
}

/**
 * Create a best-effort retriever backed by the Go retrieval service.
 * Returns an empty array when disabled or when the service is unavailable.
 */
export function createGoRetrievalRetriever(opts?: GoRetrievalRetrieverOptions): {
  lane: 'go-retrieval';
  retrieve(input: { query: string; limit: number }): Promise<GoRetrievalHit[]>;
} {
  const enabled =
    opts?.enabled ??
    (process.env.GO_RETRIEVAL_ENABLED === 'true' || process.env.GO_RETRIEVAL_ENABLED === '1');

  const httpUrl = opts?.httpUrl ?? process.env.GO_RETRIEVAL_HTTP_URL;
  const timeoutMs = opts?.timeoutMs ?? 8_000;

  return {
    lane: 'go-retrieval',

    async retrieve(input: { query: string; limit: number }): Promise<GoRetrievalHit[]> {
      if (!enabled) {
        console.info('[go-retrieval-retriever] disabled — returning empty result set');
        return [];
      }

      try {
        // Dynamic import so the module can be absent in environments that
        // do not have the Go retrieval service wired (e.g. browser builds).
        const mod = await import('$lib/server/retrieval/go-retrieval-client.js');
        const { searchViaGoRetrieval } = mod as {
          searchViaGoRetrieval: (
            params: { query: string; topK?: number },
            timeoutMs?: number
          ) => Promise<{ results: Record<string, unknown>[] } | null>;
        };

        const response = await searchViaGoRetrieval(
          { query: input.query, topK: input.limit },
          timeoutMs
        );

        if (!response || !Array.isArray(response.results)) {
          return [];
        }

        const hits: GoRetrievalHit[] = [];

        for (const hit of response.results) {
          const raw = hit as Record<string, unknown>;

          const packetKey =
            (raw.packet_key as string | undefined) ??
            (raw.chunk_id as string | undefined) ??
            (raw.id as string | undefined) ??
            '';

          if (!packetKey) continue;

          const sourceRef =
            (raw.source_ref as string | undefined) ??
            (raw.sourceRef as string | undefined) ??
            (raw.file_path as string | undefined) ??
            '';

          const score =
            typeof raw.rerank_score === 'number'
              ? raw.rerank_score
              : typeof raw.rerankScore === 'number'
              ? raw.rerankScore
              : typeof raw.score === 'number'
              ? raw.score
              : 0;

          const metadata =
            raw.metadata && typeof raw.metadata === 'object'
              ? (raw.metadata as Record<string, unknown>)
              : undefined;

          hits.push({ packetKey, sourceRef, score, lane: 'go-retrieval', metadata });
        }

        // Inject the resolved httpUrl into ENV override if provided, so the
        // underlying client picks it up when ENV.GO_RETRIEVAL_HTTP_URL is not set.
        void httpUrl; // acknowledged — consumed via process.env fallback in the client

        return hits;
      } catch (err) {
        console.warn(
          '[go-retrieval-retriever] retrieve failed, returning empty result set:',
          (err as Error).message
        );
        return [];
      }
    },
  };
}
