/**
 * CHR-ROM97 Cartridge Cache Stats API
 *
 * GET → Returns Redis cartridge cache statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCartridgeCacheStats } from '$lib/server/cache/cartridge-tensor-bridge.js';

export const GET: RequestHandler = async () => {
	try {
		const stats = await getCartridgeCacheStats();
		return json({
			...stats,
			totalSizeMB: +(stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return json({ error: `Stats query failed: ${msg}` }, { status: 500 });
	}
};
