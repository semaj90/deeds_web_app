import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { z } from 'zod';

const applyFixSchema = z.object({
	filePath: z.string().min(1, 'Missing filePath').max(1000),
	fixedCode: z.string().min(1, 'Missing fixedCode').max(5_000_000),
	originalCode: z.string().max(5_000_000).optional(),
	dryRun: z.boolean().optional().default(true),
	explanation: z.string().max(10000).optional(),
	confidence: z.number().min(0).max(1).optional(),
	sourceIds: z.array(z.string().max(200)).max(50).optional(),
	errorContext: z.record(z.string(), z.unknown()).optional(),
	userApproved: z.boolean().optional(),
	success: z.boolean().optional()
});

const ALLOWED_ROOT = resolve('src');

/**
 * POST /api/error-brain/apply-fix
 * Record provenance + optionally write the fix to disk.
 *
 * Body: { filePath, fixedCode, originalCode?, dryRun? (default true), ... }
 * When dryRun=false: reads file, replaces originalCode→fixedCode, writes back.
 * Safety: only allows writes under sveltekit-frontend/src/
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const raw = await request.json();
	const parsed = applyFixSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
	}
	const body = parsed.data;

	const dryRun = body.dryRun; // schema defaults to true
	const fixId = crypto.randomUUID();
	let fileWritten = false;
	let backupContent: string | null = null;

	// If not dry run, apply the fix to disk
	if (!dryRun) {
		const absPath = resolve(body.filePath);
		const normalizedPath = normalize(absPath);

		// Safety: restrict writes to sveltekit-frontend/src/
		if (!normalizedPath.startsWith(ALLOWED_ROOT)) {
			return json({ success: false, error: `Path outside allowed root: ${normalizedPath}` }, { status: 403 });
		}

		try {
			// Read current file content as backup
			backupContent = await readFile(absPath, 'utf-8');

			// Apply fix: if originalCode provided, replace it; otherwise overwrite entire file
			let newContent: string;
			if (body.originalCode && backupContent.includes(body.originalCode)) {
				newContent = backupContent.replace(body.originalCode, body.fixedCode);
			} else {
				// Full file replacement
				newContent = body.fixedCode;
			}

			await writeFile(absPath, newContent, 'utf-8');
			fileWritten = true;
		} catch (writeErr) {
			console.error('[error-brain/apply-fix] File write failed:', (writeErr as Error).message);
			return json({
				success: false,
				fixId,
				error: `File write failed: ${(writeErr as Error).message}`,
				dryRun,
			}, { status: 500 });
		}
	}

	// Record provenance in database
	try {
		await insertProvenance(fixId, body, locals.user.id);

		return json({
			success: true,
			fixId,
			message: dryRun ? 'Fix provenance recorded (dry run — file not modified)' : 'Fix applied and provenance recorded',
			dryRun,
			fileWritten,
			appliedBy: locals.user.id,
			appliedAt: new Date().toISOString(),
			backup: fileWritten ? true : undefined,
		}, { status: 201 });
	} catch (e) {
		// Table might not exist yet — create it on first use
		if ((e as Error).message?.includes('kb_provenance_graph')) {
			try {
				await createProvenanceTable();
				await insertProvenance(fixId, body, locals.user.id);
				return json({
					success: true,
					fixId,
					message: dryRun ? 'Provenance recorded (table auto-created, dry run)' : 'Fix applied, provenance recorded (table auto-created)',
					dryRun,
					fileWritten,
				}, { status: 201 });
			} catch (e2) {
				console.error('[error-brain/apply-fix] Table creation failed:', (e2 as Error).message);
			}
		}
		console.error('[error-brain/apply-fix]', (e as Error).message);
		// Still return success if file was written but DB failed
		if (fileWritten) {
			return json({
				success: true,
				fixId,
				message: 'Fix applied to file, but provenance recording failed',
				dryRun,
				fileWritten,
				provenanceError: (e as Error).message,
			}, { status: 201 });
		}
		return json({ success: false, error: 'Failed to record fix provenance' }, { status: 500 });
	}
};

async function insertProvenance(fixId: string, body: Record<string, unknown>, userId: string) {
	await db.execute(sql`
		INSERT INTO kb_provenance_graph (
			fix_id, file_path, error_context, original_code, fixed_code,
			explanation, source_ids, confidence, applied_by, user_approved, success
		) VALUES (
			${fixId},
			${body.filePath as string},
			${JSON.stringify(body.errorContext ?? {})}::jsonb,
			${(body.originalCode as string) ?? ''},
			${body.fixedCode as string},
			${(body.explanation as string) ?? ''},
			${sql.raw(`ARRAY[${((body.sourceIds ?? []) as string[]).map((s: string) => `'${s.replace(/'/g, "''")}'`).join(',')}]::text[]`)},
			${(body.confidence as number) ?? 0},
			${userId},
			${(body.userApproved as boolean) ?? false},
			${(body.success as boolean) ?? null}
		)
	`);
}

async function createProvenanceTable() {
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
}
