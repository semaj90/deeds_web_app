import type { PageServerLoad } from './$types';

interface ClusterCard {
    id: string; name: string;
    cluster_id: string; errorCode: string;
    count: number; top_files: string[];
    top_messages: string[]; representative_errors: string[];
    summary: string; fix_suggestion: string;
    surface: string[]; tech: string[];
    coordinates: {x: number; y: number } | null;
    runId: string; timestamp: string;
}

interface QdrantPoint {
    id: number; payload: ClusterCard;
}

interface QdrantScrollResponse {
    result: {points: QdrantPoint[];
    };
}

export const load: PageServerLoad = async ({ params, fetch }) => {
    const clusterId = params.id;

    try {
        // Fetch cluster details
        const clusterResponse = await fetch('http://localhost:6333/collections/phase90_error_clusters/points/scroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({limit: 200,
                with_payload: true,
                filter: {must: [
                        { key: 'cluster_id', match: {value: clusterId } }
                    ]
                }
            })
        });

        if (!clusterResponse.ok) {
            throw new Error(`Failed to fetch cluster: ${clusterResponse.status}`);
        }

        const clusterData: QdrantScrollResponse = await clusterResponse.json();
        const cluster = clusterData.result.points[0]?.payload ?? null;

        // Fetch member errors
        const membersResponse = await fetch('http://localhost:6333/collections/phase90_error_cards/points/scroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({limit: 100,
                with_payload: true,
                filter: {must: [
                        { key: 'clusterId', match: {value: clusterId } }
                    ]
                }
            })
        });

        let members: Array<Record<string, unknown>> = [];
        if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            members = membersData.result.points.map((p: QdrantPoint) => p.payload);
        }

        return {
            cluster,
            members,
            clusterId
        };
    } catch (error) {
        console.error('Failed to load cluster:', error);
        return {
            cluster: null,
            members: [],
            clusterId,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};
