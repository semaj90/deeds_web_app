/**
 * /api/obsidian — Obsidian Vault Integration
 *
 * GET:  Check Obsidian availability + list vault structure
 * POST: Read/write/search/export operations
 *
 * Body (POST): {
 *   action: 'read' | 'write' | 'append' | 'search' | 'export-case' | 'import-research',
 *   path?: string,
 *   content?: string,
 *   query?: string,
 *   folder?: string,
 *   caseTitle?: string,
 *   analysis?: object
 * }
 *
 * Requires: OBSIDIAN_URL + OBSIDIAN_API_KEY in .env
 * Plugin: obsidian-local-rest-api (https://github.com/coddingtonbear/obsidian-local-rest-api)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	isObsidianAvailable,
	readNote,
	writeNote,
	appendToNote,
	searchNotes,
	listFolder,
	exportCaseToObsidian,
	importResearchNotes,
} from '$lib/server/integrations/obsidian-client.js';

const postSchema = z.object({
	action: z.enum(['read', 'write', 'append', 'search', 'export-case', 'import-research', 'list']),
	path: z.string().max(500).optional(),
	content: z.string().max(100_000).optional(),
	query: z.string().max(1000).optional(),
	folder: z.string().max(500).optional(),
	caseTitle: z.string().max(200).optional(),
	analysis: z.record(z.string(), z.unknown()).optional(),
});

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
    const available = await isObsidianAvailable();

    return json({
      obsidian: {
        available,
        plugin: 'obsidian-local-rest-api',
        actions: ['read', 'write', 'append', 'search', 'export-case', 'import-research', 'list'],
      },
    });
  } catch {
    return json({
      obsidian: {
        available: false,
        plugin: 'obsidian-local-rest-api',
        actions: ['read', 'write', 'append', 'search', 'export-case', 'import-research', 'list'],
      },
    });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const parsed = postSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { action, path, content, query, folder, caseTitle, analysis } = parsed.data;

	const available = await isObsidianAvailable();
	if (!available) {
		return json({
			error: 'Obsidian not available. Ensure the app is running with Local REST API plugin enabled.',
			setup: {
				plugin: 'https://github.com/coddingtonbear/obsidian-local-rest-api',
				env: 'Set OBSIDIAN_URL and OBSIDIAN_API_KEY in .env',
			},
		}, { status: 503 });
	}

	try {
		switch (action) {
			case 'read': {
				if (!path) return json({ error: 'path required' }, { status: 400 });
				const note = await readNote(path);
				return json({ success: !!note, note });
			}

			case 'write': {
				if (!path || !content) return json({ error: 'path and content required' }, { status: 400 });
				const ok = await writeNote(path, content);
				return json({ success: ok });
			}

			case 'append': {
				if (!path || !content) return json({ error: 'path and content required' }, { status: 400 });
				const ok = await appendToNote(path, content);
				return json({ success: ok });
			}

			case 'search': {
				if (!query) return json({ error: 'query required' }, { status: 400 });
				const results = await searchNotes(query);
				return json({ success: true, results, count: results.length });
			}

			case 'list': {
				const files = await listFolder(folder ?? '');
				return json({ success: true, files, count: files.length });
			}

			case 'export-case': {
				if (!caseTitle) return json({ error: 'caseTitle required' }, { status: 400 });
				const ok = await exportCaseToObsidian(caseTitle, analysis as Record<string, unknown> ?? {});
				return json({ success: ok, path: `Legal AI/Cases/${caseTitle}.md` });
			}

			case 'import-research': {
				if (!folder) return json({ error: 'folder required' }, { status: 400 });
				const notes = await importResearchNotes(folder);
				return json({ success: true, notes: notes.length, imported: notes.map((n) => n.title) });
			}

			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (err) {
		console.error('[/api/obsidian] Failed:', (err as Error)?.message);
		return json({ error: 'Obsidian operation failed' }, { status: 500 });
	}
};
