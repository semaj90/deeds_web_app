/**
 * Codebase Dependency Graph API
 *
 * GET /api/codebase-index/graph
 *
 * Uses a worker thread to run ts-morph AST extraction off the main event loop.
 * Returns a dependency graph (nodes + edges) for D3 visualization.
 *
 * Query params:
 *   ?maxFiles=200   — limit number of files scanned (default 200)
 *   ?dir=routes/api  — restrict scan to a subdirectory under src/
 *   ?worker=true     — use worker thread (default true)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Worker } from 'worker_threads';
import { resolve, relative, basename, dirname, extname } from 'path';
import { readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { setCache, cognitiveCache } from '$lib/server/cache.js';

interface GraphNode {
	id: string;
	label: string;
	type: 'route' | 'component' | 'store' | 'service' | 'api' | 'util';
	errorCount: number;
	filePath: string;
	cluster?: string;
	imports?: string[];
	exports?: string[];
	functions?: string[];
	lineCount?: number;
	fileSize?: number;
	complexity?: number;
	classCount?: number;
	importCount?: number;
	exportCount?: number;
}

interface GraphEdge {
	source: string;
	target: string;
	type: 'import' | 'export' | 'dependency';
}

const SRC_ROOT = resolve(process.cwd(), 'src');

/**
 * Run AST graph extraction in a worker thread.
 * Falls back to inline execution if the worker fails to spawn.
 */
function runInWorker(scanDir: string, maxFiles: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; metadata: Record<string, unknown> }> {
	return new Promise((resolve, reject) => {
		const workerPath = new URL('../../../../lib/workers/ast-graph-worker.mjs', import.meta.url).pathname
			// Fix Windows paths: /C:/foo → C:/foo
			.replace(/^\/([A-Z]:)/, '$1');

		let worker: Worker;
		try {
			worker = new Worker(workerPath);
		} catch {
			// Worker failed — reject so caller can fall back to inline
			reject(new Error('Worker spawn failed'));
			return;
		}

		const taskId = Date.now();
		const timeout = setTimeout(() => {
			worker.terminate();
			reject(new Error('Worker timeout (30s)'));
		}, 30_000);

		worker.on('message', (msg: { taskId: number; result?: unknown; error?: string }) => {
			clearTimeout(timeout);
			worker.terminate();
			if (msg.error) reject(new Error(msg.error));
			else resolve(msg.result as any);
		});

		worker.on('error', (err) => {
			clearTimeout(timeout);
			worker.terminate();
			reject(err);
		});

		worker.postMessage({
			taskId,
			type: 'ast-graph',
			payload: { scanDir, srcRoot: SRC_ROOT, maxFiles }
		});
	});
}

// ── Inline fallback (same logic, runs on main thread) ──────

function classifyFile(relPath: string): GraphNode['type'] {
	if (relPath.includes('/routes/api/') || relPath.includes('+server.ts')) return 'api';
	if (relPath.includes('/routes/')) return 'route';
	if (relPath.includes('/stores/') || relPath.includes('.svelte.ts')) return 'store';
	if (relPath.includes('/components/')) return 'component';
	if (relPath.includes('/server/') || relPath.includes('/services/')) return 'service';
	return 'util';
}

function deriveCluster(relPath: string): string {
	if (relPath.startsWith('routes/api/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `api-${parts[2]}` : 'api';
	}
	if (relPath.startsWith('routes/(app)/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `app-${parts[2]}` : 'app';
	}
	if (relPath.startsWith('routes/')) return 'routes';
	if (relPath.startsWith('lib/components/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `comp-${parts[2]}` : 'components';
	}
	if (relPath.startsWith('lib/stores/')) return 'stores';
	if (relPath.startsWith('lib/server/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `server-${parts[2]}` : 'server';
	}
	if (relPath.startsWith('lib/ai/')) return 'ai';
	return 'lib';
}

function collectFiles(dir: string, maxFiles: number): string[] {
	const files: string[] = [];
	function walk(d: string) {
		if (files.length >= maxFiles) return;
		let entries: string[];
		try { entries = readdirSync(d); } catch { return; }
		for (const entry of entries) {
			if (files.length >= maxFiles) return;
			const full = resolve(d, entry);
			let st;
			try { st = statSync(full); } catch { continue; }
			if (st.isDirectory()) {
				if (['node_modules', '.svelte-kit', 'deeds_labs', 'static', 'build', 'services'].includes(entry)) continue;
				walk(full);
			} else {
				const ext = extname(entry);
				if (['.ts', '.js', '.mts'].includes(ext) && !entry.endsWith('.d.ts')) {
					files.push(full);
				}
			}
		}
	}
	walk(dir);
	return files;
}

function resolveImportPath(importSpec: string, fromFile: string): string | null {
	if (importSpec.startsWith('$lib/')) return 'lib/' + importSpec.slice(5).replace(/\.js$/, '');
	if (importSpec.startsWith('$') || importSpec.startsWith('@')) return null;
	if (importSpec.startsWith('.')) {
		const fromDir = dirname(relative(SRC_ROOT, fromFile));
		const resolved = resolve(SRC_ROOT, fromDir, importSpec).replace(/\.js$/, '');
		const rel = relative(SRC_ROOT, resolved).replace(/\\/g, '/');
		if (rel.startsWith('..')) return null;
		return rel;
	}
	return null;
}

async function buildGraphInline(scanDir: string, maxFiles: number) {
	const startMs = Date.now();
	const { Project, SyntaxKind } = await import('ts-morph');

	const filePaths = collectFiles(scanDir, maxFiles);
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true }
	});

	const nodeMap = new Map<string, GraphNode>();
	const edges: GraphEdge[] = [];

	for (const fp of filePaths) {
		let sourceFile;
		try { sourceFile = project.addSourceFileAtPath(fp); } catch { continue; }

		const relPath = relative(SRC_ROOT, fp).replace(/\\/g, '/');
		const nodeId = relPath.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_-]/g, '_');

		const exportNames: string[] = [];
		for (const fn of sourceFile.getFunctions()) {
			if (fn.isExported()) exportNames.push(fn.getName() ?? '');
		}
		for (const cls of sourceFile.getClasses()) {
			if (cls.isExported()) exportNames.push(cls.getName() ?? '');
		}
		for (const vd of sourceFile.getVariableDeclarations()) {
			const stmt = vd.getFirstAncestorByKind(SyntaxKind.VariableStatement);
			if (stmt?.isExported()) exportNames.push(vd.getName());
		}

		const funcNames: string[] = [];
		for (const fn of sourceFile.getFunctions()) {
			const name = fn.getName();
			if (name) funcNames.push(name);
		}

		const importPaths: string[] = [];
		for (const imp of sourceFile.getImportDeclarations()) {
			importPaths.push(imp.getModuleSpecifierValue());
		}

		// Compute richer metadata
		const fullText = sourceFile.getFullText();
		const lineCount = fullText.split('\n').length;
		const fileSize = fullText.length;
		const branchKeywords = fullText.match(/\b(if|else|for|while|switch|case|catch|&&|\|\||\?)\b/g);
		const complexity = branchKeywords ? branchKeywords.length : 0;
		const classCount = sourceFile.getClasses().length;

		nodeMap.set(relPath, {
			id: nodeId,
			label: basename(fp),
			type: classifyFile(relPath),
			errorCount: 0,
			filePath: 'src/' + relPath,
			cluster: deriveCluster(relPath),
			imports: importPaths.slice(0, 20),
			exports: exportNames.filter(Boolean).slice(0, 20),
			functions: funcNames.slice(0, 20),
			lineCount,
			fileSize,
			complexity,
			classCount,
			importCount: importPaths.length,
			exportCount: exportNames.filter(Boolean).length,
		});

		for (const spec of importPaths) {
			const targetRel = resolveImportPath(spec, fp);
			if (!targetRel) continue;
			const candidates = [targetRel, targetRel + '.ts', targetRel + '/index.ts', targetRel + '/+server.ts', targetRel + '/+page.server.ts'];
			for (const cand of candidates) {
				if (nodeMap.has(cand) || filePaths.some(f => relative(SRC_ROOT, f).replace(/\\/g, '/') === cand)) {
					const targetId = cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_-]/g, '_');
					edges.push({ source: nodeId, target: targetId, type: 'import' });
					break;
				}
			}
		}

		try { project.removeSourceFile(sourceFile); } catch { /* ok */ }
	}

	const nodes = Array.from(nodeMap.values());
	const edgeSet = new Set<string>();
	const uniqueEdges = edges.filter(e => {
		const key = `${e.source}→${e.target}`;
		if (edgeSet.has(key)) return false;
		edgeSet.add(key);
		return true;
	});
	const nodeIds = new Set(nodes.map(n => n.id));
	const validEdges = uniqueEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

	return {
		nodes,
		edges: validEdges,
		metadata: {
			totalNodes: nodes.length,
			totalEdges: validEdges.length,
			nodesWithErrors: 0,
			scanTimeMs: Date.now() - startMs,
			maxFiles,
			generatedAt: new Date().toISOString()
		}
	};
}

// ── Handler ──────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const maxFiles = Math.min(parseInt(url.searchParams.get('maxFiles') || '200'), 500);
	const subdir = url.searchParams.get('dir') || '';
	const useWorker = url.searchParams.get('worker') !== 'false';

	const scanDir = subdir ? resolve(SRC_ROOT, subdir) : SRC_ROOT;
	if (!scanDir.startsWith(SRC_ROOT)) {
		return json({ error: 'Invalid directory' }, { status: 400 });
	}

	const GRAPH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
	const cacheKey = `ast:graph:${createHash('sha256').update(`${scanDir}:${maxFiles}`).digest('hex').slice(0, 16)}`;

	// Check cache first
	const cached = await cognitiveCache.getJsonbDocument<{ nodes: GraphNode[]; edges: GraphEdge[]; metadata: Record<string, unknown> }>(cacheKey);
	if (cached) {
		return json({ ...cached, cached: true });
	}

	try {
		let result;

		if (useWorker) {
			try {
				result = await runInWorker(scanDir, maxFiles);
			} catch (workerErr) {
				console.warn('Worker failed, falling back to inline:', workerErr);
				result = await buildGraphInline(scanDir, maxFiles);
			}
		} else {
			result = await buildGraphInline(scanDir, maxFiles);
		}

		// Store in cache
		await setCache(cacheKey, result, GRAPH_CACHE_TTL_MS);

		return json(result);
	} catch (error) {
		console.error('Error building graph:', error);
		return json(
			{ error: 'Failed to build graph', nodes: [], edges: [] },
			{ status: 500 }
		);
	}
};
