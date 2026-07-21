/**
 * Shared types for the AGENTS regen pipeline loaders.
 *
 * Phase A1.1 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 * Anchors every loader interface so they stay in lockstep with the spec.
 *
 * Pure type module — no runtime imports, no side effects. Safe to import
 * from anywhere (server, scripts, tests).
 */

import type { AgentsDirectoryCard } from '../../agents-card-store.js';

// ── Codebase graph ───────────────────────────────────────────────────────────

/**
 * Per-file shape from `docs/graph/codebase-graph.json`.
 * Only the fields loadGraph re-indexes — extra fields in the raw JSON are
 * dropped to avoid leaking unstable schema across the regen pipeline.
 */
export interface CodebaseGraphFile {
	rel:           string;
	ext:           string;
	tags:          readonly string[];
	summary:       string;
	imports:       readonly string[];
	exports:       readonly string[];
	dynImports:    readonly string[];
	reExports:     readonly string[];
	routeHandlers: readonly string[];
	drizzleRefs:   readonly string[];
	isRoute:       boolean;
	isSvelteComp:  boolean;
	isTest:        boolean;
	lineCount:     number;
}

/**
 * Per-directory shape from `docs/graph/codebase-graph.json`.
 * The graphify pipeline is still emitting variable fields, so accept
 * an open shape and let section builders index defensively.
 */
export interface CodebaseGraphDir {
	rel:       string;
	fileCount: number;
	[k: string]: unknown;
}

export interface CodebaseGraph {
	createdAt:   string;
	repoRoot:    string;
	files:       Map<string, CodebaseGraphFile>;
	directories: Map<string, CodebaseGraphDir>;
	fileCount:   number;
	dirCount:    number;
}

export interface LoadGraphResult {
	graph:        CodebaseGraph;
	loadedAt:     string;
	staleMs:      number;
	staleWarning: boolean;
	source:       string;
}

// ── Karpathy blend scores ────────────────────────────────────────────────────

export interface KarpathyBlend {
	pr:        number;
	attn:      number;
	authority: number;
	blend:     number;
}

export interface LoadKarpathyResult {
	scores:     Map<string, KarpathyBlend>;
	loadedAt:   string;
	entryCount: number;
	source:     string;
}

// ── SOM cluster summaries ────────────────────────────────────────────────────

export interface LoadClusterSummariesResult {
	summaries:  Map<string, string>;
	loadedAt:   string;
	entryCount: number;
	source:     string;
}

// ── Feature implementations + file edges ─────────────────────────────────────

export interface FeatureRow {
	featureKey:  string;
	featureName: string;
	description: string;
	laneIds:     readonly string[];
	status:      string;
	confidence:  number;
	files:       readonly string[];
	packetKey?:  string | null;
	sourceRef?:   string | null;
	contentHash?: string | null;
	domainClass?: string | null;
	keywords?:    readonly string[];
	identifiers?: readonly string[];
	treeNodeId?:  string | null;
	pageRank?:    number | null;
	somCluster?:  number | null;
	kmeansCluster?: number | null;
	usedConcepts?: readonly string[];
	normalizedSource?: string;
}

export interface LoadFeaturesResult {
	features: FeatureRow[];
	byDir:    Map<string, FeatureRow[]>;
	loadedAt: string;
	source:   string;
	fallbackUsed?: boolean;
}

// ── Activity rollup (context_timeline) ───────────────────────────────────────

export interface ActivityEntry {
	dirPath:        string;
	score:          number;
	lastAccessedAt: string;
	eventCount:     number;
}

export interface LoadActivityResult {
	byDir:       Map<string, ActivityEntry>;
	loadedAt:    string;
	rowsScanned: number;
	source:      string;
}

export interface LoadActivityOptions {
	lookbackHours?: number;
	weights?:       Readonly<Record<string, number>>;
	halfLifeHours?: number;
}

/** Canonical weights from the CLAUDE.md RL signal taxonomy. */
export const DEFAULT_ACTIVITY_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
	'file.access':           0.1,
	'file.dwell_short':      0.3,
	'file.dwell_long':       1.0,
	'citation_saved':        0.5,
	'recommendation_click':  0.2,
});

// ── tsconfig path aliases ────────────────────────────────────────────────────

export interface LoadPathAliasesResult {
	aliases:  Map<string, string>;
	loadedAt: string;
	source:   string;
}

// ── Existing card lookup ─────────────────────────────────────────────────────

export interface LoadExistingCardResult {
	card:     AgentsDirectoryCard | null;
	source:   'redis' | 'couchdb' | 'none';
	loadedAt: string;
}

// ── Diagnostics shape returned by buildRegenContext ──────────────────────────

export interface LoaderResultDiagnostic {
	ok:          boolean;
	durationMs:  number;
	entryCount?: number;
	reason?:     string;
}

export interface RegenContextDiagnostics {
	loaderResults: {
		graph:            LoaderResultDiagnostic;
		karpathyScores:   LoaderResultDiagnostic;
		clusterSummaries: LoaderResultDiagnostic;
		features:         LoaderResultDiagnostic & { featureCount?: number };
		activity:         LoaderResultDiagnostic & { rowsScanned?:  number };
		pathAliases:      LoaderResultDiagnostic & { aliasCount?:   number };
	};
	totalDurationMs: number;
	warnings: Array<{ loader: string; message: string }>;
}

// ── Composed regen context ───────────────────────────────────────────────────

export interface RegenContext {
	runStartedAt: string;
	graph:        CodebaseGraph;
	karpathy:     LoadKarpathyResult;
	clusters:     LoadClusterSummariesResult;
	features:     LoadFeaturesResult;
	activity:     LoadActivityResult;
	pathAliases:  LoadPathAliasesResult;
	diagnostics:  RegenContextDiagnostics;
}

export interface BuildRegenContextOptions {
	skipActivity?:         boolean;
	skipClusterSummaries?: boolean;
	fixtures?: {
		features?: LoadFeaturesResult;
		activity?: LoadActivityResult;
	};
}
