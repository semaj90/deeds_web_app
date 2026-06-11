import type { Pool } from 'pg';

export interface NgramHit {
	source: 'chunk' | 'packet_chunk' | 'error_fingerprint' | 'research_summary' | 'wiki_note';
	id: string;
	text: string;
	filePath?: string;
	symbols?: string[];
	similarity: number;
	tags?: string[];
}

export async function ngramRecall(
	pool: Pool,
	query: string,
	limit = 10
): Promise<NgramHit[]> {
	const chunkQuery = pool
		.query<{ id: string; text: string; file_path: string | null; sim: number }>(
			`SELECT id::text, content AS text, source_path AS file_path,
			        similarity(content, $1) AS sim
			 FROM document_chunks
			 WHERE similarity(content, $1) > 0.15
			 ORDER BY sim DESC
			 LIMIT $2`,
			[query, limit]
		)
		.then((r) =>
			r.rows.map(
				(row): NgramHit => ({
					source: 'chunk',
					id: row.id,
					text: row.text.slice(0, 300),
					filePath: row.file_path ?? undefined,
					similarity: Number(row.sim)
				})
			)
		)
		.catch((): NgramHit[] => []);

	const packetChunkQuery = pool
		.query<{ id: string; text: string; packet_key: string; sim: number }>(
			`SELECT id::text, markdown_content AS text, packet_key,
			        similarity(markdown_content, $1) AS sim
			 FROM packet_markdown_chunks
			 WHERE similarity(markdown_content, $1) > 0.15
			 ORDER BY sim DESC
			 LIMIT $2`,
			[query, limit]
		)
		.then((r) =>
			r.rows.map(
				(row): NgramHit => ({
					source: 'packet_chunk',
					id: row.id,
					text: row.text.slice(0, 300),
					filePath: row.packet_key,
					similarity: Number(row.sim)
				})
			)
		)
		.catch((): NgramHit[] => []);

	const errorQuery = pool
		.query<{
			id: string;
			text: string;
			file_path: string | null;
			top_symbols: string[] | null;
			sim: number;
		}>(
			`SELECT error_hash AS id, normalized_text AS text, top_files[1] AS file_path,
			        top_symbols, similarity(normalized_text, $1) AS sim
			 FROM error_fingerprints
			 WHERE similarity(normalized_text, $1) > 0.2
			 ORDER BY sim DESC
			 LIMIT $2`,
			[query, limit]
		)
		.then((r) =>
			r.rows.map(
				(row): NgramHit => ({
					source: 'error_fingerprint',
					id: row.id,
					text: row.text.slice(0, 300),
					filePath: row.file_path ?? undefined,
					symbols: row.top_symbols ?? undefined,
					similarity: Number(row.sim)
				})
			)
		)
		.catch((): NgramHit[] => []);

	const researchQuery = pool
		.query<{ id: string; text: string; sim: number }>(
			`SELECT id::text, content AS text, null AS file_path,
			        similarity(content, $1) AS sim
			 FROM research_summaries
			 WHERE similarity(content, $1) > 0.15
			 ORDER BY sim DESC
			 LIMIT $2`,
			[query, limit]
		)
		.then((r) =>
			r.rows.map(
				(row): NgramHit => ({
					source: 'research_summary',
					id: row.id,
					text: row.text.slice(0, 300),
					similarity: Number(row.sim)
				})
			)
		)
		.catch((): NgramHit[] => []);

	// P2-B: wiki note lane — Karpathy-pattern summaries, audit findings, architecture decisions
	const wikiQuery = pool
		.query<{ id: string; text: string; sim: number }>(
			`SELECT id::text, content AS text,
			        similarity(content, $1) AS sim
			 FROM kag_notes
			 WHERE similarity(content, $1) > 0.20
			 ORDER BY sim DESC
			 LIMIT $2`,
			[query, limit]
		)
		.then((r) =>
			r.rows.map(
				(row): NgramHit => ({
					source: 'wiki_note',
					id: row.id,
					text: row.text.slice(0, 300),
					similarity: Number(row.sim)
				})
			)
		)
		.catch((): NgramHit[] => []);

	const results = await Promise.allSettled([chunkQuery, packetChunkQuery, errorQuery, researchQuery, wikiQuery]);

	const merged: NgramHit[] = [];
	for (const result of results) {
		if (result.status === 'fulfilled') {
			merged.push(...result.value);
		}
	}

	const seen = new Set<string>();
	const deduped: NgramHit[] = [];
	for (const hit of merged) {
		const key = `${hit.source}:${hit.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			deduped.push(hit);
		}
	}

	return deduped.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export async function fullTextRecall(
	pool: Pool,
	query: string,
	limit = 8
): Promise<NgramHit[]> {
	const documentFts = pool.query<{
		id: string;
		text: string;
		file_path: string | null;
		rank: number;
	}>(
		`SELECT id::text, content AS text, source_path AS file_path,
		        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
		 FROM document_chunks
		 WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
		 ORDER BY rank DESC
		 LIMIT $2`,
		[query, limit]
	).then((res) =>
		res.rows.map(
			(row): NgramHit => ({
				source: 'chunk',
				id: row.id,
				text: row.text.slice(0, 300),
				filePath: row.file_path ?? undefined,
				similarity: Number(row.rank)
			})
		)
	).catch((): NgramHit[] => []);

	const packetFts = pool.query<{
		id: string;
		text: string;
		packet_key: string;
		rank: number;
	}>(
		`SELECT id::text, markdown_content AS text, packet_key,
		        ts_rank(ts_vector, plainto_tsquery('english', $1)) AS rank
		 FROM packet_markdown_chunks
		 WHERE ts_vector @@ plainto_tsquery('english', $1)
		 ORDER BY rank DESC
		 LIMIT $2`,
		[query, limit]
	).then((res) =>
		res.rows.map(
			(row): NgramHit => ({
				source: 'packet_chunk',
				id: row.id,
				text: row.text.slice(0, 300),
				filePath: row.packet_key,
				similarity: Number(row.rank)
			})
		)
	).catch((): NgramHit[] => []);

	const settled = await Promise.allSettled([documentFts, packetFts]);
	const merged: NgramHit[] = [];
	for (const s of settled) {
		if (s.status === 'fulfilled') {
			merged.push(...s.value);
		}
	}

	return merged.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export async function multiTextRecall(
	pool: Pool,
	query: string,
	limit = 12
): Promise<NgramHit[]> {
	const [ngramHits, ftsHits] = await Promise.all([
		ngramRecall(pool, query, limit),
		fullTextRecall(pool, query, limit)
	]);

	const scoreMap = new Map<string, NgramHit>();

	for (const hit of [...ngramHits, ...ftsHits]) {
		const key = `${hit.source}:${hit.id}`;
		const existing = scoreMap.get(key);
		if (!existing || hit.similarity > existing.similarity) {
			scoreMap.set(key, hit);
		}
	}

	return Array.from(scoreMap.values())
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, limit);
}
