/**
 * Loader 4 — Postgres `feature_implementations` + `feature_file_edges`.
 *
 * Phase A1.5 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * Joins features with their file edges in TypeScript (cheap; both tables
 * are small — features count is O(100)). Returns a flat array plus a
 * `byDir` Map keyed by dirname(filePath) so section builders can fetch
 * "features whose files live under this directory" in O(1).
 *
 * Postgres-unreachable → returns empty arrays + logs to source. Section
 * builders fall back to graph/Redis signals.
 */

import path from 'node:path';
import type {
	FeatureRow,
	LoadFeaturesResult,
} from './types.js';

const SOURCE_OK   = 'postgres:feature_implementations';
const SOURCE_DOWN = 'postgres:feature_implementations (unreachable)';

export async function loadFeatures(): Promise<LoadFeaturesResult> {
	const loadedAt = new Date().toISOString();

	try {
		const rows     = await fetchRows();
		const features = joinRows(rows);
		const byDir    = indexByDir(features);
		return { features, byDir, loadedAt, source: SOURCE_OK };
	} catch {
		// Any failure (fetch OR join) → graceful empty so section builders fall
		// back to graph/Redis signals instead of propagating to the regen run.
		return { features: [], byDir: new Map(), loadedAt, source: SOURCE_DOWN };
	}
}

// ── Internals ────────────────────────────────────────────────────────────────

interface FeatureRowsBundle {
	implementations: ReadonlyArray<{
		featureKey:  string;
		featureName: string;
		description: string | null;
		laneIds:     string[] | null;
		status:      string;
		confidence:  number;
	}>;
	edges: ReadonlyArray<{
		featureKey: string;
		filePath:   string;
	}>;
}

async function fetchRows(): Promise<FeatureRowsBundle> {
	const { db } = await import('$lib/server/db/client');
	const { featureImplementations, featureFileEdges } = await import('$lib/server/db/schema-postgres');

	const [implRaw, edgeRaw] = await Promise.all([
		db.select({
			featureKey:  featureImplementations.featureKey,
			featureName: featureImplementations.featureName,
			description: featureImplementations.description,
			laneIds:     featureImplementations.laneIds,
			status:      featureImplementations.status,
			confidence:  featureImplementations.confidence,
		}).from(featureImplementations),
		db.select({
			featureKey: featureFileEdges.featureKey,
			filePath:   featureFileEdges.filePath,
		}).from(featureFileEdges),
	]);

	return {
		implementations: implRaw as FeatureRowsBundle['implementations'],
		edges:           edgeRaw as FeatureRowsBundle['edges'],
	};
}

function joinRows(bundle: FeatureRowsBundle): FeatureRow[] {
	const filesByKey = new Map<string, string[]>();
	for (const e of bundle.edges) {
		if (typeof e.filePath !== 'string' || e.filePath.length === 0) continue;
		const arr = filesByKey.get(e.featureKey) ?? [];
		arr.push(e.filePath);
		filesByKey.set(e.featureKey, arr);
	}

	return bundle.implementations.map((row) => ({
		featureKey:  row.featureKey,
		featureName: row.featureName,
		description: row.description ?? '',
		laneIds:     Array.isArray(row.laneIds) ? [...row.laneIds] : [],
		status:      row.status,
		confidence:  typeof row.confidence === 'number' ? row.confidence : 0,
		files:       filesByKey.get(row.featureKey) ?? [],
	}));
}

function indexByDir(features: readonly FeatureRow[]): Map<string, FeatureRow[]> {
	const byDir = new Map<string, FeatureRow[]>();
	for (const f of features) {
		const seenDirs = new Set<string>();
		for (const filePath of f.files) {
			const dir = path.dirname(filePath).replace(/\\/g, '/');
			if (seenDirs.has(dir)) continue; // avoid double-listing the same feature under the same dir
			seenDirs.add(dir);
			const arr = byDir.get(dir) ?? [];
			arr.push(f);
			byDir.set(dir, arr);
		}
	}
	return byDir;
}
