/**
 * Standardized request timeout constants.
 * User-facing = fast fail; background = longer patience; LLM = inference needs time.
 */
export const TIMEOUTS = {
	/** Health checks, quick probes */
	PROBE: 5_000,
	/** User-facing API requests (default for most endpoints) */
	USER_FACING: 15_000,
	/** Embedding generation (single text) */
	EMBEDDING: 30_000,
	/** Background job processing (embedding batch, document indexing) */
	BACKGROUND: 120_000,
	/** LLM inference (Ollama chat/generate) */
	LLM_INFERENCE: 300_000,
} as const;
