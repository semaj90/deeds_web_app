/**
 * Codebase Knowledge Graph API
 * Endpoint: GET /api/codebase-index/graph
 * Purpose: Generate graph data for D3/Obsidian visualization
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL = ENV.QDRANT_URL;
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
	degraded: boolean;
	error: { code: string } | null;
	stats: {
		totalFiles: number;
		totalChunks: number;
		totalDirs: number;
		importEdges: number;
		extensionBreakdown: Record<string, number>;
		domainBreakdown: Record<string, number>;
		scannedPoints: number;
		skippedInvalidPayload: number;
		skippedMissingFilePath: number;
		skippedOutOfScope: number;
		skippedFileLimit: number;
		truncatedContentFiles: number;
		pagesFetched: number;
		upstreamResponseBytes: number;
		truncated: boolean;
	};
}

type GraphCounters = GraphData['stats'];

interface QdrantScrollResponse {
	result?: {
		points?: unknown[];
		next_page_offset?: unknown;
	};
}

interface QdrantPoint {
	id?: string | number;
	payload?: unknown;
}

interface FileInfo {
	chunks: number;
	extension?: string;
	domain?: string;
}

const DEFAULT_MAX_FILES = 200;
const MAX_MAX_FILES = 500;
const DEFAULT_MAX_POINTS = 1000;
const MAX_MAX_POINTS = 5000;
const QDRANT_PAGE_SIZE = 100;
const MAX_QDRANT_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_CONTENT_CHARS = 64_000;

class GraphRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string
	) {
		super(code);
	}
}

function emptyCounters(): GraphCounters {
	return {
		totalFiles: 0,
		totalChunks: 0,
		totalDirs: 0,
		importEdges: 0,
		extensionBreakdown: {},
		domainBreakdown: {},
		scannedPoints: 0,
		skippedInvalidPayload: 0,
		skippedMissingFilePath: 0,
		skippedOutOfScope: 0,
		skippedFileLimit: 0,
		truncatedContentFiles: 0,
		pagesFetched: 0,
		upstreamResponseBytes: 0,
		truncated: false
	};
}

function emptyGraphData(counters: GraphCounters, errorCode: string | null): GraphData {
	return {
		nodes: [],
		edges: [],
		degraded: errorCode !== null,
		error: errorCode ? { code: errorCode } : null,
		stats: counters
	};
}

function parseBoundedInteger(value: string | null, fallback: number, maximum: number): number | null {
	if (value === null) return fallback;
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const parsed = Number(trimmed);
	if (!Number.isSafeInteger(parsed)) return null;
	return Math.max(1, Math.min(parsed, maximum));
}

function normalizeDirectory(value: string | null): string | null | undefined {
	if (value === null || value.trim() === '') return null;
	const normalized = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
	const segments = normalized.split('/');
	if (
		normalized.startsWith('/') ||
		/^[a-zA-Z]:/.test(normalized) ||
		segments.some((segment) => segment === '.' || segment === '..' || segment === '')
	) {
		return undefined;
	}
	return normalized;
}

function isInDirectory(filePath: string, directory: string | null): boolean {
	return directory === null || filePath === directory || filePath.startsWith(`${directory}/`);
}

async function readBoundedResponseText(response: Response): Promise<{ text: string; bytes: number }> {
	if (!response.body) return { text: '', bytes: 0 };
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > MAX_QDRANT_RESPONSE_BYTES) {
			await reader.cancel();
			throw new GraphRequestError(502, 'QDRANT_RESPONSE_TOO_LARGE');
		}
		chunks.push(decoder.decode(value, { stream: true }));
	}
	chunks.push(decoder.decode());
	return { text: chunks.join(''), bytes: totalBytes };
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
	const counters = emptyCounters();
	if (!locals.user?.id) {
		return json(emptyGraphData(counters, 'GRAPH_UNAUTHORIZED'), { status: 401 });
	}

	const maxFiles = parseBoundedInteger(url.searchParams.get('maxFiles'), DEFAULT_MAX_FILES, MAX_MAX_FILES);
	const maxPoints = parseBoundedInteger(
		url.searchParams.get('maxPoints') ?? url.searchParams.get('limit'),
		DEFAULT_MAX_POINTS,
		MAX_MAX_POINTS
	);
	const directory = normalizeDirectory(url.searchParams.get('dir'));
	if (maxFiles === null || maxPoints === null || directory === undefined) {
		return json(emptyGraphData(counters, 'GRAPH_INVALID_QUERY'), { status: 400 });
	}

	const includeImports = url.searchParams.get('includeImports') !== 'false';
	const fileMap = new Map<string, FileInfo>();
	const fileContent = new Map<string, string>();
	const dirMap = new Map<string, Set<string>>();
	const extensionCount: Record<string, number> = {};
	const domainCount: Record<string, number> = {};

	try {
		let offset: string | number | undefined;
		let hasMore = true;
		while (hasMore && counters.scannedPoints < maxPoints && fileMap.size < maxFiles) {
			const pageLimit = Math.min(QDRANT_PAGE_SIZE, maxPoints - counters.scannedPoints);
			const requestBody: Record<string, unknown> = {
				limit: pageLimit,
				with_payload: includeImports
					? ['file_path', 'extension', 'domain', 'content']
					: ['file_path', 'extension', 'domain'],
				with_vector: false
			};
			if (offset !== undefined) requestBody.offset = offset;

			const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
				signal: AbortSignal.timeout(30_000)
			});
			counters.pagesFetched++;
			if (!response.ok) throw new GraphRequestError(502, 'QDRANT_UPSTREAM_FAILED');

			const boundedResponse = await readBoundedResponseText(response);
			counters.upstreamResponseBytes += boundedResponse.bytes;
			const data = fastJsonParse<QdrantScrollResponse>(boundedResponse.text);
			const points = Array.isArray(data.result?.points) ? data.result.points : [];
			counters.scannedPoints += points.length;

			for (const rawPoint of points) {
				if (typeof rawPoint !== 'object' || rawPoint === null || Array.isArray(rawPoint)) {
					counters.skippedInvalidPayload++;
					continue;
				}
				const payload = (rawPoint as QdrantPoint).payload;
				if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
					counters.skippedInvalidPayload++;
					continue;
				}
				const fields = payload as Record<string, unknown>;
				if (typeof fields.file_path !== 'string' || fields.file_path.trim() === '') {
					counters.skippedMissingFilePath++;
					continue;
				}
				const filePath = fields.file_path.trim().replace(/\\/g, '/');
				if (!isInDirectory(filePath, directory)) {
					counters.skippedOutOfScope++;
					continue;
				}
				if (!fileMap.has(filePath) && fileMap.size >= maxFiles) {
					counters.skippedFileLimit++;
					counters.truncated = true;
					continue;
				}

				const extension = typeof fields.extension === 'string' ? fields.extension : undefined;
				const domain = typeof fields.domain === 'string' ? fields.domain : undefined;
				const content = typeof fields.content === 'string' ? fields.content : undefined;
				const existing = fileMap.get(filePath);
				if (existing) existing.chunks++;
				else fileMap.set(filePath, { chunks: 1, extension, domain });
				counters.totalChunks++;

				if (content !== undefined && !fileContent.has(filePath)) {
					if (content.length > MAX_IMPORT_CONTENT_CHARS) counters.truncatedContentFiles++;
					fileContent.set(filePath, content.slice(0, MAX_IMPORT_CONTENT_CHARS));
				}

				const parts = filePath.split('/');
				for (let i = 1; i < parts.length; i++) {
					const dirPath = parts.slice(0, i).join('/');
					if (!dirMap.has(dirPath)) dirMap.set(dirPath, new Set());
					if (i === parts.length - 1) dirMap.get(dirPath)!.add(filePath);
				}

				const extensionKey = extension || 'unknown';
				extensionCount[extensionKey] = (extensionCount[extensionKey] || 0) + 1;
				if (domain) domainCount[domain] = (domainCount[domain] || 0) + 1;
			}

			const nextOffset = data.result?.next_page_offset;
			hasMore = (typeof nextOffset === 'string' || typeof nextOffset === 'number') && points.length > 0;
			if (hasMore) offset = nextOffset as string | number;
			if (fileMap.size >= maxFiles && hasMore) counters.truncated = true;
		}
		if (counters.scannedPoints >= maxPoints && hasMore) counters.truncated = true;

		counters.totalFiles = fileMap.size;
		counters.totalDirs = dirMap.size;
		counters.extensionBreakdown = extensionCount;
		counters.domainBreakdown = domainCount;

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
			stats: counters,
			degraded: counters.truncated,
			error: null
		};
		counters.importEdges = importEdgeCount;

		return json(graphData);
	} catch (error) {
		console.error('Failed to generate graph data:', error);
		const failure = error instanceof GraphRequestError ? error : new GraphRequestError(500, 'GRAPH_GENERATION_FAILED');
		return json(emptyGraphData(counters, failure.code), { status: failure.status });
	}
};
