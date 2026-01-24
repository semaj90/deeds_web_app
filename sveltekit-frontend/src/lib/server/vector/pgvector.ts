/**
 * PgVector Integration Service
 * Handles vector similarity search using PostgreSQL pg_vector extension
 */

import type { Pool } from 'pg';
import pg from 'pg';

// Centralized Party role/type defaults
const DEFAULT_PARTY_ROLE = 'other' as const;
const DEFAULT_PARTY_TYPE = 'individual' as const;

// Single, canonical pg.Pool instance for server runtime
const POOL: Pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL
});

export interface Party {
	name: string;
	role: string;
	type: string;
}

export interface LegalCaseInfo {
	id: string;
	jurisdiction: string;
	parties: Party[];
	datesFiled: string[];
	courtLevel: 'district' | 'appellate' | 'supreme';
}

export interface LegalMetadata {
	case?: LegalCaseInfo;
	classification?: {
		documentType: 'contract' | 'evidence' | 'brief' | 'citation';
		practiceArea: string[];
		confidenceLevel: number;
		riskLevel: 'low' | 'medium' | 'high' | 'critical';
	};
	processing?: {
		extractedEntities: string[];
		keyTerms: string[];
		sentiment: number;
		complexity: number;
	};
}

export interface DocumentItem {
	id: string;
	source?: string;
	meta?: Record<string, unknown>;
	embeddings?: number[];
}

export interface VisionItem {
	id: string;
	embeddings?: number[];
}

export interface SearchResult {
	id: string;
	score: number;
	source: string;
	snippet: string;
	metadata: LegalMetadata;
}

// Type guards
function isString(v: unknown): v is string {
	return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
	return typeof v === 'number';
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

/**
 * Upsert a document or vision item into the `embeddings` table.
 */
export async function upsertToPGVector(item: DocumentItem | VisionItem): Promise<{ ok: boolean }> {
	const id = item.id;
	const vector = (item as DocumentItem).embeddings ?? (item as VisionItem).embeddings ?? [];
	const doc = {
		id,
		source: (item as DocumentItem).source ?? null,
		meta: (item as DocumentItem).meta ?? null
	};

	const sql = `
		INSERT INTO embeddings (id, doc, vector)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE SET
			doc = EXCLUDED.doc,
			vector = EXCLUDED.vector
	`;

	await POOL.query(sql, [id, JSON.stringify(doc), vector]);
	return { ok: true };
}

/**
 * Search pgvector-enabled table using the cosine-like <#> operator.
 */
export async function searchPGVector(queryVector: number[], topK = 10): Promise<SearchResult[]> {
	const sql = `
		SELECT id, doc, vector, 1.0 - (vector <#> $1) as score
		FROM embeddings
		ORDER BY vector <#> $1
		LIMIT $2
	`;

	const res = await POOL.query(sql, [queryVector, topK]);

	type MetaShape = Record<string, unknown> & {
		snippet?: string;
		case?: string | Record<string, unknown>;
		classification?: unknown;
		processing?: unknown;
	};

	type RowType = {
		id: string;
		doc: { source?: string; meta?: MetaShape } | null;
		vector: number[];
		score: number;
	};

	function normalizeLegalMetadata(meta?: MetaShape): LegalMetadata {
		// Extract and validate case information
		let caseId = '';
		let jurisdiction = '';
		const parties: Party[] = [];
		let datesFiled: string[] = [];
		let courtLevel: LegalCaseInfo['courtLevel'] = 'district';

		const rawCaseData = meta?.case;
		if (isString(rawCaseData)) {
			caseId = rawCaseData;
		} else if (isRecord(rawCaseData)) {
			if (isString(rawCaseData.id)) caseId = rawCaseData.id;
			if (isString(rawCaseData.jurisdiction)) jurisdiction = rawCaseData.jurisdiction;
			if (isStringArray(rawCaseData.parties)) {
				rawCaseData.parties.forEach((name) => {
					parties.push({ name, role: DEFAULT_PARTY_ROLE, type: DEFAULT_PARTY_TYPE });
				});
			}
			if (isStringArray(rawCaseData.datesFiled)) datesFiled = rawCaseData.datesFiled;
			if (
				isString(rawCaseData.courtLevel) &&
				['district', 'appellate', 'supreme'].includes(rawCaseData.courtLevel)
			) {
				courtLevel = rawCaseData.courtLevel as LegalCaseInfo['courtLevel'];
			}
		}

		const defaultCase: LegalCaseInfo = {
			id: caseId || '',
			jurisdiction: jurisdiction || 'unknown',
			parties,
			datesFiled,
			courtLevel
		};

		// Default classification
		const classification: LegalMetadata['classification'] = {
			documentType: 'evidence',
			practiceArea: [],
			confidenceLevel: 0,
			riskLevel: 'low'
		};

		// Default processing
		const processing: LegalMetadata['processing'] = {
			extractedEntities: [],
			keyTerms: [],
			sentiment: 0,
			complexity: 0
		};

		return {
			case: defaultCase,
			classification,
			processing
		};
	}

	return (res.rows as RowType[]).map((r) => {
		const rawSnippet = isString(r.doc?.meta?.snippet) ? r.doc!.meta!.snippet : '';
		const metadata = normalizeLegalMetadata(r.doc?.meta ?? undefined);

		return {
			id: r.id,
			score: r.score,
			source: r.doc?.source ?? 'unknown',
			snippet: rawSnippet,
			metadata
		};
	});
}

/**
 * Close the pool connection
 */
export async function closePool(): Promise<void> {
	await POOL.end();
}

