/**
 * Barrel for the AGENTS regen loader pipeline.
 *
 * Phase A1 (`docs/design/2026-05-11_agents-regen-loaders.md`) — read-only
 * data plane. Section builders (Phase A2) import from here.
 */

export { loadGraph } from './graph.js';
export type { LoadGraphOptions } from './graph.js';

export { loadKarpathyScores } from './karpathy.js';
export type { LoadKarpathyOptions } from './karpathy.js';

export { loadClusterSummaries } from './cluster-summaries.js';
export type { LoadClusterSummariesOptions } from './cluster-summaries.js';

export { loadFeatures } from './features.js';
export { loadActivity } from './activity.js';
export { loadPathAliases } from './path-aliases.js';
export type { LoadPathAliasesOptions } from './path-aliases.js';

export { loadExistingCard } from './existing-card.js';

export { buildRegenContext } from './build-context.js';

export type {
	CodebaseGraph,
	CodebaseGraphFile,
	CodebaseGraphDir,
	LoadGraphResult,
	KarpathyBlend,
	LoadKarpathyResult,
	LoadClusterSummariesResult,
	FeatureRow,
	LoadFeaturesResult,
	ActivityEntry,
	LoadActivityResult,
	LoadActivityOptions,
	LoadPathAliasesResult,
	LoadExistingCardResult,
	RegenContext,
	RegenContextDiagnostics,
	BuildRegenContextOptions,
	LoaderResultDiagnostic,
} from './types.js';

export { DEFAULT_ACTIVITY_WEIGHTS } from './types.js';
