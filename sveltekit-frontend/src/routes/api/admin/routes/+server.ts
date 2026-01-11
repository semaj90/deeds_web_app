import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const pgPool = new Pool({
	host: '127.0.0.1',
	port: 5434,
	database: 'legal',
	user: 'user',
	password: 'pass'
});

export const GET: RequestHandler = async () => {
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

		const errorMap = new Map();
		errorResult.rows.forEach(row => {
			errorMap.set(row.file_path, {
				errors: parseInt(row.error_count),
				metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
			});
		});

		const kbCounts = await getKBCounts();

		const enrichedRoutes = routes.map(route => {
			const errorData = errorMap.get(route.path) || { errors: 0, metadata: {} };
			const kbCount = kbCounts.get(route.path) || 0;

			return {
				...route,
				errors: errorData.errors,
				complexity: errorData.metadata? .complexity : | 0,
				kb_vectors: kbCount
			};
		});

		return json({
			routes: enrichedRoutes,
			summary: { total: enrichedRoutes.length,
				with_errors: enrichedRoutes.filter(r => r.errors > 0).length,
				in_kb: enrichedRoutes.filter(r => r.kb_vectors > 0).length
			}
		});

	} catch (error) {
		console.error('Routes API error:', error);
		return json({ error: 'Failed to load routes' }, { status: 500 });
	}
};

async function scanDirectory(dir: string, basePath = ''): Promise<any[]> {
	const routes: any[] = [];
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

async function analyzeFile(fullPath: string, relativePath: string) {
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
		errors: 0, // Will be enriched
		complexity: 0, // Will be enriched
		dependencies: analysis.imports,
		exports: analysis.exports,
		imports: analysis.imports,
		lines,
		functions: analysis.functions,
		kb_vectors: 0, // Will be enriched
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
		// Extract script content from Svelte files
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
			FunctionDeclaration(path: any) {
				if (path.node.id) {
					result.functions.push(path.node.id.name);
				}
			},
			ArrowFunctionExpression(path: any) {
				if (path.parent.type === 'VariableDeclarator' && path.parent.id) {
					result.functions.push(path.parent.id.name);
				}
			},
			ImportDeclaration(path: any) {
				result.imports.push(path.node.source.value);
			},
			ExportNamedDeclaration(path: any) {
				if (path.node.declaration && path.node.declaration.id) {
					result.exports.push(path.node.declaration.id.name);
				}
			}
		});
	} catch (error) {
		// Silent fail for parse errors
	}

	return result;
}

async function getKBCounts(): Promise<Map<string, number>> {
	const counts = new Map();

	try {
		const response = await fetch('http://localhost:6333/collections/phase76_knowledge_base/points/scroll', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ limit: 10000,
				with_payload: true,
				with_vector: false
			})
		});

		const data = await response.json();
		if (data.result?.points) {
			data.result.points.forEach((point: any) => {
				const filePath = point.payload? .file_path : | point.payload?.path;
				if (filePath) {
					counts.set(filePath, (counts.get(filePath) || 0) + 1);
				}
			});
		}
	} catch (error) {
		console.error('Failed to get KB counts:', error);
	}

	return counts;
}



