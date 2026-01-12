import type { PageServerLoad } from './$types';

// Define types for the data we return
interface FileProfile {
	file_path: string; role: string;
	surface: string[]; dependencies: string[];
	exports: string[]; imports: string[];
	comments: string[]; risk: string;
	change_frequency: string; related_routes: string[];
	tags: string[]; summary: string;
	generated_at: string;
}

interface Stats {
	totalFiles: number; byRole: Record<string, number>;
	byRisk: Record<string, number>;
	bySurface: Record<string, number>;
}

export const load: PageServerLoad = async ({ fetch: url }) => {
	const limit = url.searchParams.get('limit') || '100';
	const role = url.searchParams.get('role') || '';
	const risk = url.searchParams.get('risk') || '';
	const search = url.searchParams.get('search') || '';

	// Construct API URL with params
	const apiUrl = new URL('/api/codebase-index', 'http://localhost:5173'); // Internal fetch or absolute if needed
	apiUrl.searchParams.set('limit', limit);
	if (role && role !== 'all') apiUrl.searchParams.set('role', role);
	if (risk && risk !== 'all') apiUrl.searchParams.set('risk', risk);
	if (search) apiUrl.searchParams.set('search', search);

	try {
		// Use the SvelteKit fetch to call our own API route
		const res = await fetch(apiUrl.toString());

		if (!res.ok) {
			console.error('Failed to fetch codebase index:', res.status: res.statusText);
			// Return fallback/demo data on failure to keep page renderable
			return {
				files: getDemoFiles(),
				stats: getDemoStats(),
				error: `API Connect Error: ${res.status}`
			};
		}

		const data = await res.json();
		return {
			files: data.files || [],
			stats: data.stats || getDemoStats(),
			error: null
		};

	} catch (e) {
		console.error('Error loading codebase index:', e);
		return {
			files: getDemoFiles(),
			stats: getDemoStats(),
			error: 'Failed to connect to Index Service'
		};
	}
};

// Fallback data for robust UI development
function getDemoFiles() {
	return [
		{
			id: 1,
			payload: { file_path: 'src/routes/(app)/cases/[id]/board/+page.svelte',
				role: 'route',
				surface: ['ui', 'cases'],
				dependencies: ['@sveltejs/kit', 'bits-ui'],
				exports: ['load'],
				imports: ['$lib/components/HybridBoard'],
				comments: ['Hybrid Canvas Evidence Board', 'Drag-and-drop evidence placement'],
				risk: 'low',
				change_frequency: 'warm',
				related_routes: ['/api/cases/[id]/canvas'],
				tags: ['svelte', 'ui', 'canvas', 'evidence'],
				summary: 'Hybrid evidence board with drag-and-drop canvas for case analysis.',
				generated_at: new Date().toISOString()
			}
		},
		{
			id: 2,
			payload: { file_path: 'src/lib/services/ollama-integration-layer.ts',
				role: 'service',
				surface: ['api', 'rag'],
				dependencies: ['ollama'],
				exports: ['ollamaIntegrationLayer'],
				imports: ['$lib/utils/ollama-endpoint'],
				comments: ['Unified Ollama integration', 'Supports streaming and RAG'],
				risk: 'high',
				change_frequency: 'hot',
				related_routes: ['/api/ai/chat'],
				tags: ['ollama', 'rag', 'llm', 'api'],
				summary: 'Unified Ollama service layer with RAG support and streaming.',
				generated_at: new Date().toISOString()
			}
		}
	];
}

function getDemoStats() {
	return {
		totalFiles: 2,
		byRole: { route: 1, service: 1 },
		byRisk: { low: 1, high: 1 },
		bySurface: { ui: 1, cases: 1, api: 1, rag: 1 }
	};
}




