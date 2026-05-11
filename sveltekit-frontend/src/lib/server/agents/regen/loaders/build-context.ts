/**
 * Composer — buildRegenContext().
 *
 * Phase A1.9 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * Runs loaders 1-6 in parallel via Promise.allSettled. Per-loader failure
 * → uses empty defaults + records a warning in diagnostics. Only loader 7
 * (existingCard) is excluded here because it's called per-directory inside
 * composeCard, not part of the shared regen run context.
 *
 * Total budget: dominated by loadGraph (file read of ~4 MB) and the
 * loadActivity 3s timeout. With healthy backends, expect < 500ms.
 */

import { loadGraph } from './graph.js';
import { loadKarpathyScores } from './karpathy.js';
import { loadClusterSummaries } from './cluster-summaries.js';
import { loadFeatures } from './features.js';
import { loadActivity } from './activity.js';
import { loadPathAliases } from './path-aliases.js';

import type {
	RegenContext,
	RegenContextDiagnostics,
	BuildRegenContextOptions,
	LoadGraphResult,
	LoadKarpathyResult,
	LoadClusterSummariesResult,
	LoadFeaturesResult,
	LoadActivityResult,
	LoadPathAliasesResult,
} from './types.js';

const EMPTY_GRAPH: LoadGraphResult = {
	graph: {
		createdAt:   new Date(0).toISOString(),
		repoRoot:    '',
		files:       new Map(),
		directories: new Map(),
		fileCount:   0,
		dirCount:    0,
	},
	loadedAt:     new Date(0).toISOString(),
	staleMs:      0,
	staleWarning: false,
	source:       'empty',
};

export async function buildRegenContext(
	opts: BuildRegenContextOptions = {},
): Promise<RegenContext> {
	const runStartedAt = new Date().toISOString();
	const overallStart = Date.now();
	const warnings: RegenContextDiagnostics['warnings'] = [];

	// Each loader is wrapped so a thrown rejection inside Promise.allSettled
	// still records a clear durationMs and reason in diagnostics.
	const tasks = [
		timed('graph',            () => loadGraph()),
		timed('karpathyScores',   () => loadKarpathyScores()),
		timed('clusterSummaries', () => opts.skipClusterSummaries
			? Promise.resolve<LoadClusterSummariesResult>({ summaries: new Map(), loadedAt: new Date().toISOString(), entryCount: 0, source: 'skipped' })
			: loadClusterSummaries()),
		timed('features',         () => opts.fixtures?.features ? Promise.resolve(opts.fixtures.features) : loadFeatures()),
		timed('activity',         () => {
			if (opts.fixtures?.activity) return Promise.resolve(opts.fixtures.activity);
			if (opts.skipActivity) {
				return Promise.resolve<LoadActivityResult>({ byDir: new Map(), loadedAt: new Date().toISOString(), rowsScanned: 0, source: 'skipped' });
			}
			return loadActivity();
		}),
		timed('pathAliases',      () => loadPathAliases()),
	] as const;

	const [
		graphRes,
		karpathyRes,
		clustersRes,
		featuresRes,
		activityRes,
		aliasesRes,
	] = await Promise.allSettled(tasks);

	const graph    = unwrap(graphRes,    EMPTY_GRAPH,    warnings, 'graph');
	const karpathy = unwrap(karpathyRes, emptyKarpathy(),warnings, 'karpathyScores');
	const clusters = unwrap(clustersRes, emptyClusters(),warnings, 'clusterSummaries');
	const features = unwrap(featuresRes, emptyFeatures(),warnings, 'features');
	const activity = unwrap(activityRes, emptyActivity(),warnings, 'activity');
	const aliases  = unwrap(aliasesRes,  emptyAliases(), warnings, 'pathAliases');

	if (graph.value.staleWarning) {
		warnings.push({ loader: 'graph', message: `codebase-graph.json is ${Math.round(graph.value.staleMs / 3.6e6)}h stale — run npm run graphify` });
	}

	const diagnostics: RegenContextDiagnostics = {
		loaderResults: {
			graph:            { ok: graph.ok,    durationMs: graph.durationMs,    reason: graph.reason },
			karpathyScores:   { ok: karpathy.ok, durationMs: karpathy.durationMs, entryCount: karpathy.value.entryCount, reason: karpathy.reason },
			clusterSummaries: { ok: clusters.ok, durationMs: clusters.durationMs, entryCount: clusters.value.entryCount, reason: clusters.reason },
			features:         { ok: features.ok, durationMs: features.durationMs, featureCount: features.value.features.length, reason: features.reason },
			activity:         { ok: activity.ok, durationMs: activity.durationMs, rowsScanned: activity.value.rowsScanned, reason: activity.reason },
			pathAliases:      { ok: aliases.ok,  durationMs: aliases.durationMs,  aliasCount: aliases.value.aliases.size, reason: aliases.reason },
		},
		totalDurationMs: Date.now() - overallStart,
		warnings,
	};

	return {
		runStartedAt,
		graph:       graph.value.graph,
		karpathy:    karpathy.value,
		clusters:    clusters.value,
		features:    features.value,
		activity:    activity.value,
		pathAliases: aliases.value,
		diagnostics,
	};
}

// ── Internals ────────────────────────────────────────────────────────────────

interface TimedResult<T> {
	value:      T;
	ok:         boolean;
	durationMs: number;
	reason?:    string;
}

function timed<T>(_label: string, fn: () => Promise<T>): Promise<TimedResult<T>> {
	const start = Date.now();
	return fn().then(
		(value) => ({ value, ok: true, durationMs: Date.now() - start }),
		(err)   => Promise.reject({ err: String((err as Error)?.message ?? err), durationMs: Date.now() - start }),
	);
}

function unwrap<T>(
	result: PromiseSettledResult<TimedResult<T>>,
	fallback: T,
	warnings: RegenContextDiagnostics['warnings'],
	loader: string,
): TimedResult<T> {
	if (result.status === 'fulfilled') return result.value;
	const rejected = result.reason as { err?: string; durationMs?: number };
	warnings.push({ loader, message: rejected?.err ?? 'loader rejected' });
	return { value: fallback, ok: false, durationMs: rejected?.durationMs ?? 0, reason: rejected?.err };
}

function emptyKarpathy(): LoadKarpathyResult {
	return { scores: new Map(), loadedAt: new Date().toISOString(), entryCount: 0, source: 'empty' };
}
function emptyClusters(): LoadClusterSummariesResult {
	return { summaries: new Map(), loadedAt: new Date().toISOString(), entryCount: 0, source: 'empty' };
}
function emptyFeatures(): LoadFeaturesResult {
	return { features: [], byDir: new Map(), loadedAt: new Date().toISOString(), source: 'empty' };
}
function emptyActivity(): LoadActivityResult {
	return { byDir: new Map(), loadedAt: new Date().toISOString(), rowsScanned: 0, source: 'empty' };
}
function emptyAliases(): LoadPathAliasesResult {
	return { aliases: new Map([['$lib', 'src/lib']]), loadedAt: new Date().toISOString(), source: 'empty' };
}
