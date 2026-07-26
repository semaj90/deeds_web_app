import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);

	try {
		// Fetch packets needing embeddings
		const packets = await db
			.select({
				packet_key: atlasPackets.packetKey,
				feature_label: atlasPackets.featureLabel,
				summary: atlasPackets.summary,
			})
			.from(atlasPackets)
			.where((t) => t.featureLabel !== null)
			.limit(5000);

		return json(packets);
	} catch (err) {
		console.error('Error fetching packets:', err);
		return json({ packets: [] });
	}
};
