import { getCollections } from '$lib/server/qdrant-http';

export async function load() {
	try {
		const collections = await getCollections();

		return {
			collections,
			stats: {
				totalCollections: collections.length,
				timestamp: new Date().toISOString()
			}
		};
	} catch (error) {
		console.error('Failed to load collections:', error);
		return {
			collections: [],
			stats: {
				totalCollections: 0,
				timestamp: new Date().toISOString()
			}
		};
	}
};
