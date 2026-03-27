/**
 * QLoRA Training Dataset Generator
 *
 * GET /api/qlora/generate?caseId=xxx&limit=100
 *
 * Generates JSONL training data compatible with deeds_labs/python-middleware/qlora_legal_training.py.
 * Two training formats per evidence record:
 *   1. Analysis Q&A: system + user question + assistant answer with entities tool_call
 *   2. Forensic detection: system + user prompt + assistant findings with forensic flags tool_call
 *
 * Returns: application/jsonl download (max 500 records)
 */

import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { sql, eq, and, isNotNull } from 'drizzle-orm';

const querySchema = z.object({
	caseId: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(500).default(100)
});

interface TrainingRecord {
	messages: Array<{
		role: 'system' | 'user' | 'assistant';
		content: string;
		tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
	}>;
}

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const { caseId, limit } = parsed.success ? parsed.data : { caseId: undefined, limit: 100 };

	try {
		// Query evidence with rich metadata (entities, summary, forensics)
		const conditions = [
			isNotNull(evidence.metadata),
			sql`${evidence.metadata}->>'summary' IS NOT NULL`,
			sql`jsonb_array_length(COALESCE(${evidence.metadata}->'entities', '[]'::jsonb)) > 0`
		];

		if (caseId) {
			conditions.push(eq(evidence.caseId, caseId));
		}

		const rows = await db
			.select({
				id: evidence.id,
				fileName: evidence.fileName,
				evidenceType: evidence.evidenceType,
				metadata: evidence.metadata
			})
			.from(evidence)
			.where(and(...conditions))
			.limit(limit);

		// Generate JSONL records (2 per evidence item: analysis + forensics)
		const records: TrainingRecord[] = [];

		for (const row of rows) {
			const metadata = (row.metadata ?? {}) as Record<string, unknown>;
			const entities = (metadata.entities as Record<string, unknown>[]) ?? [];
			const summary = String(metadata.summary ?? '');
			const forensicFlags = (metadata.forensicFlags as Record<string, unknown>[]) ?? [];
			const entityCount = Number(metadata.entityCount ?? 0);

			// Record 1: Analysis Q&A with entities tool_call
			records.push({
				messages: [
					{
						role: 'system',
						content: 'You are a legal AI assistant specialized in evidence analysis. Extract entities from legal documents using the extractEntities tool.'
					},
					{
						role: 'user',
						content: `Analyze this ${row.evidenceType} document: "${row.fileName}"\n\nSummary: ${summary.slice(0, 500)}`
					},
					{
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								id: `call_${row.id.slice(0, 8)}`,
								type: 'function',
								function: {
									name: 'extractEntities',
									arguments: JSON.stringify({
										document_id: row.id,
										entity_count: entityCount,
										entities: entities.slice(0, 20).map((e) => ({
											type: e.type,
											value: e.value,
											confidence: (e.confidence as number) ?? 0.9
										}))
									})
								}
							}
						]
					}
				]
			});

			// Record 2: Forensic detection with forensic flags tool_call
			if (forensicFlags.length > 0) {
				const highSeverity = forensicFlags.filter((f) => f.severity === 'high');
				records.push({
					messages: [
						{
							role: 'system',
							content: 'You are a legal AI assistant specialized in forensic pattern detection. Identify sensitive information and legal keywords using the detectForensicPatterns tool.'
						},
						{
							role: 'user',
							content: `Scan this ${row.evidenceType} for forensic patterns: "${row.fileName}"`
						},
						{
							role: 'assistant',
							content: '',
							tool_calls: [
								{
									id: `call_${row.id.slice(0, 8)}_forensic`,
									type: 'function',
									function: {
										name: 'detectForensicPatterns',
										arguments: JSON.stringify({
											document_id: row.id,
											total_flags: forensicFlags.length,
											high_severity_count: highSeverity.length,
											patterns: forensicFlags.slice(0, 15).map((f) => ({
												type: f.type,
												pattern: f.pattern,
												severity: f.severity,
												context: (f.context as string)?.slice(0, 100)
											}))
										})
									}
								}
							]
						}
					]
				});
			}
		}

		// Return as JSONL (newline-delimited JSON)
		const jsonl = records.map(r => JSON.stringify(r)).join('\n');

		return new Response(jsonl, {
			status: 200,
			headers: {
				'Content-Type': 'application/jsonl',
				'Content-Disposition': `attachment; filename="qlora_training_${caseId || 'all'}_${Date.now()}.jsonl"`,
				'X-Record-Count': records.length.toString(),
				'X-Evidence-Count': rows.length.toString()
			}
		});
	} catch (err) {
		console.error('[QLoRA Generate] Error:', err);
		throw error(500, `Failed to generate training dataset: ${(err as Error).message}`);
	}
};
