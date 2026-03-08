import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

const execAsync = promisify(exec);

/**
 * POST /api/error-brain/verify-fix
 * Run svelte-check on the project and check if a specific file has errors.
 *
 * Body: { filePath: string, fixId?: string }
 * Returns: { verified: boolean, errors: string[], fixId }
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const filePath: string = body?.filePath ?? '';
	const fixId: string = body?.fixId ?? '';

	if (!filePath) {
		return json({ verified: false, errors: ['Missing filePath'], fixId }, { status: 400 });
	}

	try {
		// Run svelte-check and capture output (allow non-zero exit)
		const { stdout, stderr } = await execAsync(
			'npx svelte-check --tsconfig tsconfig.json 2>&1',
			{
				cwd: process.cwd(),
				timeout: 120_000,
				env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
			}
		).catch((err) => ({
			stdout: (err as { stdout?: string }).stdout ?? '',
			stderr: (err as { stderr?: string }).stderr ?? '',
		}));

		const output = stdout + '\n' + stderr;

		// Normalize path for matching (forward slashes)
		const normalizedTarget = filePath.replace(/\\/g, '/');

		// Find errors in the target file
		const lines = output.split('\n');
		const fileErrors: string[] = [];

		for (const line of lines) {
			const normalizedLine = line.replace(/\\/g, '/');
			if (normalizedLine.includes(normalizedTarget) && /Error/i.test(line)) {
				fileErrors.push(line.trim());
			}
		}

		// Check for overall error count
		const summaryMatch = output.match(/found (\d+) errors?/i);
		const totalErrors = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;

		const verified = fileErrors.length === 0;

		// Record verification result if fixId provided
		if (fixId) {
			try {
				await db.execute(sql`
					UPDATE kb_provenance_graph
					SET success = ${verified}
					WHERE fix_id = ${fixId}
				`);
			} catch {
				// Non-fatal — verification result is still returned
			}
		}

		return json({
			verified,
			errors: fileErrors,
			fixId: fixId || undefined,
			totalProjectErrors: totalErrors,
			filePath,
			checkedAt: new Date().toISOString(),
		});
	} catch (err) {
		console.error('[error-brain/verify-fix] Check failed:', (err as Error).message);
		return json({
			verified: false,
			errors: [`Verification failed: ${(err as Error).message}`],
			fixId: fixId || undefined,
			filePath,
		}, { status: 500 });
	}
};
