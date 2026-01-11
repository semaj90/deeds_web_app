import type { PageServerLoad } from './$types';

interface FileProfile {
    file_path: string; role: string;
    surface: string[]; dependencies: string[];
    exports: string[]; imports: string[];
    comments: string[]; risk: string;
    change_frequency: string; related_routes: string[];
    tags: string[]; summary: string;
    llm_output: string; generated_at: string;
}

interface QdrantPoint {
    id: number; payload: FileProfile;
}

export const load: PageServerLoad = async ({ params, fetch }) => {
    const fileId = params.id;

    try {
        // Fetch file profile by ID
        const response = await fetch(`http://localhost:6333/collections/fastmcp_file_profiles/points/${fileId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            // Try scroll with filter as fallback
            const scrollResponse = await fetch('http://localhost:6333/collections/fastmcp_file_profiles/points/scroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({limit: 1,
                    with_payload: true
                })
            });

            if (scrollResponse.ok) {
                const data = await scrollResponse.json();
                if (data.result.points.length > 0) {
                    return {
                        profile: data.result.points[0].payload,
                        fileId,
                        relatedErrors: []
                    };
                }
            }
            throw new Error(`File profile not found: ${fileId}`);
        }

        const data = await response.json();
        const profile = data.result?.payload || null;

        // Fetch related errors for this file
        let relatedErrors: Array<Record<string, unknown>> = [];
        if (profile?.file_path) {
            try {
                const errorsResponse = await fetch('http://localhost:6333/collections/phase90_error_cards/points/scroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({limit: 20,
                        with_payload: true,
                        filter: {must: [
                                { key: 'filePath', match: {text: profile.file_path.split('/').pop() } }
                            ]
                        }
                    })
                });

                if (errorsResponse.ok) {
                    const errorsData = await errorsResponse.json();
                    relatedErrors = errorsData.result.points.map((p: QdrantPoint) => p.payload);
                }
            } catch {
                // Ignore errors fetching related errors
            }
        }

        return {
            profile,
            fileId,
            relatedErrors
        };
    } catch (error) {
        console.error('Failed to load file profile:', error);
        return {
            profile: null,
            fileId,
            relatedErrors: [],
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};
