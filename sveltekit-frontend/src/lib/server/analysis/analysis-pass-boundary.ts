import { db, pgRows } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
	ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID,
	ATLAS_CANONICAL_SEMANTIC_DIMENSION as SEMANTIC_DIMENSION,
} from '../atlas/retrieval/qdrant-semantic-projection.js';

export interface AnalysisPassBoundaryProofSnapshot {
	generatedAt: string;
	status: 'available' | 'unavailable';
	currentBoundaryKind: 'view_only' | 'unique_materialization' | 'unknown';
	appendOnlyHistoryTable: string;
	currentMaterializationView: string;
	rawRows: number;
	currentRows: number;
	canonicalRepresentationId: typeof SEMANTIC_REPRESENTATION_ID;
	canonicalDimension: typeof SEMANTIC_DIMENSION;
	reuseBoundary: 'application_level_reuse';
	uniqueConstraintPresent: boolean;
}

async function relationKind(name: string): Promise<string | null> {
	try {
		const rows = pgRows<{ relkind: string }>(
			await db.execute(sql`SELECT relkind FROM pg_class WHERE oid = to_regclass(${`public.${name}`})`)
		);
		return rows[0]?.relkind ?? null;
	} catch {
		return null;
	}
}

async function hasUniqueConstraintOnAnalysisPassResults(): Promise<boolean> {
	try {
		const rows = pgRows<{ has_unique: boolean }>(
			await db.execute(sql`
				SELECT EXISTS (
					SELECT 1
					FROM pg_index i
					WHERE i.indrelid = to_regclass('public.analysis_pass_current')
					  AND i.indisunique
				) AS has_unique
			`)
		);
		return Boolean(rows[0]?.has_unique);
	} catch {
		return false;
	}
}

export async function buildAnalysisPassBoundaryProofSnapshot(): Promise<AnalysisPassBoundaryProofSnapshot> {
	try {
		const viewKind = await relationKind('analysis_pass_current');
		if (viewKind !== 'v') {
			return {
				generatedAt: new Date().toISOString(),
				status: 'unavailable',
				currentBoundaryKind: 'unknown',
				appendOnlyHistoryTable: 'analysis_pass_results',
				currentMaterializationView: 'analysis_pass_current',
				rawRows: 0,
				currentRows: 0,
				canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
				canonicalDimension: SEMANTIC_DIMENSION,
				reuseBoundary: 'application_level_reuse',
				uniqueConstraintPresent: await hasUniqueConstraintOnAnalysisPassResults(),
			};
		}

		const rawRows = Number(
			pgRows<{ total_rows: string | number }>(
				await db.execute(sql`SELECT COUNT(*)::bigint AS total_rows FROM analysis_pass_results`)
			)[0]?.total_rows ?? 0
		);
		const currentRows = Number(
			pgRows<{ total_rows: string | number }>(
				await db.execute(sql`SELECT COUNT(*)::bigint AS total_rows FROM analysis_pass_current`)
			)[0]?.total_rows ?? 0
		);

		return {
			generatedAt: new Date().toISOString(),
			status: 'available',
			currentBoundaryKind: 'view_only',
			appendOnlyHistoryTable: 'analysis_pass_results',
			currentMaterializationView: 'analysis_pass_current',
			rawRows,
			currentRows,
			canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
			canonicalDimension: SEMANTIC_DIMENSION,
			reuseBoundary: 'application_level_reuse',
			uniqueConstraintPresent: await hasUniqueConstraintOnAnalysisPassResults(),
		};
	} catch {
		return {
			generatedAt: new Date().toISOString(),
			status: 'unavailable',
			currentBoundaryKind: 'unknown',
			appendOnlyHistoryTable: 'analysis_pass_results',
			currentMaterializationView: 'analysis_pass_current',
			rawRows: 0,
			currentRows: 0,
			canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
			canonicalDimension: SEMANTIC_DIMENSION,
			reuseBoundary: 'application_level_reuse',
			uniqueConstraintPresent: false,
		};
	}
}
