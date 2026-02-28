import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';

/**
 * GET /api/qlora/generate?caseId=xxx&limit=100
 * Generates JSONL training data from evidence analysis results.
 * Format: tool-calling JSONL compatible with Unsloth QLoRA trainer.
 */
export const GET: RequestHandler = async ({ url }) => {
	const caseId = url.searchParams.get('caseId');
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);

	try {
		const rows = await db.execute(sql`
			SELECT e.id, e.title, e.evidence_type, e.file_name,
				e.metadata->>'summary' as summary,
				e.metadata->'entities' as entities,
				e.metadata->'forensicFlags' as forensic_flags,
				e.metadata->>'refinedEvidenceType' as refined_type
			FROM evidence e
			WHERE e.metadata IS NOT NULL
			${caseId ? sql`AND e.case_id = ${caseId}` : sql``}
			ORDER BY e.uploaded_at DESC
			LIMIT ${limit}
		`);

		const records = [...(rows as any)] as any[];
		const jsonlLines: string[] = [];

		for (const rec of records) {
			if (!rec.summary || rec.summary.length < 20) continue;

			const entities = typeof rec.entities === 'string' ? JSON.parse(rec.entities) : (rec.entities ?? []);
			const flags = typeof rec.forensic_flags === 'string' ? JSON.parse(rec.forensic_flags) : (rec.forensic_flags ?? []);

			// Format 1: Analysis Q&A pair
			const analysisMsg: any = {
				messages: [
					{ role: 'system', content: 'You are a legal evidence analysis AI. Analyze evidence and provide structured findings.' },
					{ role: 'user', content: `Analyze this ${rec.evidence_type ?? 'document'} evidence: "${rec.title ?? rec.file_name}"` },
					{ role: 'assistant', content: rec.summary }
				]
			};
			if (entities.length > 0) {
				analysisMsg.messages[2].tool_calls = [{
					name: 'extract_entities',
					arguments: { entities: entities.slice(0, 10).map((e: any) => ({ label: e.label, text: e.text, type: e.type })) }
				}];
			}
			jsonlLines.push(JSON.stringify(analysisMsg));

			// Format 2: Forensic detection pair (only if flags exist)
			if (flags.length > 0) {
				jsonlLines.push(JSON.stringify({
					messages: [
						{ role: 'system', content: 'You are a forensic analysis AI. Detect patterns and flag concerns in legal evidence.' },
						{ role: 'user', content: `Run forensic analysis on evidence "${rec.title ?? rec.file_name}" (type: ${rec.refined_type ?? rec.evidence_type ?? 'document'})` },
						{ role: 'assistant', content: `Found ${flags.length} forensic indicators.`, tool_calls: [{
							name: 'detect_forensic_patterns',
							arguments: { flags: flags.slice(0, 5) }
						}] }
					]
				}));
			}
		}

		if (jsonlLines.length === 0) {
			return json({ error: 'No evidence with analysis metadata found', recordsScanned: records.length }, { status: 404 });
		}

		return new Response(jsonlLines.join('\n'), {
			headers: {
				'Content-Type': 'application/jsonl',
				'Content-Disposition': `attachment; filename="qlora-training-${Date.now()}.jsonl"`,
			}
		});
	} catch (err) {
		console.error('[QLoRA] Dataset generation failed:', err);
		return json({ error: 'Dataset generation failed' }, { status: 500 });
	}
};
