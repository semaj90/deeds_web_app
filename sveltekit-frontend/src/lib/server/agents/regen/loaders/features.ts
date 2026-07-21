/**
 * Loader 4 — Postgres feature atlas.
 *
 * Transition plan:
 *   1. Prefer normalized feature fact tables joined by packet_key/source_ref.
 *   2. Fall back to the legacy feature_implementations + feature_file_edges
 *      tables if the fact layer is unavailable.
 *   3. Surface which path was used so regen diagnostics can see the gap.
 */

import path from 'node:path';
import type { FeatureRow, LoadFeaturesResult } from './types.js';

const SOURCE_NORMALIZED = 'postgres:feature_facts';
const SOURCE_LEGACY = 'postgres:feature_implementations (legacy fallback)';
const SOURCE_DOWN = 'postgres:feature_implementations (unreachable)';

type MaybeArray<T> = readonly T[] | T[] | null | undefined;

interface ImplementationRow {
	featureKey: string;
	featureName: string;
	description: string | null;
	laneIds: readonly string[] | null;
	status: string;
	confidence: number;
	packetKey: string | null;
	sourceRef: string | null;
	contentHash: string | null;
}

interface EdgeRow {
	featureKey: string;
	filePath: string;
	entryExport: string | null;
	role: string;
	packetKey: string | null;
	sourceRef: string | null;
	contentHash: string | null;
}

interface LexicalFactRow {
	packetKey: string;
	sourceRef: string;
featureKey: string | null;
	keywords: MaybeArray<string>;
	identifiers: MaybeArray<string>;
	symbols: MaybeArray<string>;
	importedModules: MaybeArray<string>;
	lexicalSummary: string | null;
	language: string | null;
	contentHash: string;
}

interface DomainFactRow {
	packetKey: string;
	sourceRef: string;
	featureKey: string | null;
	domainClass: string;
	contentHash: string;
}

interface StructuralFactRow {
	packetKey: string;
	sourceRef: string;
	featureKey: string | null;
	treeNodeId: string | null;
	symbolName: string | null;
	contentHash: string;
}

interface OntologyFactRow {
	packetKey: string;
	sourceRef: string;
	featureKey: string | null;
	subjectType: string;
	subjectId: string;
	predicate: string;
	objectType: string;
	objectId: string;
	objectValue: unknown | null;
}

interface FeatureRowsBundle {
	implementations: ImplementationRow[];
	edges: EdgeRow[];
	lexicalFacts: LexicalFactRow[];
	domainFacts: DomainFactRow[];
	structuralFacts: StructuralFactRow[];
	ontologyFacts: OntologyFactRow[];
}

interface LegacyFeatureRowsBundle {
	implementations: Array<Pick<ImplementationRow, 'featureKey' | 'featureName' | 'description' | 'laneIds' | 'status' | 'confidence'>>;
	edges: Array<Pick<EdgeRow, 'featureKey' | 'filePath'>>;
}

export async function loadFeatures(): Promise<LoadFeaturesResult> {
	const loadedAt = new Date().toISOString();

	try {
		const features = await loadAlignedFeatures();
		return {
			features,
			byDir: indexByDir(features),
			loadedAt,
			source: SOURCE_NORMALIZED,
			fallbackUsed: false,
		};
	} catch {
		try {
			const legacy = await loadLegacyFeatures();
			const features = joinLegacyRows(legacy);
			return {
				features,
				byDir: indexByDir(features),
				loadedAt,
				source: SOURCE_LEGACY,
				fallbackUsed: true,
			};
		} catch {
			return { features: [], byDir: new Map(), loadedAt, source: SOURCE_DOWN, fallbackUsed: true };
		}
	}
}

async function loadAlignedFeatures(): Promise<FeatureRow[]> {
	const { db } = await import('$lib/server/db/client');
	const {
		featureImplementations,
		featureFileEdges,
		featureLexicalFacts,
		featureDomainFacts,
		featureStructuralFacts,
		featureOntologyTuples,
	} = await import('$lib/server/db/schema-postgres');

	const [implRaw, edgeRaw, lexicalRaw, domainRaw, structuralRaw] = await Promise.all([
		db.select({
			featureKey: featureImplementations.featureKey,
			featureName: featureImplementations.featureName,
			description: featureImplementations.description,
			laneIds: featureImplementations.laneIds,
			status: featureImplementations.status,
			confidence: featureImplementations.confidence,
			packetKey: featureImplementations.packetKey,
			sourceRef: featureImplementations.sourceRef,
			contentHash: featureImplementations.contentHash,
		}).from(featureImplementations),
		db.select({
			featureKey: featureFileEdges.featureKey,
			filePath: featureFileEdges.filePath,
			entryExport: featureFileEdges.entryExport,
			role: featureFileEdges.role,
			packetKey: featureFileEdges.packetKey,
			sourceRef: featureFileEdges.sourceRef,
			contentHash: featureFileEdges.contentHash,
		}).from(featureFileEdges),
		db.select({
			packetKey: featureLexicalFacts.packetKey,
			sourceRef: featureLexicalFacts.sourceRef,
			featureKey: featureLexicalFacts.featureKey,
			keywords: featureLexicalFacts.keywords,
			identifiers: featureLexicalFacts.identifiers,
			symbols: featureLexicalFacts.symbols,
			importedModules: featureLexicalFacts.importedModules,
			lexicalSummary: featureLexicalFacts.lexicalSummary,
			language: featureLexicalFacts.language,
			contentHash: featureLexicalFacts.contentHash,
		}).from(featureLexicalFacts),
		db.select({
			packetKey: featureDomainFacts.packetKey,
			sourceRef: featureDomainFacts.sourceRef,
			featureKey: featureDomainFacts.featureKey,
			domainClass: featureDomainFacts.domainClass,
			contentHash: featureDomainFacts.contentHash,
		}).from(featureDomainFacts),
		db.select({
			packetKey: featureStructuralFacts.packetKey,
			sourceRef: featureStructuralFacts.sourceRef,
			featureKey: featureStructuralFacts.featureKey,
			treeNodeId: featureStructuralFacts.treeNodeId,
			symbolName: featureStructuralFacts.symbolName,
			contentHash: featureStructuralFacts.contentHash,
		}).from(featureStructuralFacts),
		db.select({
			packetKey: featureOntologyTuples.packetKey,
			sourceRef: featureOntologyTuples.sourceRef,
			featureKey: featureOntologyTuples.featureKey,
			subjectType: featureOntologyTuples.subjectType,
			subjectId: featureOntologyTuples.subjectId,
			predicate: featureOntologyTuples.predicate,
			objectType: featureOntologyTuples.objectType,
			objectId: featureOntologyTuples.objectId,
			objectValue: featureOntologyTuples.objectValue,
		}).from(featureOntologyTuples),
	]);

	return joinAlignedRows({
		implementations: implRaw as FeatureRowsBundle['implementations'],
		edges: edgeRaw as FeatureRowsBundle['edges'],
		lexicalFacts: lexicalRaw as FeatureRowsBundle['lexicalFacts'],
		domainFacts: domainRaw as FeatureRowsBundle['domainFacts'],
		structuralFacts: structuralRaw as FeatureRowsBundle['structuralFacts'],
		ontologyFacts: ontologyRaw as FeatureRowsBundle['ontologyFacts'],
	});
}

async function loadLegacyFeatures(): Promise<LegacyFeatureRowsBundle> {
	const { db } = await import('$lib/server/db/client');
	const { featureImplementations, featureFileEdges } = await import('$lib/server/db/schema-postgres');

	const [implRaw, edgeRaw] = await Promise.all([
		db.select({
			featureKey: featureImplementations.featureKey,
			featureName: featureImplementations.featureName,
			description: featureImplementations.description,
			laneIds: featureImplementations.laneIds,
			status: featureImplementations.status,
			confidence: featureImplementations.confidence,
		}).from(featureImplementations),
		db.select({
			featureKey: featureFileEdges.featureKey,
			filePath: featureFileEdges.filePath,
		}).from(featureFileEdges),
	]);

	return {
		implementations: implRaw as LegacyFeatureRowsBundle['implementations'],
		edges: edgeRaw as LegacyFeatureRowsBundle['edges'],
	};
}

export function joinAlignedRows(bundle: FeatureRowsBundle): FeatureRow[] {
	const filesByKey = new Map<string, string[]>();
	for (const edge of bundle.edges) {
		if (typeof edge.filePath !== 'string' || edge.filePath.length === 0) continue;
		const arr = filesByKey.get(edge.featureKey) ?? [];
		arr.push(edge.filePath);
		filesByKey.set(edge.featureKey, arr);
	}

	const lexicalByFeature = indexFacts(bundle.lexicalFacts, (row) => row.featureKey ?? row.packetKey);
	const domainByFeature = indexFacts(bundle.domainFacts, (row) => row.featureKey ?? row.packetKey);
	const structuralByFeature = indexFacts(bundle.structuralFacts, (row) => row.featureKey ?? row.packetKey);
	const ontologyByFeature = indexFacts(bundle.ontologyFacts, (row) => row.featureKey ?? row.packetKey);

	return bundle.implementations.map((row) => {
		const lexical = pickFirstFact(row.featureKey, row.packetKey, lexicalByFeature);
		const domain = pickFirstFact(row.featureKey, row.packetKey, domainByFeature);
		const structural = pickFirstFact(row.featureKey, row.packetKey, structuralByFeature);
		const ontology = pickFirstFact(row.featureKey, row.packetKey, ontologyByFeature);
		const packetKey = row.packetKey ?? lexical?.packetKey ?? domain?.packetKey ?? structural?.packetKey ?? null;
		const sourceRef = row.sourceRef ?? lexical?.sourceRef ?? domain?.sourceRef ?? structural?.sourceRef ?? null;
		const contentHash = row.contentHash ?? lexical?.contentHash ?? domain?.contentHash ?? structural?.contentHash ?? null;
		const usedConcepts = ontology?.predicate === 'USES_CONCEPT' && ontology.objectValue && typeof ontology.objectValue === 'object'
			? [
				String((ontology.objectValue as { concept?: string }).concept ?? ontology.objectId.replace(/^concept:/i, '')),
			].filter(Boolean)
			: [];

		return {
			featureKey: row.featureKey,
			featureName: row.featureName,
			description: row.description ?? '',
			laneIds: Array.isArray(row.laneIds) ? [...row.laneIds] : [],
			status: row.status,
			confidence: typeof row.confidence === 'number' ? row.confidence : 0,
			files: filesByKey.get(row.featureKey) ?? [],
			packetKey,
			sourceRef,
			contentHash,
			domainClass: domain?.domainClass ?? null,
			keywords: lexical?.keywords ? [...lexical.keywords] : [],
			identifiers: lexical?.identifiers ? [...lexical.identifiers] : [],
			treeNodeId: structural?.treeNodeId ?? null,
			usedConcepts,
			normalizedSource: lexical || domain || structural ? SOURCE_NORMALIZED : SOURCE_LEGACY,
		};
	});
}

export function joinLegacyRows(bundle: LegacyFeatureRowsBundle): FeatureRow[] {
	const filesByKey = new Map<string, string[]>();
	for (const edge of bundle.edges) {
		if (typeof edge.filePath !== 'string' || edge.filePath.length === 0) continue;
		const arr = filesByKey.get(edge.featureKey) ?? [];
		arr.push(edge.filePath);
		filesByKey.set(edge.featureKey, arr);
	}

	return bundle.implementations.map((row) => ({
		featureKey: row.featureKey,
		featureName: row.featureName,
		description: row.description ?? '',
		laneIds: Array.isArray(row.laneIds) ? [...row.laneIds] : [],
		status: row.status,
		confidence: typeof row.confidence === 'number' ? row.confidence : 0,
		files: filesByKey.get(row.featureKey) ?? [],
		normalizedSource: SOURCE_LEGACY,
	}));
}

export function indexFacts<T>(rows: readonly T[], keySelector: (row: T) => string | null | undefined): Map<string, T[]> {
	const byKey = new Map<string, T[]>();
	for (const row of rows) {
		const key = keySelector(row);
		if (!key) continue;
		const arr = byKey.get(key) ?? [];
		arr.push(row);
		byKey.set(key, arr);
	}
	return byKey;
}

export function pickFirstFact<T>(
	featureKey: string,
	packetKey: string | null,
	map: Map<string, T[]>,
): T | null {
	const featureMatches = map.get(featureKey);
	if (featureMatches?.length) return featureMatches[0] ?? null;
	if (packetKey) {
		const packetMatches = map.get(packetKey);
		if (packetMatches?.length) return packetMatches[0] ?? null;
	}
	return null;
}

export function indexByDir(features: readonly FeatureRow[]): Map<string, FeatureRow[]> {
	const byDir = new Map<string, FeatureRow[]>();
	for (const feature of features) {
		const seenDirs = new Set<string>();
		for (const filePath of feature.files) {
			const dir = path.dirname(filePath).replace(/\\/g, '/');
			if (seenDirs.has(dir)) continue;
			seenDirs.add(dir);
			const arr = byDir.get(dir) ?? [];
			arr.push(feature);
			byDir.set(dir, arr);
		}
	}
	return byDir;
}
