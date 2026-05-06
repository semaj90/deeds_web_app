/**
 * GET  /api/wiki/watch  — watcher status
 * POST /api/wiki/watch  — start watcher
 * DELETE /api/wiki/watch — stop watcher
 *
 * Requires: OBSIDIAN_VAULT_PATH env var pointing to the vault root on disk.
 * The watcher watches karpathy-wiki/ (glob **\/*.md) and ingests any file edited
 * directly in Obsidian desktop back into CouchDB + Redis.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import {
	startWatcher,
	stopWatcher,
	getWatcherStatus,
} from '$lib/server/obsidian/wiki-vault-watcher.js';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	return json(getWatcherStatus());
};

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	if (!ENV.OBSIDIAN_VAULT_PATH) {
		return json(
			{
				error: 'OBSIDIAN_VAULT_PATH not configured',
				hint: 'Add OBSIDIAN_VAULT_PATH=C:/path/to/vault to .env.development.local',
			},
			{ status: 503 },
		);
	}

	const result = await startWatcher();
	const status = getWatcherStatus();
	return json({ ...result, ...status }, { status: result.ok ? 200 : 503 });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await stopWatcher();
	return json({ stopped: true, ...getWatcherStatus() });
};