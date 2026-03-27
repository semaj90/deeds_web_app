import { getDatabaseUrl } from '$lib/config/env.server.js';
import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const pgPool = new Pool({ connectionString: getDatabaseUrl() });

export const GET: RequestHandler = async () => {
	try {
        const result = await pgPool.query(`
            SELECT
                file_path,
                error_code,
                COUNT(*) as error_count,
                MAX(metadata) as metadata
            FROM raw_error_embeddings
            WHERE source = 'svelte-check'
            GROUP BY file_path, error_code
            ORDER BY error_count DESC
        `);

        // Group by component
        const componentMap = new Map();

        for (const row of result.rows) {
            const filePath = row.file_path;
            const component = extractComponent(filePath);

            if (!componentMap.has(component)) {
                componentMap.set(component, {
                    name: component,
                    path: filePath,
                    errors: 0,
                    complexity: 0,
                    tags: new Set(),
                    error_codes: new Set(),
                    dependencies: new Set()
                });
            }

            const comp = componentMap.get(component);
            comp.errors += parseInt(row.error_count);
            comp.error_codes.add(row.error_code);

            // Extract metadata
            if (row.metadata) {
                const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
                if (meta.complexity) {
                    comp.complexity = Math.max(comp.complexity, meta.complexity);
                }
            }
        }

        // Load dependencies from file content (simple import detection)
        const components = Array.from(componentMap.values()).map(comp => {
            const tags = generateTags(comp);
            comp.tags = Array.from(tags);
            comp.error_codes = Array.from(comp.error_codes);
            comp.recommended_action = recommendAction(comp);
            comp.dependencies = [];  // Would need AST parsing for accurate deps
            return {
                ...comp,
                importance: comp.errors * (1 + comp.complexity)
            };
        }).sort((a, b) => b.importance - a.importance);

        const total_errors = components.reduce((sum: number, c: ComponentEntry) => sum + c.errors, 0);

        return json({
            components,
            summary: { total_components: components.length,
                total_errors,
                high_priority: components.filter((c: ComponentEntry) => c.recommended_action === 'urgent_refactor').length,
                avg_complexity: components.length > 0 ? components.reduce((sum: number, c: ComponentEntry) => sum + c.complexity, 0) / components.length : 0
            }
        });

	} catch (error) {
		console.error('Topology API error:', error);
		return json({ error: 'Failed to load topology' }, { status: 500 });
	}
};

function extractComponent(filePath: string): string {
	const parts = filePath.split(/[\/\\]/);

	if (parts.includes('routes')) {
		const idx = parts.indexOf('routes');
		return parts.slice(idx, idx + 2).join('/');
	}

	if (parts.includes('lib')) {
		const idx = parts.indexOf('lib');
		return parts.slice(idx, idx + 2).join('/');
	}

	return filePath;
}

interface ComponentEntry {
	name: string;
	path: string;
	errors: number;
	complexity: number;
	tags: Set<string> | string[];
	error_codes: Set<string> | string[];
	dependencies: Set<string> | string[];
	recommended_action?: string;
	importance?: number;
}

function generateTags(comp: ComponentEntry): Set<string> {
	const tags = new Set<string>();
	if (comp.errors > 10) tags.add('buggy');
	if (comp.complexity > 20) tags.add('complex');
	if (comp.path.includes('routes')) tags.add('route');
	if (comp.path.includes('lib')) tags.add('library');
	return tags;
}

function recommendAction(comp: ComponentEntry): string {
	if (comp.errors > 20) return 'urgent_refactor';
	if (comp.errors > 5) return 'investigate';
	if (comp.complexity > 30) return 'simplify';
	return 'monitor';
}



