import { json } from '@sveltejs/kit';
import { getQdrantUrl, getCudaServiceUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

// Phase 89: Components API Endpoint
// Returns component analysis data with CrewAI agentic metadata

interface ComponentUnit { unit_id: string, file_path: string;
	component_name: string, unit_kind: string;
	route_id?: string; feature_tags: string[];
	uses: string[], children: string[];
	imports_count: number, exports_count: number;
	error_count: number, last_modified: string;
	indexed_at: string, signature_text: string;
	diff_status: 'clean' | 'modified' | 'new' | 'deleted';
}

export const GET: RequestHandler = async ({ fetch }) => {
	try {
		const qdrantBaseUrl = getQdrantUrl();

		// Fetch from Qdrant phase89_code_units collection
		const qdrantResponse = await fetch(`${qdrantBaseUrl}/collections/phase89_code_units/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 500,
				with_payload: true,
				with_vector: false
			})
		});

		let components: ComponentUnit[] = [];
		let totalErrors = 0;

		if (qdrantResponse.ok) {
			const data = await qdrantResponse.json();
			const points = data.result?.points ?? [];

			components = points.map((point: Record<string, unknown>) => {
				const payload = (point?.payload ?? {}) as Record<string, unknown>;
				const errorCount = Number(payload?.error_count ?? 0);
				totalErrors += errorCount;

				return {
					unit_id: point.id,
					file_path: String(payload?.file_path ?? ''),
					component_name: String(payload?.component_name || payload?.module_name || extractName(String(payload?.file_path ?? ''))),
					unit_kind: String(payload?.unit_kind ?? 'component'),
					route_id: payload?.route_id ? String(payload.route_id) : null,
					feature_tags: (payload?.feature_tags as string[]) || [],
					uses: (payload?.uses as string[]) || [],
					children: (payload?.children as string[]) || [],
					imports_count: Number(payload?.imports_count ?? 0),
					exports_count: Number(payload?.exports_count ?? 0),
					error_count: errorCount,
					last_modified: String(payload?.last_modified || payload?.indexed_at || new Date().toISOString()),
					indexed_at: String(payload?.indexed_at || new Date().toISOString()),
					signature_text: String(payload?.signature_text ?? ''),
					diff_status: determineDiffStatus(payload)
				};
			});
		}

		// Get CUDA status
		let cudaEnabled = false;
		const CUDA_SERVICE_URL = getCudaServiceUrl();
		try {
			const gpuCheck = await fetch(`${CUDA_SERVICE_URL}/health`).catch(() => null);
			if (gpuCheck?.ok) {
				const health = await gpuCheck.json();
				cudaEnabled = health.cuda_enabled ?? false;
			}
		} catch {
			// Ignore
		}

		return json({ components, stats: { totalComponents: components.length,
				totalErrors,
				totalFiles: new Set(components.map(c => c.file_path)).size,
				lastIndexed: components[0]?.indexed_at ?? '',
				cudaEnabled
			}
		});
	} catch (error) {
		console.error('Components API error:', error);
		return json({
			components: [],
			stats: { totalComponents: 0,
				totalErrors: 0,
				totalFiles: 0,
				lastIndexed: '',
				cudaEnabled: false
			},
			error: 'Component analysis failed'
		}, { status: 500 });
	}
};

function extractName(filePath: string): string {
	if (!filePath) return 'Unknown';
	const parts = filePath.split(/[/\\]/);
	const fileName = parts[parts.length - 1];
	return fileName.replace(/\.(svelte|ts|js|mjs)$/, '');
}

function determineDiffStatus(payload: Record<string, unknown>): 'clean' | 'modified' | 'new' | 'deleted' {
	const indexedAt = payload.indexed_at ? new Date(String(payload.indexed_at)) : null;
	const lastModified = payload.last_modified ? new Date(String(payload.last_modified)) : null;

	if (!indexedAt) return 'new';
	if (!lastModified) return 'clean';

	// If modified after indexed, mark as modified
	if (lastModified > indexedAt) return 'modified';

	return 'clean';
}




