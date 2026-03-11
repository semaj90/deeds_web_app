/**
 * Centralized timeout constants for the application.
 * Reference module — use these for new code, no bulk refactor of existing values.
 */
export const TIMEOUTS = {
	/** Health/readiness probes */
	PROBE: 5_000,
	/** User-facing API calls */
	USER_FACING: 15_000,
	/** Background jobs (embedding, indexing) */
	BACKGROUND: 120_000,
	/** LLM inference (Ollama, TRT-LLM) */
	LLM_INFERENCE: 300_000,
	/** Single embedding call */
	EMBEDDING: 30_000,
	/** gRPC calls */
	GRPC: 10_000,
	/** Redis operations */
	REDIS: 5_000,
	/** Qdrant vector operations */
	QDRANT: 10_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;
