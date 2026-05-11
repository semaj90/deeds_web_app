/**
 * Phase A2 — Section builders for AgentsDirectoryCard regen.
 *
 * 8 pure functions, no I/O. Each takes a directory path + the shared
 * RegenContext (loaded once per run by buildRegenContext) and returns its
 * slice of the AgentsDirectoryCard shape.
 *
 * Composer `composeCard` chains them, computes the content hash, validates
 * via Zod, and reports whether the result differs from `existingCard`.
 *
 * Reference: docs/design/2026-05-11_agents-directory-card-regen.md §2.
 */

import { cardIdForDir, agentsDirectoryCardSchema, computeCardContentHash } from '../agents-card-store.js';
import type { AgentsDirectoryCard } from '../agents-card-store.js';
import type { RegenContext } from './loaders/types.js';

// ── 1. Identity ──────────────────────────────────────────────────────────────

export interface IdentitySlice {
	id:      string;
	dirPath: string;
	title:   string;
}

export function buildIdentitySection(dirPath: string): IdentitySlice {
	const normalised = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
	return {
		id:      cardIdForDir(normalised),
		dirPath: normalised,
		title:   humanize(normalised),
	};
}

function humanize(dirPath: string): string {
	const last = dirPath.split('/').filter(Boolean).pop() ?? '';
	if (!last) return '';
	// 'context-assembler' → 'Context Assembler'; 'ace' → 'ACE' (3-char-or-less = uppercase).
	if (last.length <= 3) return last.toUpperCase();
	return last
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── 2. Summary ───────────────────────────────────────────────────────────────

export interface SummarySlice {
	summary: string;
}

export function buildSummarySection(dirPath: string, ctx: RegenContext): SummarySlice {
	// Priority 1: cluster summary if the dir resolves to a known cluster cell.
	const dirEntry = ctx.graph.directories.get(dirPath);
	const clusterKey = readClusterKey(dirEntry);
	if (clusterKey) {
		const clusterSummary = ctx.clusters.summaries.get(clusterKey);
		if (clusterSummary) return { summary: clusterSummary.slice(0, 2000) };
	}

	// Priority 2: feature descriptions for features whose files live under dirPath.
	const features = ctx.features.byDir.get(dirPath);
	if (features && features.length > 0) {
		const descs = features
			.map((f) => f.description?.trim())
			.filter((s): s is string => Boolean(s));
		if (descs.length > 0) return { summary: descs.join(' • ').slice(0, 2000) };
	}

	// Priority 3: derive a one-liner from the graph dir entry.
	if (dirEntry) {
		const fc = dirEntry.fileCount;
		const summaryField = typeof dirEntry.summary === 'string' ? dirEntry.summary : '';
		if (summaryField) return { summary: summaryField.slice(0, 2000) };
		return { summary: `${fc} file${fc === 1 ? '' : 's'} under ${dirPath}` };
	}

	return { summary: '' };
}

function readClusterKey(entry: unknown): string | null {
	if (!entry || typeof entry !== 'object') return null;
	const e = entry as Record<string, unknown>;
	if (typeof e.clusterKey === 'string') return e.clusterKey;
	if (typeof e.somCluster === 'string') return e.somCluster;
	if (typeof e.somCluster === 'number') return String(e.somCluster);
	if (typeof e.cluster === 'string') return e.cluster;
	return null;
}

// ── 3. Imports ───────────────────────────────────────────────────────────────

export interface ImportsSlice {
	staticImports:  string[];
	dynamicImports: string[];
	pathAliases:    string[];
}

const STATIC_TOP_N = 20;
const DYNAMIC_TOP_N = 10;

export function buildImportsSection(dirPath: string, ctx: RegenContext): ImportsSlice {
	const filesInDir = filesUnderDir(dirPath, ctx);

	const staticCounts  = new Map<string, number>();
	const dynamicCounts = new Map<string, number>();
	for (const file of filesInDir) {
		for (const imp of file.imports)     bump(staticCounts,  imp);
		for (const imp of file.dynImports)  bump(dynamicCounts, imp);
	}

	return {
		staticImports:  topByCount(staticCounts,  STATIC_TOP_N),
		dynamicImports: topByCount(dynamicCounts, DYNAMIC_TOP_N),
		pathAliases:    matchAliases(dirPath, ctx.pathAliases.aliases),
	};
}

function filesUnderDir(dirPath: string, ctx: RegenContext) {
	const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
	const out: Array<RegenContext['graph']['files'] extends Map<string, infer V> ? V : never> = [];
	for (const f of ctx.graph.files.values()) {
		if (f.rel === dirPath) continue; // dir name itself, defensive
		if (f.rel.startsWith(prefix)) out.push(f);
	}
	return out;
}

function bump(m: Map<string, number>, k: string) {
	if (!k) return;
	m.set(k, (m.get(k) ?? 0) + 1);
}

function topByCount(m: Map<string, number>, n: number): string[] {
	return [...m.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, n)
		.map(([k]) => k);
}

function matchAliases(dirPath: string, aliases: Map<string, string>): string[] {
	const out: string[] = [];
	for (const [alias, target] of aliases.entries()) {
		const normalisedTarget = target.replace(/\/\*$/, '').replace(/\/+$/, '');
		if (!normalisedTarget) continue;
		if (dirPath === normalisedTarget || dirPath.startsWith(`${normalisedTarget}/`)) {
			out.push(alias);
		}
	}
	return out.sort();
}

// ── 4. Features + routes + schema ────────────────────────────────────────────

export interface FeatureSlice {
	featureKeys:   string[];
	routeSurfaces: string[];
	schemaTables:  string[];
}

const ROUTE_FILE_SUFFIXES = ['+server.ts', '+page.svelte', '+page.server.ts', '+layout.svelte', '+layout.server.ts'];

export function buildFeatureSection(dirPath: string, ctx: RegenContext): FeatureSlice {
	const features = ctx.features.byDir.get(dirPath) ?? [];
	const featureKeys = features.map((f) => f.featureKey).sort();

	const filesInDir = filesUnderDir(dirPath, ctx);

	const routeSurfaces: string[] = [];
	const tables = new Set<string>();
	for (const f of filesInDir) {
		if (f.isRoute || ROUTE_FILE_SUFFIXES.some((s) => f.rel.endsWith(s))) {
			routeSurfaces.push(f.rel);
		}
		for (const t of f.drizzleRefs) tables.add(t);
	}
	return {
		featureKeys,
		routeSurfaces: routeSurfaces.sort(),
		schemaTables:  [...tables].sort(),
	};
}

// ── 5. Topology ──────────────────────────────────────────────────────────────

export interface TopologySlice {
	qdrantTags:  string[];
	neo4jNodeId: string;
	couchDocId:  string;
}

export function buildTopologySection(dirPath: string, ctx: RegenContext): TopologySlice {
	const tagSet = new Set<string>();

	// Graph dir entry may carry tagList from the indexer.
	const dirEntry = ctx.graph.directories.get(dirPath);
	if (dirEntry) {
		const tagList = (dirEntry as Record<string, unknown>).tagList;
		if (Array.isArray(tagList)) for (const t of tagList) if (typeof t === 'string') tagSet.add(t);
		const ck = readClusterKey(dirEntry);
		if (ck) tagSet.add(`cluster:${ck}`);
	}

	// Per-file tags as a fallback (graphify emits them on each file).
	for (const f of filesUnderDir(dirPath, ctx)) {
		for (const t of f.tags) if (typeof t === 'string' && t.length > 0) tagSet.add(t);
	}

	const id = cardIdForDir(dirPath);
	return {
		qdrantTags:  [...tagSet].sort(),
		neo4jNodeId: id,
		couchDocId:  id,
	};
}

// ── 6. Status + recommendations ──────────────────────────────────────────────

export interface StatusSlice {
	auditStatus:     'SHIPPED' | 'PARTIAL' | 'SPEC_ONLY' | 'SCHEMA_DEFERRED' | 'EXPERIMENTAL';
	recommendations: string[];
}

export function buildStatusSection(
	dirPath: string,
	ctx: RegenContext,
	partial: Pick<FeatureSlice, 'routeSurfaces' | 'schemaTables' | 'featureKeys'>,
): StatusSlice {
	const features = ctx.features.byDir.get(dirPath) ?? [];
	const shippedFeature = features.find((f) => f.status?.toUpperCase() === 'SHIPPED' || f.status?.toUpperCase() === 'ACTIVE');

	let auditStatus: StatusSlice['auditStatus'];
	if (shippedFeature && (partial.routeSurfaces.length > 0 || partial.schemaTables.length > 0)) {
		auditStatus = 'SHIPPED';
	} else if (partial.routeSurfaces.length >= 1 && partial.schemaTables.length >= 1) {
		auditStatus = 'SHIPPED';
	} else if (partial.schemaTables.length >= 1 && partial.routeSurfaces.length === 0) {
		auditStatus = 'SPEC_ONLY';
	} else if (partial.featureKeys.length >= 1) {
		auditStatus = 'PARTIAL';
	} else if (/\b(experimental|phase\d+|prototype)\b/i.test(dirPath)) {
		auditStatus = 'EXPERIMENTAL';
	} else {
		auditStatus = 'SPEC_ONLY';
	}

	return {
		auditStatus,
		// Neo4j-driven recommendations land in Phase A4 (writer pipeline). For
		// now we expose sibling dirs that share feature_keys as a deterministic
		// proxy — same input → same output for the contentHash invariant.
		recommendations: siblingDirsByFeatureOverlap(dirPath, ctx, 3),
	};
}

function siblingDirsByFeatureOverlap(dirPath: string, ctx: RegenContext, limit: number): string[] {
	const myFeatures = (ctx.features.byDir.get(dirPath) ?? []).map((f) => f.featureKey);
	if (myFeatures.length === 0) return [];
	const myKeys = new Set(myFeatures);
	const scores = new Map<string, number>();
	for (const [otherDir, fs] of ctx.features.byDir.entries()) {
		if (otherDir === dirPath) continue;
		let overlap = 0;
		for (const f of fs) if (myKeys.has(f.featureKey)) overlap++;
		if (overlap > 0) scores.set(otherDir, overlap);
	}
	return [...scores.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([d]) => d);
}

// ── 7. Activity ──────────────────────────────────────────────────────────────

export interface ActivitySlice {
	activityScore:  number;
	lastAccessedAt: string | undefined;
}

export function buildActivitySection(dirPath: string, ctx: RegenContext): ActivitySlice {
	const entry = ctx.activity.byDir.get(dirPath);
	return {
		activityScore:  entry?.score ?? 0,
		lastAccessedAt: entry?.lastAccessedAt,
	};
}

// ── 8. Gates ─────────────────────────────────────────────────────────────────

export interface GatesSlice {
	gates: Record<string, boolean>;
}

export function buildGatesSection(
	dirPath: string,
	ctx: RegenContext,
	partial: { schemaTables: string[]; qdrantTags: string[]; routeSurfaces: string[] },
): GatesSlice {
	const tables = new Set(partial.schemaTables);
	const tags   = new Set(partial.qdrantTags);
	void dirPath;
	void ctx;

	return {
		gates: {
			'G-AI-01': tables.has('evidence_vectors') || tags.size > 0,           // RAG signal present
			'G-AI-02': tables.has('code_llm_index'),                              // LLM cache lane wired
			'G-AI-03': partial.routeSurfaces.length > 0,                          // route surface present
			'G-AI-04': tables.size > 0,                                            // any schema dependency
			'G-AI-15': false,                                                      // populated by writer once card exists
		},
	};
}

// ── Composer ─────────────────────────────────────────────────────────────────

export interface ComposeResult {
	card:        AgentsDirectoryCard;
	contentHash: string;
	changed:     boolean;
}

export function composeCard(
	dirPath: string,
	ctx: RegenContext,
	existingCard: AgentsDirectoryCard | null = null,
): ComposeResult {
	const identity = buildIdentitySection(dirPath);
	const summary  = buildSummarySection(identity.dirPath, ctx);
	const imports  = buildImportsSection(identity.dirPath, ctx);
	const features = buildFeatureSection(identity.dirPath, ctx);
	const topology = buildTopologySection(identity.dirPath, ctx);
	const status   = buildStatusSection(identity.dirPath, ctx, features);
	const activity = buildActivitySection(identity.dirPath, ctx);
	const gates    = buildGatesSection(identity.dirPath, ctx, {
		schemaTables:  features.schemaTables,
		qdrantTags:    topology.qdrantTags,
		routeSurfaces: features.routeSurfaces,
	});

	const draft: Omit<AgentsDirectoryCard, 'contentHash'> = {
		...identity,
		...summary,
		...imports,
		...features,
		...topology,
		auditStatus:     status.auditStatus,
		recommendations: status.recommendations,
		...activity,
		lastIndexedAt:   ctx.runStartedAt,
		...gates,
	};

	const contentHash = computeCardContentHash(draft);
	const validated   = agentsDirectoryCardSchema.parse({ ...draft, contentHash });

	const changed = existingCard?.contentHash !== contentHash;
	return { card: validated, contentHash, changed };
}
