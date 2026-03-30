/**
 * Backfill embeddings for diagnosis events that lack queryEmbedding.
 *
 * POST /api/error-brain/diagnosis-history/backfill
 *   → Generates embeddings for rows missing queryEmbedding + upserts to Qdrant
 *   → Also re-infers probableRootCauseType for rows stuck on 'unknown'
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { diagnosisEvents } from '$lib/server/db/schema-postgres.js';
import { eq, isNull, sql } from 'drizzle-orm';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';

function inferRootCause(diagnosis: string, query: string): string {
	const text = `${diagnosis} ${query}`.toLowerCase();
	// SSR/hydration first — window/document not defined, SSR mismatch
	if (/window is not defined|document is not defined|ssr.*mismatch|hydrat|server.*client.*mismatch/.test(text)) return 'hydration-mismatch';
	if (/cannot find module|module not found|missing.*import|resolve.*import|no such module/.test(text)) return 'missing-import';
	if (/api.*contract|endpoint.*mismatch|response.*schema|fetch.*fail/.test(text)) return 'bad-api-contract';
	if (/auth|unauthorized|401|forbidden|403|login.*fail|session.*expir/.test(text)) return 'auth-guard';
	if (/schema.*mismatch|column.*not|table.*not|drizzle|migration|pgvector/.test(text)) return 'schema-mismatch';
	if (/type\s*error|typeerror|cannot read prop|undefined is not|null is not/.test(text)) return 'type-error';
	if (/runtime.*error|uncaught|unhandled.*reject|exception.*thrown/.test(text)) return 'runtime-exception';
	if (/config.*error|env.*missing|environment.*variable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modulesvariable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modulesvariable|\.env/.test(text)) return 'config-error';
	if (/depend.*conflict|version.*mismatch|peer.*dep|node_modules/.test(text)) return 'dependency-issue';
	return 'unknown';
}

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		// Find rows missing embeddings
		const rows = await db
			.select({
				id: diagnosisEvents.id,
				query: diagnosisEvents.query,
				diagnosis: diagnosisEvents.diagnosis,
				routePath: diagnosisEvents.routePath,
				probableRootCauseType: diagnosisEvents.probableRootCauseType,
				riskLevel: diagnosisEvents.riskLevel,
			})
			.from(diagnosisEvents)
			.where(isNull(diagnosisEvents.queryEmbedding))
			.limit(50);

		let succeeded = 0;
		let failed = 0;
		const details: { id: string; status: string; newRootCause?: string }[] = [];

		for (const row of rows) {
			try {
				const embeddingText = `${row.query} ${(row.diagnosis ?? '').slice(0, 500)}`;
				const embedding = await generateSingleEmbedding(embeddingText);

				if (!embedding || embedding.length !== 768) {
					details.push({ id: row.id, status: 'skip-no-embedding' });
					failed++;
					continue;
				}

				// Re-infer rootCause if stuck on 'unknown'
				const newRootCause = row.probableRootCauseType === 'unknown'
					? inferRootCause(row.diagnosis ?? '', row.query)
					: row.probableRootCauseType;

				// Update PostgreSQL row with embedding + possibly new rootCause
				const updates: Record<string, unknown> = {
					queryEmbedding: sql`${JSON.stringify(embedding)}::vector`,
				};
				if (newRootCause !== row.probableRootCauseType) {
					updates.probableRootCauseType = newRootCause;
				}
				await db.update(diagnosisEvents).set(updates).where(eq(diagnosisEvents.id, row.id));

				// Upsert to Qdrant
				const pointId = deterministicPointId(`diagnosis:${row.id}`);
				await qdrant.batchUpsert({
					collection: 'diagnosis_embeddings',
					points: [{
						id: pointId,
						vector: { diagnosis: embedding },
						payload: {
							diagnosisId: row.id,
							rootCauseType: newRootCause ?? 'unknown',
							routePath: row.routePath ?? '',
							riskLevel: row.riskLevel ?? 'medium',
							query: row.query.slice(0, 300),
						},
					}],
				});

				succeeded++;
				details.push({
					id: row.id,
					status: 'ok',
					...(newRootCause !== row.probableRootCauseType ? { newRootCause } : {}),
				});
			} catch (e) {
				failed++;
				details.push({ id: row.id, status: `error: ${(e as Error).message.slice(0, 100)}` });
			}
		}

		// Second pass: re-infer rootCauseType for rows that already have embeddings but are 'unknown'
		let reclassified = 0;
		const unknownRows = await db
			.select({
				id: diagnosisEvents.id,
				query: diagnosisEvents.query,
				diagnosis: diagnosisEvents.diagnosis,
				probableRootCauseType: diagnosisEvents.probableRootCauseType,
			})
			.from(diagnosisEvents)
			.where(eq(diagnosisEvents.probableRootCauseType, 'unknown'))
			.limit(50);

		for (const row of unknownRows) {
			const newCause = inferRootCause(row.diagnosis ?? '', row.query);
			if (newCause !== 'unknown') {
				await db.update(diagnosisEvents).set({ probableRootCauseType: newCause }).where(eq(diagnosisEvents.id, row.id));
				reclassified++;
				details.push({ id: row.id, status: 'reclassified', newRootCause: newCause });
			}
		}

		// Third pass: clean up diagnosis fields that contain raw JSON strings
		let cleaned = 0;
		const jsonRows = await db
			.select({
				id: diagnosisEvents.id,
				diagnosis: diagnosisEvents.diagnosis,
			})
			.from(diagnosisEvents)
			.where(sql`diagnosis LIKE '{%'`)
			.limit(50);

		for (const row of jsonRows) {
			const raw = row.diagnosis ?? '';
			let cleanText = '';

			// Try parsing as valid JSON first
			try {
				const obj = JSON.parse(raw) as Record<string, unknown>;
				if (typeof obj.diagnosis === 'string' && obj.diagnosis.length > 20) {
					cleanText = obj.diagnosis;
				} else if (obj.diagnosis && typeof obj.diagnosis === 'object') {
					const d = obj.diagnosis as Record<string, unknown>;
					cleanText = [d.root_cause, d.description, d.summary, d.impact, d.severity]
						.filter(Boolean).map(String).join('. ');
				} else {
					const candidates = [obj.root_cause, obj.description, obj.explanation,
						obj.summary, obj.impact, obj.severity, obj.fix, obj.solution, obj.error, obj.query];
					cleanText = candidates.filter(v => typeof v === 'string' && (v as string).length > 5).map(String).join('. ');
					// Generic fallback: recursively extract all string values
					if (cleanText.length < 20) {
						const extractStrings = (o: unknown): string[] => {
							if (typeof o === 'string' && o.length > 10) return [o];
							if (o && typeof o === 'object') return Object.values(o as Record<string, unknown>).flatMap(extractStrings);
							return [];
						};
						cleanText = extractStrings(obj).join('. ').slice(0, 1500);
					}
				}
			} catch {
				// JSON truncated — extract all quoted string values > 15 chars
				const allStrings = [...raw.matchAll(/"[^"]*"\s*:\s*"([^"]{15,})"/g)].map(m => m[1]);
				cleanText = allStrings.join('. ');
			}

			if (cleanText && cleanText.length > 20 && cleanText !== raw) {
				await db.update(diagnosisEvents).set({ diagnosis: cleanText.slice(0, 2000) }).where(eq(diagnosisEvents.id, row.id));
				// Also update Qdrant payload so similarity search returns clean text
				try {
					const pointId = deterministicPointId(`diagnosis:${row.id}`);
					await qdrant.client.setPayload('diagnosis_embeddings', {
						payload: { diagnosis: cleanText.slice(0, 500) },
						points: [pointId],
					});
				} catch { /* Qdrant sync optional */ }
				cleaned++;
				details.push({ id: row.id, status: 'cleaned-diagnosis' });
			}
		}

		// Fourth pass: sync Qdrant payloads with current DB diagnosis text
		let synced = 0;
		try {
			// Get all points from Qdrant and update payloads with latest DB data
			const scrollResult = await qdrant.client.scroll('diagnosis_embeddings', {
				limit: 100,
				with_payload: true,
			});
			// Build lookup of DB rows by diagnosis text (first 50 chars) for matching
			const allDbRows = await db
				.select({
					id: diagnosisEvents.id,
					diagnosis: diagnosisEvents.diagnosis,
					probableRootCauseType: diagnosisEvents.probableRootCauseType,
					routePath: diagnosisEvents.routePath,
					riskLevel: diagnosisEvents.riskLevel,
					query: diagnosisEvents.query,
				})
				.from(diagnosisEvents)
				.limit(100);

			for (const point of scrollResult.points) {
				const payload = (point.payload ?? {}) as Record<string, unknown>;
				const existingDiag = String(payload.diagnosis ?? '');
				// Skip already clean payloads
				if (existingDiag.length > 20 && !existingDiag.startsWith('{')) continue;

				// Find matching DB row by routePath + fuzzy query match
				const routePath = String(payload.routePath ?? '');
				const match = allDbRows.find(r =>
					(r.routePath ?? '') === routePath &&
					(r.diagnosis ?? '').length > 20 &&
					!(r.diagnosis ?? '').startsWith('{')
				) || allDbRows.find(r =>
					(r.diagnosis ?? '').length > 20 &&
					!(r.diagnosis ?? '').startsWith('{')
				);

				if (match) {
					await qdrant.client.setPayload('diagnosis_embeddings', {
						payload: {
							diagnosis: (match.diagnosis ?? '').slice(0, 500),
							rootCauseType: match.probableRootCauseType ?? 'unknown',
							routePath: match.routePath ?? '',
							riskLevel: match.riskLevel ?? 'medium',
						},
						points: [point.id as number],
					});
					synced++;
				}
			}
		} catch { /* Qdrant sync optional */ }

		return json({ backfilled: succeeded, reclassified, cleaned, synced, failed, total: rows.length, details });
	} catch (e) {
		console.warn('[backfill] Error:', (e as Error).message);
		return json({ error: 'Backfill failed' }, { status: 500 });
	}
};
