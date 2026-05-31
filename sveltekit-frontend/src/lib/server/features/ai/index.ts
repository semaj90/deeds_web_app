/**
 * aiAgents feature barrel
 *
 * Phase 1 (non-destructive): re-exports from existing scattered source locations.
 * Downstream code can import from this barrel instead of the scattered paths.
 *
 * Purpose: AI agents + LLM orchestration: Gemma4, ACE, KAG/DAG, tool calling
 * Confidence: high
 * Generated: 2026-05-30T18:09:34.025Z
 *
 * Scattered sources:
 *   - sveltekit-frontend/src/lib/server/ace
 *   - sveltekit-frontend/src/lib/server/admin
 *   - sveltekit-frontend/src/lib/server/agents
 *   - sveltekit-frontend/src/lib/server/ai
 *   - sveltekit-frontend/src/lib/server/ai/hermes
 *   - sveltekit-frontend/src/lib/server/ai/hermes/tools
 *   - sveltekit-frontend/src/lib/server/cache
 *   - sveltekit-frontend/src/lib/server/db
 */
// From sveltekit-frontend/src/lib/server/ace/context-assembler.ts
export * from '../../ace/context-assembler.js';

// From sveltekit-frontend/src/lib/server/ace/error-fingerprint.ts
export * from '../../ace/error-fingerprint.js';

// From sveltekit-frontend/src/lib/server/ace/error-kag-writer.ts
export * from '../../ace/error-kag-writer.js';

// From sveltekit-frontend/src/lib/server/ace/intent-synthesis-reward.ts
export * from '../../ace/intent-synthesis-reward.js';

// From sveltekit-frontend/src/lib/server/ace/intent-synthesis.ts
export * from '../../ace/intent-synthesis.js';

// From sveltekit-frontend/src/lib/server/ace/kag-dag-runner.ts
export * from '../../ace/kag-dag-runner.js';

// From sveltekit-frontend/src/lib/server/ace/relationship-fetcher.ts
export * from '../../ace/relationship-fetcher.js';

// From sveltekit-frontend/src/lib/server/admin/ai-chat-context.ts
export * from '../../admin/ai-chat-context.js';

// From sveltekit-frontend/src/lib/server/admin/ai-chat-service.ts
export * from '../../admin/ai-chat-service.js';

// From sveltekit-frontend/src/lib/server/agents/trace-subagent-orchestrator.ts
export * from '../../agents/trace-subagent-orchestrator.js';

// From sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts
export * from '../../ai/gemma4-agent.js';

// From sveltekit-frontend/src/lib/server/ai/hermes/deep-research-dag.ts
export * from '../../ai/hermes/deep-research-dag.js';

// From sveltekit-frontend/src/lib/server/ai/hermes/dispatcher.ts
export * from '../../ai/hermes/dispatcher.js';

// From sveltekit-frontend/src/lib/server/ai/hermes/tools/db-schema-tools.ts
export * from '../../ai/hermes/tools/db-schema-tools.js';

// From sveltekit-frontend/src/lib/server/ai/hypergraph-store.ts
export * from '../../ai/hypergraph-store.js';

// From sveltekit-frontend/src/lib/server/ai/information-gain-validator.ts
export * from '../../ai/information-gain-validator.js';

// From sveltekit-frontend/src/lib/server/ai/intent-ranker.ts
export * from '../../ai/intent-ranker.js';

// From sveltekit-frontend/src/lib/server/ai/kv-context-controller.ts
export * from '../../ai/kv-context-controller.js';

// From sveltekit-frontend/src/lib/server/ai/model-security.ts
export * from '../../ai/model-security.js';

// From sveltekit-frontend/src/lib/server/ai/opencode-skill.ts
export * from '../../ai/opencode-skill.js';

// From sveltekit-frontend/src/lib/server/ai/raptor-summarizer.ts
export * from '../../ai/raptor-summarizer.js';

// From sveltekit-frontend/src/lib/server/ai/token-tracker.ts
export * from '../../ai/token-tracker.js';

// From sveltekit-frontend/src/lib/server/cache/ace-context-cache-metrics.ts
export * from '../../cache/ace-context-cache-metrics.js';

// From sveltekit-frontend/src/lib/server/db/workspace-operations.ts
export * from '../../db/workspace-operations.js';
