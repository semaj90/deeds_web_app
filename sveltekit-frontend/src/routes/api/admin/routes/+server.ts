import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { getQdrantUrl } from '$lib/config/env.server.js';
import { pool as pgPool } from '$lib/server/db/client';

const QDRANT_URL = getQdrantUrl();

interface RouteInfo {
	id: string;
	path: string;
	type: string;
	errors: number;
	complexity: number;
	dependencies: string[];
	exports: string[];
	imports: string[];
	lines: number;
	functions: string[];
	kb_vectors: number;
	last_modified: string;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const srcPath = path.join(process.cwd(), 'src');
		const routes = await scanDirectory(srcPath);

		// Enrich with error data from PostgreSQL
		const errorResult = await pgPool.query(`
			SELECT
				file_path,
				COUNT(*) as error_count,
				MAX(metadata) as metadata
			FROM raw_error_embeddings
			WHERE source = 'svelte-check'
			GROUP BY file_path
		`);

		const errorMap = new Map<string, { errors: number; metadata: Record<string, unknown> }>();
		errorResult.rows.forEach((row: { file_path: string; error_count: string; metadata: string | Record<string, unknown> }) => {
			errorMap.set(row.file_path, {
				errors: parseInt(row.error_count),
				metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata as Record<string, unknown>
			});
		});

		const kbCounts = await getKBCounts();

		const enrichedRoutes = routes.map((route) => {
			const errorData = errorMap.get(route.path) || { errors: 0, metadata: {} };
			const kbCount = kbCounts.get(route.path) ?? 0;

			return {
				...route,
				errors: errorData.errors,
				complexity: errorData.metadata?.complexity ?? 0,
				kb_vectors: kbCount
			};
		});

		return json({
			routes: enrichedRoutes,
			summary: {
				total: enrichedRoutes.length,
				with_errors: enrichedRoutes.filter((r) => r.errors > 0).length,
				in_kb: enrichedRoutes.filter((r) => r.kb_vectors > 0).length
			}
		});

	} catch (error) {
		console.error('Routes API error:', error);
		return json(
      {
        routes: [],
        summary: {
          total: 0,
          with_errors: 0,
          in_kb: 0,
        },
        error: 'Failed to load routes',
      },
      { status: 500 }
    );
	}
};

async function scanDirectory(dir: string, basePath = ''): Promise<RouteInfo[]> {
	const routes: RouteInfo[] = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		const relativePath = path.join(basePath, entry.name);

		if (entry.isDirectory()) {
			if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
				const subRoutes = await scanDirectory(fullPath, relativePath);
				routes.push(...subRoutes);
			}
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name);
			if (['.svelte', '.ts', '.js', '.server.ts', '.server.js'].includes(ext)) {
				const fileInfo = await analyzeFile(fullPath, relativePath);
				routes.push(fileInfo);
			}
		}
	}

	return routes;
}

async function analyzeFile(fullPath: string, relativePath: string): Promise<RouteInfo> {
	const content = await fs.readFile(fullPath, 'utf-8');
	const stats = await fs.stat(fullPath);
	const lines = content.split('\n').length;

	let type = 'component';
	if (relativePath.includes('routes')) {
		if (relativePath.includes('+page')) type = 'page';
		else if (relativePath.includes('+layout')) type = 'layout';
		else if (relativePath.includes('+server')) type = 'server';
	} else if (relativePath.includes('api')) {
		type = 'api';
	}

	const analysis = await analyzeCode(content, path.extname(fullPath));

	return {
		id: relativePath,
		path: relativePath,
		type,
		errors: 0,
		complexity: 0,
		dependencies: analysis.imports,
		exports: analysis.exports,
		imports: analysis.imports,
		lines,
		functions: analysis.functions,
		kb_vectors: 0,
		last_modified: stats.mtime.toISOString()
	};
}

async function analyzeCode(content: string, ext: string) {
	const result = {
		functions: [] as string[],
		imports: [] as string[],
		exports: [] as string[]
	};

	if (!['.ts', '.js', '.svelte'].includes(ext)) {
		return result;
	}

	try {
		let code = content;
		if (ext === '.svelte') {
			const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
			if (scriptMatch) {
				code = scriptMatch[1];
			} else {
				return result;
			}
		}

		const ast = parse(code, {
			sourceType: 'module',
			plugins: ['typescript', 'jsx']
		});

		traverse.default(ast, {
			FunctionDeclaration(p: { node: { id?: { name: string } } }) {
				if (p.node.id) {
					result.functions.push(p.node.id.name);
				}
			},
			ArrowFunctionExpression(p: { parent: { type: string; id?: { name: string } } }) {
				if (p.parent.type === 'VariableDeclarator' && p.parent.id) {
					result.functions.push(p.parent.id.name);
				}
			},
			ImportDeclaration(p: { node: { source: { value: string } } }) {
				result.imports.push(p.node.source.value);
			},
			ExportNamedDeclaration(p: { node?: { declaration?: { id?: { name: string } } } }) {
				if (p.node?.declaration && p.node.declaration.id) {
					result.exports.push(p.node.declaration.id.name);
				}
			}
		});
	} catch {
		// Silent fail for parse errors
	}

	return result;
}

async function getKBCounts(): Promise<Map<string, number>> {
	const counts = new Map<string, number>();

	try {
		const response = await fetch(`${QDRANT_URL}/collections/phase76_knowledge_base/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit: 10000,
				with_payload: true,
				with_vector: false
			}),
			signal: AbortSignal.timeout(15_000)
		});

		const data = await response.json();
		if (data.result?.points) {
			data.result.points.forEach((point: { payload?: Record<string, unknown> }) => {
				const filePath = point.payload?.file_path ?? point.payload?.path;
				if (filePath) {
					counts.set(filePath as string, (counts.get(filePath as string) ?? 0) + 1);
				}
			});
		}
	} catch (error) {
		console.error('Failed to get KB counts:', error);
	}

	return counts;
}
