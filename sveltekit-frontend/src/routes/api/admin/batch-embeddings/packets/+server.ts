import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Fetch packets needing embeddings
		const packets = await db
			.select({
				packet_key: atlasPackets.packet_key,
				feature_label: atlasPackets.feature_label,
				summary: atlasPackets.summary,
			})
			.from(atlasPackets)
			.where((t) => t.feature_label !== null)
			.limit(5000);

		return json(packets);
	} catch (err) {
		console.error('Error fetching packets:', err);
		return json({ packets: [] });
	}
};
