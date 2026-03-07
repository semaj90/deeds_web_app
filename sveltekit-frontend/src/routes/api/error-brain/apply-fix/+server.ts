import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * POST /api/error-brain/apply-fix
 * Record provenance: who applied what fix, from which sources, with what outcome
 * Does NOT modify files — that's the user/agent's job. This tracks the audit trail.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	if (!body?.filePath) throw error(400, 'Missing filePath');
	if (!body?.fixedCode) throw error(400, 'Missing fixedCode');

	const fixId = crypto.randomUUID();

	try {
		// Insert into kb_provenance_graph (created via manual migration if not exists)
		await db.execute(sql`
			INSERT INTO kb_provenance_graph (
				fix_id, file_path, error_context, original_code, fixed_code,
				explanation, source_ids, confidence, applied_by, user_approved, success
			) VALUES (
				${fixId},
				${body.filePath},
				${JSON.stringify(body.errorContext ?? {})}::jsonb,
				${body.originalCode ?? ''},
				${body.fixedCode},
				${body.explanation ?? ''},
				${sql.raw(`ARRAY[${(body.sourceIds ?? []).map((s: string) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)},
				${body.confidence ?? 0},
				${locals.user.id},
				${body.userApproved ?? false},
				${body.success ?? null}
			)
		`);

		return json({
			success: true,
			fixId,
			message: 'Fix provenance recorded',
			appliedBy: locals.user.id,
			appliedAt: new Date().toISOString(),
		}, { status: 201 });
	} catch (e) {
		// Table might not exist yet — create it on first use
		if ((e as Error).message?.includes('kb_provenance_graph')) {
			try {
				await db.execute(sql`
					CREATE TABLE IF NOT EXISTS kb_provenance_graph (
						fix_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						file_path TEXT NOT NULL,
						error_context JSONB DEFAULT '{}',
						original_code TEXT DEFAULT '',
						fixed_code TEXT NOT NULL,
						explanation TEXT DEFAULT '',
						source_ids TEXT[] DEFAULT '{}',
						confidence REAL DEFAULT 0,
						applied_at TIMESTAMPTZ DEFAULT NOW(),
						applied_by UUID,
						user_approved BOOLEAN DEFAULT FALSE,
						success BOOLEAN
					)
				`);
				// Retry the insert
				await db.execute(sql`
					INSERT INTO kb_provenance_graph (
						fix_id, file_path, error_context, original_code, fixed_code,
						explanation, source_ids, confidence, applied_by, user_approved, success
					) VALUES (
						${fixId},
						${body.filePath},
						${JSON.stringify(body.errorContext ?? {})}::jsonb,
						${body.originalCode ?? ''},
						${body.fixedCode},
						${body.explanation ?? ''},
						${sql.raw(`ARRAY[${(body.sourceIds ?? []).map((s: string) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)},
						${body.confidence ?? 0},
						${locals.user.id},
						${body.userApproved ?? false},
						${body.success ?? null}
					)
				`);
				return json({ success: true, fixId, message: 'Fix provenance recorded (table auto-created)' }, { status: 201 });
			} catch (e2) {
				console.error('[error-brain/apply-fix] Table creation failed:', (e2 as Error).message);
				throw error(500, 'Failed to record fix provenance');
			}
		}
		console.error('[error-brain/apply-fix]', (e as Error).message);
		throw error(500, 'Failed to record fix provenance');
	}
};
