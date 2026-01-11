import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
    try {
        // Test Qdrant connection
        const response = await fetch('http://localhost:6333/collections/fastmcp_file_profiles');

        if (!response.ok) {
            return json({
                status: 'error',
                message: 'Qdrant not reachable',
                qdrant: false
            });
        }

        const data = await response.json();

        // Get error cards count
        let errorCardsCount = 0;
        try {
            const errorsResponse = await fetch('http://localhost:6333/collections/phase90_error_cards');
            if (errorsResponse.ok) {
                const errData = await errorsResponse.json();
                errorCardsCount = errData.result?.points_count || 0;
            }
        } catch {}

        // Get clusters count
        let clustersCount = 0;
        try {
            const clustersResponse = await fetch('http://localhost:6333/collections/phase90_error_clusters');
            if (clustersResponse.ok) {
                const clData = await clustersResponse.json();
                clustersCount = clData.result?.points_count || 0;
            }
        } catch {}

        return json({
            status: 'ok',
            qdrant: true,
            collections: {, fastmcp_file_profiles: data.result?.points_count || 0,
                phase90_error_cards: errorCardsCount,
                phase90_error_clusters: clustersCount
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            qdrant: false
        });
    }
};
