/**
 * Shared compact response budget defaults.
 *
 * Used by:
 *   - /api/research/concurrent-deep       (batch POST)
 *   - /api/research/concurrent-deep/stream (SSE stream)
 *   - /api/codebase-index/claude-assist    (unified orchestration)
 *
 * All three endpoints share the same ceiling values so compact mode
 * produces identically-shaped, token-controlled output regardless of
 * which entry point the operator uses.
 */

/** Budget fields shared across all compact research endpoints. */
export const COMPACT_DEFAULTS = {
	maxFindings:     8,
	maxFiles:        5,
	maxActionItems:  5,
	maxSummaryChars: 2_400,
} as const;

/** Extended budgets used by claude-assist orchestration. */
export const ASSIST_BUDGETS = {
	...COMPACT_DEFAULTS,
	maxSchemaIds:        64,
	maxResearchFindings: 8,
	maxRetrievalHits:    12,
	maxGraphNeighbors:   10,
	maxAceChunks:        6,
	maxErrorCards:        5,
} as const;

export type CompactBudgets = typeof COMPACT_DEFAULTS;
export type AssistBudgets  = typeof ASSIST_BUDGETS;
