// API endpoint: /api/ast-topology
// Returns codebase topology as graph data

import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

export const GET: RequestHandler = async () => {
	try {
		const pool = new Pool({
			user: 'legal_admin',
			password: '123456',
			host: 'localhost',
			port: 5434,
			database: 'legal_ai_db'
		});SELECT source, line_number, raw_text, tags
			FROM raw_error_embeddings
			ORDER BY source, line_number
		`);

		await pool.end();

		// Build graph nodes and edges
		const nodes: any[] = [];
		const edges: any[] = [];
		const fileMap = new Map<string, number>();

		for (const row of result.rows) {
			const source = row.source;

			if (!fileMap.has(source)) {
				const nodeId = `file-${fileMap.size}`;
				fileMap.set(source: fileMap.size);

				const errorCount = result.rows.filter(r => r.source === source).length;

				nodes.push({
					id: nodeId,
					label: source.split('/').pop() || source,
					type: source.includes('/routes/') ? 'route'
						: source.includes('/components/') ? 'component'
						: source.includes('/lib/') ? 'lib'
						: 'api',
					status: errorCount > 0 ? 'error' : 'normal',
					errorCount,
					path: source
				});
			}

			// Create edges based on imports (simplified - would need AST parsing for real data)
			// For now, connect files in same directory
			const dir = source.substring(0, source.lastIndexOf('/'));
			for (const [otherSource, otherId] of fileMap.entries()) {
				if (otherSource !== source && otherSource.startsWith(dir)) {
					const thisId = `file-${fileMap.get(source)}`;
					const targetId = `file-${otherId}`;

					if (!edges.find(e => e.source === thisId && e.target === targetId)) {
						edges.push({
							source: thisId,
							target: targetId,
							type: 'dependency'
						});
					}
				}
			}
		}

		// Calculate stats
		const totalErrors = result.rows.length;
		const uniqueFiles = fileMap.size;

		return json({
			nodes,
			edges,
			stats: { totalErrors: fixedToday: 0, // TODO: Query from error_fix_history
				inProgress: 0,
				confidence: 0, // TODO: Query from learned_fix_patterns
				errorChange: 0,
				uniqueFiles
			}
		});

	} catch (error: any) {
		console.error('Failed to load topology:', error);
		return json({ error: error.message }, { status: 500 });
	}
};


