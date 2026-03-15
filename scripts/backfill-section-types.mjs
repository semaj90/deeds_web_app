#!/usr/bin/env node
/**
 * Backfill section_type metadata for existing evidence vectors.
 *
 * Queries evidence_vectors for chunks where metadata->>'sectionType' IS NULL,
 * groups by evidence_id, calls LangExtract to classify sections, then updates
 * both pgvector metadata and Qdrant payload.
 *
 * Usage:
 *   node scripts/backfill-section-types.mjs                     # default: 100 items, batch 10
 *   node scripts/backfill-section-types.mjs --dry-run            # preview without writing
 *   node scripts/backfill-section-types.mjs --limit 500          # process up to 500 evidence items
 *   node scripts/backfill-section-types.mjs --batch-size 20      # group 20 evidence items per batch
 */
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args[args.indexOf('--limit') + 1]) || 100;
const BATCH_SIZE = parseInt(args[args.indexOf('--batch-size') + 1]) || 10;

// ── Config (mirrors env.server.ts defaults) ─────────────────────────────
const PG_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/deeds_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://localhost:8095';
const QDRANT_COLLECTION = 'evidence_items';

// ── Clients ─────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
const qdrant = new QdrantClient({ url: QDRANT_URL });

// ── Section type heuristic fallback ─────────────────────────────────────
const SECTION_PATTERNS = [
	{ type: 'facts', pattern: /\b(fact|factual|background|circumstances|events)\b/i },
	{ type: 'issues', pattern: /\b(issue|question presented|question of law)\b/i },
	{ type: 'reasoning', pattern: /\b(reasoning|analysis|discussion|rationale)\b/i },
	{ type: 'holding', pattern: /\b(holding|held|conclude|decision|ruling|we hold)\b/i },
	{ type: 'citations', pattern: /\b(\d+\s+U\.?S\.?C?\.?\s*§|\d+\s+F\.\s*\d|v\.\s+\w)/i },
	{ type: 'parties', pattern: /\b(plaintiff|defendant|petitioner|respondent|appellant|appellee)\b/i },
	{ type: 'motions', pattern: /\b(motion|moved|petition|request for|order)\b/i },
	{ type: 'procedural_history', pattern: /\b(procedural|history|prior proceedings|lower court|appeal)\b/i },
	{ type: 'sentencing', pattern: /\b(sentence|sentencing|punishment|incarceration|fine|penalty)\b/i },
	{ type: 'judgment', pattern: /\b(judgment|judgement|affirmed|reversed|remanded|dismissed)\b/i },
];

function detectSectionHeuristic(text) {
	for (const { type, pattern } of SECTION_PATTERNS) {
		if (pattern.test(text)) return type;
	}
	return null;
}

// ── LangExtract caller ──────────────────────────────────────────────────
async function callLangExtract(text, docId) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	try {
		const res = await fetch(`${LANGEXTRACT_URL}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: text.slice(0, 50_000), document_id: docId, document_type: 'case' }),
			signal: controller.signal,
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.sections ?? [];
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

// ── Offset-overlap section mapper ───────────────────────────────────────
function findChunkSectionType(chunkStart, chunkEnd, sections) {
	let bestType = null;
	let bestOverlap = 0;
	for (const s of sections) {
		const overlapStart = Math.max(chunkStart, s.start_offset);
		const overlapEnd = Math.min(chunkEnd, s.end_offset);
		const overlap = overlapEnd - overlapStart;
		if (overlap > bestOverlap) {
			bestOverlap = overlap;
			bestType = s.section_type;
		}
	}
	return bestType;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
	console.log(`[backfill] Starting section-type backfill`);
	console.log(`[backfill] Config: limit=${LIMIT}, batch=${BATCH_SIZE}, dryRun=${DRY_RUN}`);
	console.log(`[backfill] PG: ${PG_URL.replace(/:[^@]+@/, ':***@')}`);
	console.log(`[backfill] Qdrant: ${QDRANT_URL}`);
	console.log(`[backfill] LangExtract: ${LANGEXTRACT_URL}`);

	// 1. Find evidence IDs with chunks that have no sectionType
	const { rows: evidenceIds } = await pool.query(`
		SELECT DISTINCT ev.evidence_id
		FROM evidence_vectors ev
		WHERE ev.metadata->>'sectionType' IS NULL
		   OR ev.metadata->>'sectionType' = ''
		LIMIT $1
	`, [LIMIT]);

	console.log(`[backfill] Found ${evidenceIds.length} evidence items needing section types`);
	if (evidenceIds.length === 0) {
		console.log('[backfill] Nothing to backfill — all evidence already has section types');
		await pool.end();
		return;
	}

	let totalUpdated = 0;
	let totalFailed = 0;
	let totalSkipped = 0;

	// 2. Process in batches
	for (let i = 0; i < evidenceIds.length; i += BATCH_SIZE) {
		const batch = evidenceIds.slice(i, i + BATCH_SIZE);
		console.log(`[backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(evidenceIds.length / BATCH_SIZE)} (${batch.length} items)`);

		for (const { evidence_id: evId } of batch) {
			try {
				// 3. Get all chunks for this evidence
				const { rows: chunks } = await pool.query(`
					SELECT chunk_index, content, metadata
					FROM evidence_vectors
					WHERE evidence_id = $1
					ORDER BY chunk_index
				`, [evId]);

				if (chunks.length === 0) { totalSkipped++; continue; }

				// 4. Concatenate chunk text for LangExtract
				const fullText = chunks.map(c => c.content).join('\n\n');

				// 5. Call LangExtract (with heuristic fallback)
				let sections = await callLangExtract(fullText, evId);
				const langExtractWorked = sections !== null && sections.length > 0;

				if (!langExtractWorked) {
					// Heuristic: classify each chunk individually
					sections = [];
				}

				// 6. Map each chunk to its section type
				let chunkOffset = 0;
				const updates = [];
				for (const chunk of chunks) {
					const chunkLen = chunk.content.length;
					let sectionType;

					if (langExtractWorked && sections.length > 0) {
						sectionType = findChunkSectionType(chunkOffset, chunkOffset + chunkLen, sections);
					}

					// Fallback to heuristic
					if (!sectionType) {
						sectionType = detectSectionHeuristic(chunk.content);
					}

					if (sectionType) {
						updates.push({ chunkIndex: chunk.chunk_index, sectionType, metadata: chunk.metadata });
					}

					chunkOffset += chunkLen + 2; // +2 for '\n\n' separator
				}

				if (updates.length === 0) {
					totalSkipped++;
					continue;
				}

				if (DRY_RUN) {
					console.log(`[backfill] [DRY-RUN] ${evId}: would update ${updates.length}/${chunks.length} chunks`);
					const dist = {};
					for (const u of updates) { dist[u.sectionType] = (dist[u.sectionType] || 0) + 1; }
					console.log(`[backfill]   section types: ${JSON.stringify(dist)}`);
					totalUpdated += updates.length;
					continue;
				}

				// 7. Update pgvector metadata
				for (const u of updates) {
					const meta = typeof u.metadata === 'string' ? JSON.parse(u.metadata) : (u.metadata || {});
					meta.sectionType = u.sectionType;

					await pool.query(`
						UPDATE evidence_vectors
						SET metadata = $1::jsonb
						WHERE evidence_id = $2 AND chunk_index = $3
					`, [JSON.stringify(meta), evId, u.chunkIndex]);
				}

				// 8. Update Qdrant payload (batch setPayload by section type)
				const byType = {};
				for (const u of updates) {
					if (!byType[u.sectionType]) byType[u.sectionType] = [];
					byType[u.sectionType].push(u.chunkIndex);
				}

				for (const [sType, chunkIndexes] of Object.entries(byType)) {
					try {
						await qdrant.setPayload(QDRANT_COLLECTION, {
							payload: { section_type: sType },
							filter: {
								must: [
									{ key: 'evidence_id', match: { value: evId } },
									{ key: 'chunk_index', match: { any: chunkIndexes } },
								],
							},
						});
					} catch (err) {
						console.warn(`[backfill] Qdrant setPayload failed for ${evId} [${sType}]:`, err.message);
					}
				}

				totalUpdated += updates.length;
				console.log(`[backfill] ${evId}: updated ${updates.length}/${chunks.length} chunks (${langExtractWorked ? 'LangExtract' : 'heuristic'})`);
			} catch (err) {
				totalFailed++;
				console.error(`[backfill] Failed for ${evId}:`, err.message);
			}
		}

		console.log(`[backfill] Progress: ${Math.min(i + BATCH_SIZE, evidenceIds.length)}/${evidenceIds.length} (updated=${totalUpdated}, failed=${totalFailed}, skipped=${totalSkipped})`);
	}

	console.log(`\n[backfill] Complete! Updated=${totalUpdated} chunks, Failed=${totalFailed} evidence items, Skipped=${totalSkipped}`);
	await pool.end();
}

main().catch((err) => {
	console.error('[backfill] Fatal error:', err);
	process.exit(1);
});
