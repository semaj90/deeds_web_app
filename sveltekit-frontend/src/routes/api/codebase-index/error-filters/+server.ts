/**
 * ═══════════════════════════════════════════════════════════════════════
 * Codebase Index Error Filters API
 * ═══════════════════════════════════════════════════════════════════════
 * Task: 13.1 - Create admin route structure
 * Endpoint: GET /api/codebase-index/error-filters
 * Purpose: Get available filter options for error cards
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const QDRANT_URL = process.env?.QDRANT_URL?? 'http://localhost:6333';
const ERROR_CARDS_COLLECTION = 'phase90_error_cards';

export const GET: RequestHandler = async () => {
	try {$1;$2			`${QDRANT_URL}/collections/${ERROR_CARDS_COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit: 10000,
					with_payload: true,
					with_vector: false
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Qdrant error: ${response.status}`);
		}

		const data = await response.json();
		const points = data.result?.points ?? [];

		// Extract unique values
		const errorCodes = new Set<string>();
		const surfaces = new Set<string>();
		const techs = new Set<string>();

		points.forEach((p: { payload: { errorCode?: string, surface?: string[], tech?: string[] } }) => {
			if (p.payload?.errorCode) {
				errorCodes.add(p.payload.errorCode);
			}
			(p.payload?.surface ?? []).forEach((s: string) => surfaces.add(s));
			(p.payload?.tech ?? []).forEach((t: string) => techs.add(t));
		});

		return json({
			errorCodes: Array.from(errorCodes).sort(),
			surfaces: Array.from(surfaces).sort(),
			techs: Array.from(techs).sort()
		});
	} catch (error) {
		console.error('Failed to get filter options:', error);
		return json(
			{ errorCodes: [], surfaces: [], techs: [], error: 'Failed to fetch filters' },
			{ status: 500 }
		);
	}
};



