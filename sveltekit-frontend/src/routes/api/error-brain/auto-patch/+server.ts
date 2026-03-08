import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';

const ALLOWED_ROOT = resolve('src');

interface PatchAttempt {
	attempt: number;
	fixGenerated: boolean;
	fixApplied: boolean;
	verified: boolean;
	error?: string;
}

/**
 * POST /api/error-brain/auto-patch
 * Orchestration loop: generate fix → apply → verify → retry/rollback.
 *
 * Body: { filePath, errorMessage, originalCode?, maxAttempts? (default 2) }
 * Returns: { success, attempts: PatchAttempt[], fixApplied, rollback }
 *
 * Safety:
 * - Backs up original file before any modification
 * - Rollback on failure after max attempts
 * - Only writes under sveltekit-frontend/src/
 */
export const POST: RequestHandler = async ({ request, url, fetch: svelteKitFetch }) => {
	const body = await request.json();
	const filePath: string = body?.filePath ?? '';
	const errorMessage: string = body?.errorMessage ?? '';
	const maxAttempts: number = Math.min(body?.maxAttempts ?? 2, 5);

	if (!filePath || !errorMessage) {
		return json({ success: false, error: 'Missing filePath or errorMessage' }, { status: 400 });
	}

	// Safety: restrict to sveltekit-frontend/src/
	const absPath = resolve(filePath);
	if (!normalize(absPath).startsWith(ALLOWED_ROOT)) {
		return json({ success: false, error: 'Path outside allowed root' }, { status: 403 });
	}

	// Read original file for backup
	let backupContent: string;
	try {
		backupContent = await readFile(absPath, 'utf-8');
	} catch {
		return json({ success: false, error: `Cannot read file: ${filePath}` }, { status: 404 });
	}

	const attempts: PatchAttempt[] = [];
	let lastFixId = '';
	let currentErrorMessage = errorMessage;
	let originalCode = body?.originalCode ?? '';

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const result: PatchAttempt = {
			attempt,
			fixGenerated: false,
			fixApplied: false,
			verified: false,
		};

		// Step 1: Generate fix
		try {
			const genRes = await svelteKitFetch('/api/error-brain/generate-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					errorMessage: currentErrorMessage,
					originalCode: originalCode || backupContent.slice(0, 4000),
				}),
			});

			if (!genRes.ok) {
				result.error = `Generate fix returned ${genRes.status}`;
				attempts.push(result);
				continue;
			}

			const genData = await genRes.json();
			if (!genData.success || !genData.fix?.fixedCode) {
				result.error = 'Fix generation failed or returned empty';
				attempts.push(result);
				continue;
			}

			result.fixGenerated = true;
			const fixedCode = genData.fix.fixedCode;

			// Step 2: Apply fix (with dryRun=false)
			const applyRes = await svelteKitFetch('/api/error-brain/apply-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					fixedCode,
					originalCode: originalCode || undefined,
					explanation: genData.fix.explanation ?? '',
					confidence: genData.fix.confidence ?? 0,
					dryRun: false,
				}),
			});

			if (!applyRes.ok) {
				result.error = `Apply fix returned ${applyRes.status}`;
				attempts.push(result);
				continue;
			}

			const applyData = await applyRes.json();
			if (!applyData.success) {
				result.error = applyData.error ?? 'Apply fix failed';
				attempts.push(result);
				continue;
			}

			result.fixApplied = true;
			lastFixId = applyData.fixId ?? '';

			// Step 3: Verify fix
			const verifyRes = await svelteKitFetch('/api/error-brain/verify-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					fixId: lastFixId,
				}),
			});

			if (verifyRes.ok) {
				const verifyData = await verifyRes.json();
				result.verified = verifyData.verified === true;

				if (result.verified) {
					attempts.push(result);
					return json({
						success: true,
						attempts,
						fixApplied: true,
						fixId: lastFixId,
						rollback: false,
						message: `Fix verified on attempt ${attempt}`,
					});
				}

				// Not verified — update error context for retry
				currentErrorMessage = verifyData.errors?.join('\n') || errorMessage;
				result.error = `Verification failed: ${verifyData.errors?.length ?? 0} errors remain`;
			} else {
				result.error = 'Verification endpoint failed';
			}

			attempts.push(result);
		} catch (err) {
			result.error = (err as Error).message;
			attempts.push(result);
		}
	}

	// All attempts exhausted — rollback
	try {
		await writeFile(absPath, backupContent, 'utf-8');
	} catch (rollbackErr) {
		console.error('[auto-patch] Rollback failed:', (rollbackErr as Error).message);
		return json({
			success: false,
			attempts,
			fixApplied: false,
			rollback: false,
			rollbackError: (rollbackErr as Error).message,
			message: 'All attempts failed and rollback also failed',
		});
	}

	return json({
		success: false,
		attempts,
		fixApplied: false,
		rollback: true,
		message: `All ${maxAttempts} attempts failed — original file restored`,
	});
};
