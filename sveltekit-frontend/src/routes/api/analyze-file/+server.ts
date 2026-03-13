/**
 * Phase 89: File Analysis API
 * - ripgrep search for comments/patterns
 * - gemma3-legal analysis
 * - PostgreSQL raw_error_embeddings lookup
 * - Enhanced Qdrant tag generation
 */

import { db } from '$lib/server/db/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { exec } from 'child_process';
import { sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { promisify } from 'util';

import { getOllamaUrl } from '$lib/config/env.server.js';
import { z } from 'zod';
const execAsync = promisify(exec);
const OLLAMA_URL = getOllamaUrl();

const analyzeFileSchema = z.object({
	filePath: z.string().min(1, 'filePath is required').max(1000)
		.refine(p => !p.includes('..'), 'Path traversal not allowed')
		.refine(p => !p.startsWith('/'), 'Absolute paths not allowed')
});

export async function POST({ request, locals }: RequestEvent) {
	if (!locals.user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	try {
		const raw = await request.json();
		const parsed = analyzeFileSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { filePath } = parsed.data;

		// 1. Read file content
		const content = await readFile(filePath, 'utf-8');

		// 2. ripgrep: Extract comments
		const comments = await extractComments(filePath);

		// 3. Pattern search
		const patterns = await searchPatterns(filePath);

		// 4. PostgreSQL: Get errors for this file
		const errors: any = await db.execute(sql`
			SELECT message, code, line_number, timestamp
			FROM raw_error_embeddings
			WHERE source = ${filePath}
			ORDER BY timestamp DESC
			LIMIT 20
		`);

		// 5. gemma3-legal: Analyze file
		const analysis = await analyzeFileWithLLM(filePath, content, comments, errors.rows || []);

		// 6. Generate enhanced Qdrant tag
		const qdrantTag = await generateEnhancedTag(filePath, analysis);

		// 7. Store analysis in PostgreSQL
		await db.execute(sql`
			INSERT INTO phase89_file_analyses (
				file_path,
				summary,
				comments,
				error_count,
				recommendations,
				qdrant_tag,
				metadata,
				created_at
			) VALUES (
				${filePath},
				${analysis.summary},
				${JSON.stringify(comments)},
				${(errors.rows || []).length},
				${JSON.stringify(analysis.recommendations)},
				${JSON.stringify(qdrantTag)},
				${JSON.stringify({ patterns, timestamp: new Date().toISOString() })},
				NOW()
			)
			ON CONFLICT (file_path) DO UPDATE SET
				summary = EXCLUDED.summary,
				comments = EXCLUDED.comments,
				error_count = EXCLUDED.error_count,
				recommendations = EXCLUDED.recommendations,
				qdrant_tag = EXCLUDED.qdrant_tag,
				metadata = EXCLUDED.metadata,
				updated_at = NOW()
		`);

		return json({
			success: true,
			filePath,
			summary: analysis.summary,
			comments,
			errors: errors.rows || [],
			recommendations: analysis.recommendations,
			qdrantTag,
			patterns
		});
	} catch (error: any) {
		console.error('File analysis failed:', error);
		return json({ success: false, error: 'File analysis failed' }, { status: 500 });
	}
}

async function extractComments(filePath: string): Promise<string[]> {
	try {
		// ripgrep: Find single-line and multi-line comments
		const { stdout } = await execAsync(
			`rg "(//.*|/\\*[\\s\\S]*?\\*/)" "${filePath}" --no-heading --no-line-number`,
			{ timeout: 5000 }
		);

	const lines = stdout.split('\n');
	return lines
		.filter((line) => line.trim().length > 0)
		.map((line) => line.trim());
	} catch {
		return [];
	}
}

async function searchPatterns(filePath: string): Promise<any> {
	const patterns = {
		todoComments: 0,
		fixmeComments: 0,
		anyTypes: 0,
		errorHandlers: 0,
		svelte5Runes: 0
	};

	const runRgCount = async (pattern: string) => {
		try {
			const { stdout } = await execAsync(`rg -c "${pattern}" "${filePath}"`, { timeout: 2000 });
			return parseInt(stdout.trim()) || 0;
		} catch {
			return 0;
		}
	};

	patterns.todoComments = await runRgCount('TODO');
	patterns.fixmeComments = await runRgCount('FIXME');
	patterns.anyTypes = await runRgCount(': any');
	patterns.errorHandlers = await runRgCount('try|catch');
	patterns.svelte5Runes = await runRgCount('\\$state|\\$derived|\\$effect|\\$props');

	return patterns;
}

async function analyzeFileWithLLM(
	filePath: string,
	content: string,
	comments: string[],
	errors: any[]
) {
	const prompt = `
File: ${filePath}
Lines: ${content.split('\n').length}
Comments: ${comments.length}
Errors: ${errors.length}

Top Comments:
${comments.slice(0, 5).join('\n')}

Top Errors:
${errors.slice(0, 5).map((e) => `${e.code}: ${e.message}`).join('\n')}

Provide:
1. One-paragraph summary of file purpose and current state
2. 3-5 specific recommendations for error fixes (production-quality code)
3. Priority level (HIGH/MEDIUM/LOW) for each recommendation

Be concise and actionable.`;

	try {
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma3-legal:latest',
				messages: [
					{
						role: 'system',
						content:
							'You are an expert code reviewer focused on production-quality TypeScript/Svelte code.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				stream: false,
				options: { temperature: 0.4, num_predict: 500 }
			})
		});

		if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
		const data = await response.json();
		const text = data.message.content;

		// Parse recommendations
		const recommendations: string[] = [];
		const lines = text.split('\n');
		for (const line of lines) {
			if (/^\d+\./.test(line.trim()) || /^-/.test(line.trim())) {
				recommendations.push(line.trim());
			}
		}

		return {
			summary: text.split('\n\n')[0] ?? 'Analysis complete',
			recommendations: recommendations.slice(0, 5)
		};
	} catch (err) {
		console.warn('Ollama analysis failed:', err);
		return {
			summary: 'Analysis unavailable (Ollama offline)',
			recommendations: ['Check LLM connectivity']
		};
	}
}

async function generateEnhancedTag(filePath: string, analysis: any) {
	const fileName = filePath.split(/[\\/]/).pop() ?? '';
	const fileType = fileName.split('.').pop() ?? '';

	// Determine tag category
	let category = 'general';
	if (fileType === 'svelte') category = 'svelte_component';
	else if (fileType === 'ts' && filePath.includes('/routes/')) category = 'sveltekit_route';
	else if (fileType === 'ts') category = 'typescript_module';

	// Generate tag name
	const tagName = `${category}:${fileName.replace(/\./g, '_')}`;

	try {
		// Generate embedding for summary
		const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'nomic-embed-text:latest', // Changed to a common embedding model
				prompt: analysis.summary
			})
		});

		if (!embedRes.ok) throw new Error('Embedding failed');
		const { embedding } = await embedRes.json();

		return {
			name: tagName,
			summary: analysis.summary,
			category,
			embedding,
			timestamp: new Date().toISOString()
		};
	} catch (err) {
		return {
			name: tagName,
			summary: analysis.summary,
			category,
			embedding: [],
			timestamp: new Date().toISOString()
		};
	}
}



