/**
 * Codebase Knowledge Graph API
 * Endpoint: GET /api/codebase-index/graph
 * Purpose: Generate graph data for D3/Obsidian visualization
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantUrl } from '$lib/config/env.server.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

const QDRANT_URL = getQdrantUrl();
const COLLECTION = 'codebase_chunks_768';

interface GraphNode {
	id: string;
	label: string;
	type: 'file' | 'directory';
	path: string;
	extension?: string;
	size: number;
	domain?: string;
	complexity?: string;
	group: number;
}

interface GraphEdge {
	source: string;
	target: string;
	type: 'contains' | 'imports' | 'exports';
	weight: number;
}

interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	stats: {
		totalFiles: number;
		totalChunks: number;
		totalDirs: number;
		importEdges: number;
		extensionBreakdown: Record<string, number>;
		domainBreakdown: Record<string, number>;
	};
}

// Helper: Extract imports from file content
function extractImports(content: string): string[] {
	const imports: string[] = [];

	// TypeScript/JavaScript imports: import ... from '...'
	const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
	let match;
	while ((match = importRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}

	// Dynamic imports: import('...')
	const dynamicRegex = /import\(['"](.*?)['"]\)/g;
	while ((match = dynamicRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}

	// CJS require: require('...')
	const requireRegex = /require\(['"](.*?)['"]\)/g;
	while ((match = requireRegex.exec(content)) !== null) {
		imports.push(match[1]);
	}

	return [...new Set(imports)]; // dedupe
}

// Helper: Resolve import path to absolute file path
function resolveImportPath(fromFile: string, importPath: string): string | null {
	// Skip external packages (node_modules)
	if (!importPath.startsWith('.') && !importPath.startsWith('$lib')) {
		return null;
	}

	// Handle $lib alias
	if (importPath.startsWith('$lib/')) {
		return importPath.replace('$lib/', 'src/lib/');
	}

	// Handle relative imports
	if (importPath.startsWith('./') || importPath.startsWith('../')) {
		const dir = fromFile.split('/').slice(0, -1).join('/');
		let resolved = `${dir}/${importPath}`;

		// Normalize path (remove ./ and ../)
		const parts = resolved.split('/');
		const normalized: string[] = [];
		for (const part of parts) {
			if (part === '..') {
				normalized.pop();
			} else if (part !== '.' && part !== '') {
				normalized.push(part);
			}
		}
		resolved = normalized.join('/');

		return resolved;
	}

	return null;
}

// Helper: Try to match import path to actual file (handles missing extensions)
function matchImportToFile(importPath: string, fileMap: Map<string, any>): string | null {
	// Try exact match first
	if (fileMap.has(importPath)) {
		return importPath;
	}

	// Try common extensions
	const extensions = ['.ts', '.js', '.svelte', '.mjs', '/index.ts', '/index.js'];
	for (const ext of extensions) {
		const withExt = importPath + ext;
		if (fileMap.has(withExt)) {
			return withExt;
		}
	}

	return null;
}

export const GET: RequestHandler = async ({ url, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = parseInt(url.searchParams.get('limit') || '5000');
	const includeImports = url.searchParams.get('includeImports') !== 'false'; // default true

	try {
		const response = await fetch(
			`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					limit,
					with_payload: true,
					with_vector: false
				}),
				signal: AbortSignal.timeout(30_000)
			}
		);

		if (!response.ok) {
			return json({ error: 'Failed to fetch codebase data' }, { status: 500 });
		}

		// GPU-accelerated JSON parsing via simdjson (5× faster for large responses)
		const rawText = await response.text();
		const data = fastJsonParse<{ result?: { points?: Array<{ payload: Record<string, unknown> }> } }>(rawText);
		const points = data.result?.points || [];

		// Build graph structures
		const fileMap = new Map();
		const fileContent = new Map(); // Store content for import extraction
		const dirMap = new Map();
		const extensionCount: Record<string, number> = {};
		const domainCount: Record<string, number> = {};

		for (const point of points) {
			const { file_path, extension, domain, content } = point.payload;

			if (!fileMap.has(file_path)) {
				fileMap.set(file_path, { chunks: 0, extension, domain });
				// Store first chunk's content for import extraction
				if (content && typeof content === 'string') {
					fileContent.set(file_path, content);
				}
			}
			fileMap.get(file_path).chunks++;

			const parts = file_path.split('/');
			for (let i = 1; i < parts.length; i++) {
				const dirPath = parts.slice(0, i).join('/');
				if (!dirMap.has(dirPath)) {
					dirMap.set(dirPath, new Set());
				}
				if (i === parts.length - 1) {
					dirMap.get(dirPath).add(file_path);
				}
			}

			extensionCount[extension] = (extensionCount[extension] || 0) + 1;
			if (domain) domainCount[domain] = (domainCount[domain] || 0) + 1;
		}

		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];
		let groupId = 0;
		const dirGroups = new Map();

		// Create directory nodes
		for (const [dirPath, files] of dirMap.entries()) {
			const parts = dirPath.split('/');
			const label = parts[parts.length - 1] || 'root';

			if (!dirGroups.has(parts[0])) {
				dirGroups.set(parts[0], groupId++);
			}

			nodes.push({
				id: `dir:${dirPath}`,
				label,
				type: 'directory',
				path: dirPath,
				size: files.size,
				group: dirGroups.get(parts[0])
			});

			if (parts.length > 1) {
				const parentPath = parts.slice(0, -1).join('/');
				edges.push({
					source: `dir:${parentPath}`,
					target: `dir:${dirPath}`,
					type: 'contains',
					weight: 1
				});
			}
		}

		// Create file nodes
		for (const [filePath, info] of fileMap.entries()) {
			const parts = filePath.split('/');
			const fileName = parts[parts.length - 1];
			const dirPath = parts.slice(0, -1).join('/');

			nodes.push({
				id: `file:${filePath}`,
				label: fileName,
				type: 'file',
				path: filePath,
				extension: info.extension,
				size: info.chunks,
				domain: info.domain,
				group: dirGroups.get(parts[0]) || 0
			});

			if (dirPath) {
				edges.push({
					source: `dir:${dirPath}`,
					target: `file:${filePath}`,
					type: 'contains',
					weight: info.chunks
				});
			}
		}

		// Extract import edges
		let importEdgeCount = 0;
		if (includeImports) {
			for (const [filePath, content] of fileContent.entries()) {
				const imports = extractImports(content);

				for (const importPath of imports) {
					const resolved = resolveImportPath(filePath, importPath);
					if (!resolved) continue; // Skip external packages

					const matched = matchImportToFile(resolved, fileMap);
					if (matched) {
						edges.push({
							source: `file:${filePath}`,
							target: `file:${matched}`,
							type: 'imports',
							weight: 1
						});
						importEdgeCount++;
					}
				}
			}
		}

		const graphData: GraphData = {
			nodes,
			edges,
			stats: {
				totalFiles: fileMap.size,
				totalChunks: points.length,
				totalDirs: dirMap.size,
				importEdges: importEdgeCount,
				extensionBreakdown: extensionCount,
				domainBreakdown: domainCount
			}
		};

		return json(graphData);
	} catch (error) {
		console.error('Failed to generate graph data:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
