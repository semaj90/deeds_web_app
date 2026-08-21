import { db, pgRows } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
	ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID,
	ATLAS_CANONICAL_SEMANTIC_DIMENSION as SEMANTIC_DIMENSION,
} from '../atlas/retrieval/qdrant-semantic-projection.js';

export interface AnalysisPassCurrentProofSnapshot {
	generatedAt: string;
	status: 'available' | 'unavailable';
	rawRows: number;
	currentRows: number;
	duplicateCollapse: number;
	canonicalRepresentationId: typeof SEMANTIC_REPRESENTATION_ID;
	canonicalDimension: typeof SEMANTIC_DIMENSION;
	sampleCurrentRows: Array<{
		id: number;
		packetKey: string;
		sourceRevision: string | null;
		passType: string;
		passRevision: string | null;
		inputHash: string | null;
		createdAt: string | null;
	}>;
}

async function viewExists(viewName: string): Promise<boolean> {
	try {
		const rows = pgRows<{ exists: boolean }>(
			await db.execute(sql`SELECT to_regclass(${`public.${viewName}`}) IS NOT NULL AS exists`)
		);
		return Boolean(rows[0]?.exists);
	} catch {
		return false;
	}
}

export async function buildAnalysisPassCurrentProofSnapshot(limit = 5): Promise<AnalysisPassCurrentProofSnapshot> {
	try {
		const available = await viewExists('analysis_pass_current');

		if (!available) {
			return {
				generatedAt: new Date().toISOString(),
				status: 'unavailable',
				rawRows: 0,
				currentRows: 0,
				duplicateCollapse: 0,
				canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
				canonicalDimension: SEMANTIC_DIMENSION,
				sampleCurrentRows: [],
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
		const sampleCurrentRows = pgRows<{
			id: number;
			packet_key: string;
			source_revision: string | null;
			pass_type: string;
			pass_revision: string | null;
			input_hash: string | null;
			created_at: string | null;
		}>(await db.execute(sql`
			SELECT id, packet_key, source_revision, pass_type, pass_revision, input_hash, created_at
			FROM analysis_pass_current
			ORDER BY created_at DESC, id DESC
			LIMIT ${Math.max(1, Math.floor(limit))}
		`)).map((row) => ({
			id: Number(row.id),
			packetKey: row.packet_key,
			sourceRevision: row.source_revision ?? null,
			passType: row.pass_type,
			passRevision: row.pass_revision ?? null,
			inputHash: row.input_hash ?? null,
			createdAt: row.created_at ?? null,
		}));

		return {
			generatedAt: new Date().toISOString(),
			status: 'available',
			rawRows,
			currentRows,
			duplicateCollapse: rawRows - currentRows,
			canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
			canonicalDimension: SEMANTIC_DIMENSION,
			sampleCurrentRows,
		};
	} catch {
		return {
			generatedAt: new Date().toISOString(),
			status: 'unavailable',
			rawRows: 0,
			currentRows: 0,
			duplicateCollapse: 0,
			canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
			canonicalDimension: SEMANTIC_DIMENSION,
			sampleCurrentRows: [],
		};
	}
}
