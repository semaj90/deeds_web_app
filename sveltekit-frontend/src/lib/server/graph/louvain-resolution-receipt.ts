import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { classifyGraphPacketPath } from './graph-packet-key-resolver.js';

export interface LouvainResolutionSeedRow {
	graphNodeKey: string;
	rawPath: string;
	communityId: string;
}

export interface LouvainResolutionCandidateRow {
	graphNodeKey: string;
	rawPath: string;
	normalizedPath: string;
	packetKey: string | null;
	sourceRef: string | null;
	canonicalSourceRef: string | null;
	filePath: string | null;
	sourcePath: string | null;
	sourceRefKey: string | null;
}

export type LouvainResolutionBucket =
	| 'RESOLVED_EXISTING_RULE'
	| 'AMBIGUOUS_MATCH'
	| 'NO_PACKET_ROW'
	| 'DIFFERENT_GRAIN'
	| 'STALE_PROJECTION'
	| 'PROVENANCE_INSUFFICIENT'
	| 'MALFORMED_LEGACY_PATH'
	| 'EXCLUDED_PATH';

export interface LouvainResolutionReceiptRow {
	graphNodeKey: string;
	rawPath: string;
	normalizedPath: string;
	matchCount: number;
	packetKeys: string[];
	sourceRefs: string[];
	classification: LouvainResolutionBucket;
	reason: string;
}

export interface LouvainResolutionReceipt {
	receiptId: string;
	runId: string;
	sourceRunId: string;
	sourceReceiptId: string;
	projectionName: string;
	graphRevision: string;
	inputUnresolvedCount: number;
	inputUnresolvedSetHash: string;
	totalRows: number;
	resolvedRows: number;
	approvedExcludedRows: number;
	blockingRows: number;
	ambiguousRows: number;
	unresolvedRows: number;
	excludedRows: number;
	provenanceInsufficientRows: number;
	unclassifiedRows: number;
	bucketCounts: Record<LouvainResolutionBucket, number>;
	rows: LouvainResolutionReceiptRow[];
	createdAt: string;
	replaySafe: boolean;
}

const LouvainResolutionReceiptSchema = z
	.object({
		receiptId: z.string().min(1),
		runId: z.string().min(1),
		sourceRunId: z.string().min(1),
		sourceReceiptId: z.string().min(1),
		projectionName: z.string().min(1),
		graphRevision: z.string().min(1),
		inputUnresolvedCount: z.number().int().nonnegative(),
		inputUnresolvedSetHash: z.string().min(1),
		totalRows: z.number().int().nonnegative(),
		resolvedRows: z.number().int().nonnegative(),
		approvedExcludedRows: z.number().int().nonnegative(),
		blockingRows: z.number().int().nonnegative(),
		ambiguousRows: z.number().int().nonnegative(),
		unresolvedRows: z.number().int().nonnegative(),
		excludedRows: z.number().int().nonnegative(),
		provenanceInsufficientRows: z.number().int().nonnegative(),
		unclassifiedRows: z.number().int().nonnegative(),
		bucketCounts: z.record(z.enum([
			'RESOLVED_EXISTING_RULE',
			'AMBIGUOUS_MATCH',
			'NO_PACKET_ROW',
			'DIFFERENT_GRAIN',
			'STALE_PROJECTION',
			'PROVENANCE_INSUFFICIENT',
			'MALFORMED_LEGACY_PATH',
			'EXCLUDED_PATH',
		]), z.number().int().nonnegative()),
		rows: z.array(z.object({
			graphNodeKey: z.string().min(1),
			rawPath: z.string().min(1),
			normalizedPath: z.string(),
			matchCount: z.number().int().nonnegative(),
			packetKeys: z.array(z.string()),
			sourceRefs: z.array(z.string()),
			classification: z.enum([
				'RESOLVED_EXISTING_RULE',
				'AMBIGUOUS_MATCH',
				'NO_PACKET_ROW',
				'DIFFERENT_GRAIN',
				'STALE_PROJECTION',
				'PROVENANCE_INSUFFICIENT',
				'MALFORMED_LEGACY_PATH',
				'EXCLUDED_PATH',
			]),
			reason: z.string(),
		})),
		createdAt: z.string().datetime(),
		replaySafe: z.boolean(),
	})
	.strict();

function classifyNoMatch(normalizedPath: string): Exclude<LouvainResolutionBucket, 'RESOLVED_EXISTING_RULE' | 'AMBIGUOUS_MATCH' | 'EXCLUDED_PATH'> {
	if (!normalizedPath) return 'MALFORMED_LEGACY_PATH';
	if (!/\.[a-z0-9]+$/i.test(normalizedPath)) return 'DIFFERENT_GRAIN';
	if (normalizedPath.includes('src/') || normalizedPath.startsWith('src/') || normalizedPath.startsWith('routes/') || normalizedPath.startsWith('lib/')) {
		return 'NO_PACKET_ROW';
	}
	return 'PROVENANCE_INSUFFICIENT';
}

function hashInputRows(rows: readonly LouvainResolutionSeedRow[]): string {
	const canonicalRows = [...rows]
		.map((row) => ({
			graphNodeKey: row.graphNodeKey,
			rawPath: row.rawPath,
			communityId: row.communityId,
		}))
		.sort((a, b) => {
			const left = `${a.graphNodeKey}\u0000${a.rawPath}\u0000${a.communityId}`;
			const right = `${b.graphNodeKey}\u0000${b.rawPath}\u0000${b.communityId}`;
			return left.localeCompare(right);
		});

	return createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex');
}

function isApprovedExclusion(bucket: LouvainResolutionBucket): boolean {
	return bucket === 'EXCLUDED_PATH'
		|| bucket === 'DIFFERENT_GRAIN'
		|| bucket === 'STALE_PROJECTION'
		|| bucket === 'MALFORMED_LEGACY_PATH'
		|| bucket === 'NO_PACKET_ROW';
}

function buildLookupSql(rows: readonly LouvainResolutionSeedRow[]): { sql: string; params: unknown[] } {
	if (rows.length === 0) {
		return {
			sql: `
				WITH unresolved(graph_node_key, raw_path, normalized_path) AS (
					SELECT NULL::text, NULL::text, NULL::text WHERE FALSE
				)
				SELECT
					u.graph_node_key,
					u.raw_path,
					u.normalized_path,
					p.packet_key,
					p.source_ref,
					p.canonical_source_ref,
					p.file_path,
					p.source_path,
					p.source_ref_key
				FROM unresolved u
				LEFT JOIN atlas_packets p
				  ON p.source_ref = u.normalized_path
				  OR p.canonical_source_ref = u.normalized_path
				  OR p.file_path = u.normalized_path
				  OR p.source_path = u.normalized_path
				  OR p.source_ref_key = u.normalized_path
			`,
			params: [],
		};
	}

	const params: unknown[] = [];
	const values: string[] = [];
	rows.forEach((row, index) => {
		const base = index * 3;
		const normalized = classifyGraphPacketPath(row.rawPath).normalizedPath;
		values.push(`($${base + 1}::text, $${base + 2}::text, $${base + 3}::text)`);
		params.push(row.graphNodeKey, row.rawPath, normalized);
	});

	return {
		sql: `
			WITH unresolved(graph_node_key, raw_path, normalized_path) AS (
				VALUES ${values.join(',\n')}
			)
			SELECT
				u.graph_node_key,
				u.raw_path,
				u.normalized_path,
				p.packet_key,
				p.source_ref,
				p.canonical_source_ref,
				p.file_path,
				p.source_path,
				p.source_ref_key
			FROM unresolved u
			LEFT JOIN atlas_packets p
			  ON p.source_ref = u.normalized_path
			  OR p.canonical_source_ref = u.normalized_path
			  OR p.file_path = u.normalized_path
			  OR p.source_path = u.normalized_path
			  OR p.source_ref_key = u.normalized_path
			ORDER BY u.graph_node_key, p.packet_key NULLS LAST
		`,
		params,
	};
}

export async function buildLouvainResolutionReceipt(
	db: Pool,
	inputRows: readonly LouvainResolutionSeedRow[],
	params: {
		runId: string;
		sourceRunId?: string;
		sourceReceiptId?: string;
		projectionName: string;
		graphRevision: string;
	} = {
		runId: 'unknown',
		sourceRunId: 'unknown',
		sourceReceiptId: 'unknown',
		projectionName: 'unknown',
		graphRevision: 'unknown',
	},
): Promise<LouvainResolutionReceipt> {
	const { sql, params: queryParams } = buildLookupSql(inputRows);
	const { rows } = await db.query<{
		graph_node_key: string;
		raw_path: string;
		normalized_path: string;
		packet_key: string | null;
		source_ref: string | null;
		canonical_source_ref: string | null;
		file_path: string | null;
		source_path: string | null;
		source_ref_key: string | null;
	}>(sql, queryParams);

	const grouped = new Map<string, LouvainResolutionCandidateRow[]>();
	for (const row of rows) {
		const key = String(row.graph_node_key ?? '');
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key)!.push({
			graphNodeKey: key,
			rawPath: String(row.raw_path ?? ''),
			normalizedPath: String(row.normalized_path ?? ''),
			packetKey: row.packet_key,
			sourceRef: row.source_ref,
			canonicalSourceRef: row.canonical_source_ref,
			filePath: row.file_path,
			sourcePath: row.source_path,
			sourceRefKey: row.source_ref_key,
		});
	}

	const receiptRows: LouvainResolutionReceiptRow[] = [];
	const bucketCounts: Record<LouvainResolutionBucket, number> = {
		RESOLVED_EXISTING_RULE: 0,
		AMBIGUOUS_MATCH: 0,
		NO_PACKET_ROW: 0,
		DIFFERENT_GRAIN: 0,
		STALE_PROJECTION: 0,
		PROVENANCE_INSUFFICIENT: 0,
		MALFORMED_LEGACY_PATH: 0,
		EXCLUDED_PATH: 0,
	};

	let resolvedRows = 0;
	let approvedExcludedRows = 0;
	let blockingRows = 0;
	let ambiguousRows = 0;
	let provenanceInsufficientRows = 0;
	let unclassifiedRows = 0;

	for (const input of inputRows) {
		const classification = classifyGraphPacketPath(input.rawPath);
		const candidateRows = grouped.get(input.graphNodeKey) ?? [];
		const packetKeys = [...new Set(candidateRows.map((r) => r.packetKey).filter((value): value is string => !!value))];
		const sourceRefs = [...new Set(candidateRows.flatMap((r) => [r.sourceRef, r.canonicalSourceRef, r.filePath, r.sourcePath, r.sourceRefKey]).filter((value): value is string => !!value))];

		let bucket: LouvainResolutionBucket;
		let reason = '';

		if (classification.kind === 'excluded') {
			bucket = 'EXCLUDED_PATH';
			reason = classification.reason ?? 'excluded';
			approvedExcludedRows++;
		} else if (packetKeys.length === 1) {
			bucket = 'RESOLVED_EXISTING_RULE';
			reason = 'single canonical match';
			resolvedRows++;
		} else if (packetKeys.length > 1) {
			bucket = 'AMBIGUOUS_MATCH';
			reason = 'multiple canonical matches';
			ambiguousRows++;
			blockingRows++;
		} else {
			bucket = classifyNoMatch(classification.normalizedPath);
			reason = bucket === 'MALFORMED_LEGACY_PATH'
				? 'path did not normalize'
				: bucket === 'DIFFERENT_GRAIN'
					? 'graph node is not packet-grain'
					: bucket === 'NO_PACKET_ROW'
						? 'no atlas_packets row'
						: 'lineage insufficient';
			if (isApprovedExclusion(bucket)) {
				approvedExcludedRows++;
			} else if (bucket === 'PROVENANCE_INSUFFICIENT') {
				provenanceInsufficientRows++;
				blockingRows++;
			} else {
				unclassifiedRows++;
				blockingRows++;
			}
		}

		bucketCounts[bucket]++;
		receiptRows.push({
			graphNodeKey: input.graphNodeKey,
			rawPath: input.rawPath,
			normalizedPath: classification.normalizedPath,
			matchCount: packetKeys.length,
			packetKeys,
			sourceRefs,
			classification: bucket,
			reason,
		});
	}

	const receiptSeed = {
		runId: params.runId,
		sourceRunId: params.sourceRunId ?? params.runId,
		sourceReceiptId: params.sourceReceiptId ?? `louvain-persistence-${params.runId}`,
		projectionName: params.projectionName,
		graphRevision: params.graphRevision,
		inputUnresolvedCount: inputRows.length,
		inputUnresolvedSetHash: hashInputRows(inputRows),
		totalRows: inputRows.length,
		resolvedRows,
		approvedExcludedRows,
		blockingRows,
		ambiguousRows,
		unresolvedRows: blockingRows,
		excludedRows: approvedExcludedRows,
		provenanceInsufficientRows,
		unclassifiedRows,
		bucketCounts,
		rows: receiptRows,
		replaySafe: blockingRows === 0,
	};

	return LouvainResolutionReceiptSchema.parse({
		...receiptSeed,
		receiptId: `louvain-resolution-${createHash('sha256').update(JSON.stringify(receiptSeed)).digest('hex').slice(0, 16)}`,
		createdAt: new Date(0).toISOString(),
	});
}

export async function buildLatestLouvainResolutionReceipt(db: Pool): Promise<LouvainResolutionReceipt | null> {
	const persistenceReceipt = await (await import('./graph-dispatcher-proof.js')).buildLouvainPersistenceReceipt(db);
	if (!persistenceReceipt) return null;

	let runRows: Array<{
		run_id: string;
		projection_name: string;
		graph_revision: string;
		metrics: { assignments?: number; unresolvedPacketKeys?: number; excludedPacketKeys?: number } | null;
	}> = [];
	try {
		const result = await db.query<{
			run_id: string;
			projection_name: string;
			graph_revision: string;
			metrics: { assignments?: number; unresolvedPacketKeys?: number; excludedPacketKeys?: number } | null;
		}>(`
			SELECT run_id, projection_name, graph_revision, metrics
			FROM graph_analysis_runs
			WHERE algorithm = 'louvain' AND status = 'succeeded'
			ORDER BY started_at DESC
			LIMIT 1
		`);
		runRows = result.rows;
	} catch (error) {
		if (!(error instanceof Error) || !/graph_analysis_runs/i.test(error.message)) {
			throw error;
		}
		return null;
	}

	const run = runRows[0];
	if (!run) return null;

	let seedRows: Array<{ graph_node_key: string; raw_path: string; community_id: string }> = [];
	try {
		const result = await db.query<{
			graph_node_key: string;
			raw_path: string;
			community_id: string;
		}>(`
			SELECT graph_node_key, raw_path, community_id
			FROM graph_community_resolution_seeds
			WHERE run_id = $1 AND algorithm = 'louvain'
			ORDER BY graph_node_key
		`, [run.run_id]);
		seedRows = result.rows;
	} catch (error) {
		if (!(error instanceof Error) || !/graph_community_resolution_seeds/i.test(error.message)) {
			throw error;
		}
		return null;
	}

	if (seedRows.length === 0) return null;

	return buildLouvainResolutionReceipt(
		db,
		seedRows.map((row) => ({
			graphNodeKey: String(row.graph_node_key ?? ''),
			rawPath: String(row.raw_path ?? ''),
			communityId: String(row.community_id ?? ''),
		})),
		{
			runId: run.run_id,
			sourceRunId: run.run_id,
			sourceReceiptId: persistenceReceipt.receiptId,
			projectionName: run.projection_name,
			graphRevision: run.graph_revision,
		},
	);
}
