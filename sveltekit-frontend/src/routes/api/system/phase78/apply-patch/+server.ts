import { db } from '$lib/server/db/client';
import { errorSuggestionsTable } from '$lib/server/db/schema/index.js';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const applyPatchSchema = z.object({
	suggestionId: z.string().min(1, 'Missing suggestionId parameter').max(500)
});

/**
 * Phase 78 Auto-Patch Application API
 *
 * Applies AI-generated TypeScript patches to source files
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized - Authentication required');
	}

	try {
		const raw = await request.json();
		const parsed = applyPatchSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Missing suggestionId parameter');
		}
		const { suggestionId } = parsed.data;

		// 1. Fetch the suggestion from database
		const [suggestion] = await db
			.select()
			.from(errorSuggestionsTable)
			.where(eq(errorSuggestionsTable.id, suggestionId))
			.limit(1);

		if (!suggestion) {
			throw error(404, 'Suggestion not found');
		}

		if (suggestion.applied) {
			return json({
				success: false,
				message: 'Patch already applied',
			});
		}

		// 2. Parse the route path to determine file location
		const routePath = suggestion.routePath;
		const filePath = routePathToFile(routePath);

		// 3. Read current file content
		let fileContent: string;
		try {
			fileContent = await readFile(filePath, 'utf-8');
		} catch (err) {
			throw error(500, 'Failed to read file: ' + filePath);
		}

		// 4. Create backup
		const backupPath = filePath + '.phase78.backup';
		await writeFile(backupPath, fileContent, 'utf-8');

		// 5. Extract and apply the patch
		const patchCode = extractPatchCode(suggestion.patch);

		if (!patchCode) {
			throw error(400, 'Invalid patch format - no code block found');
		}

		// 6. Apply the patch
		const patchedContent = applyPatch(fileContent, patchCode, suggestion);

		// 7. Write patched content
		await writeFile(filePath, patchedContent, 'utf-8');

		// 8. Mark as applied in database
		await db
			.update(errorSuggestionsTable)
			.set({
				applied: true,
			})
			.where(eq(errorSuggestionsTable.id, suggestionId));

		return json({
			success: true,
			message: 'Patch applied successfully',
			filePath: backupPath,
		});

	} catch (err) {
		console.error('Phase 78 Patch Application Error:', err);

		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, 'Failed to apply patch');
	}
};

/**
 * Convert route path to file system path
 */
function routePathToFile(routePath: string): string {
	const cleanPath = routePath.startsWith('/') ? routePath.slice(1) : routePath;
	const srcPath = join(process.cwd(), 'src', 'routes', cleanPath);
	return srcPath + '/+page.svelte';
}

/**
 * Extract code from patch (handles code blocks)
 */
function extractPatchCode(patch: string): string | null {
	const codeBlockMatch = patch.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)\n```/);

	if (codeBlockMatch) {
		return codeBlockMatch[1].trim();
	}

	const afterMatch = patch.match(/\/\/ AFTER:\s*\n([\s\S]*?)(?=\n\/\/|$)/);
	if (afterMatch) {
		return afterMatch[1].trim();
	}

	return patch.trim();
}

/**
 * Apply patch to file content
 */
function applyPatch(
	originalContent: string,
	patchCode: string,
	suggestion: typeof errorSuggestionsTable.$inferSelect
): string {
	const timestamp = new Date().toISOString();

	const lines = [
		'',
		'// ═══════════════════════════════════════════════════════════════',
		'// Phase 78 AI-Applied Patch',
		'// Risk Level: ' + (suggestion.riskLevel || 'unknown'),
		'// Applied: ' + timestamp,
		'// Suggestion: ' + (suggestion.summary || ''),
		'// ═══════════════════════════════════════════════════════════════',
		'',
		patchCode,
		'',
		'// ═══════════════════════════════════════════════════════════════',
	];
	const patchComment = lines.join('\n');

	if (originalContent.includes('</script>')) {
		return originalContent.replace('</script>', patchComment + '\n</script>');
	}

	return originalContent + '\n' + patchComment;
}
