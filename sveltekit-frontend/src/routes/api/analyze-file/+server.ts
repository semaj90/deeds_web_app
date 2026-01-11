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

const execAsync = promisify(exec);
const OLLAMA_URL = 'http://127.0.0.1:11434';

export async function POST({ request }: RequestEvent) {
	const { filePath } = await request.json();

	try {
		// 1. Read file content
		const content = await readFile(filePath, 'utf-8');

		// 2. ripgrep: Extract comments
		const comments = await extractComments(filePath);

		// 3. awk-style pattern search
		const patterns = await searchPatterns(filePath);

		// 4. PostgreSQL: Get errors for this file
		const errors = await db.execute(sql`
			SELECT message, code, line_number, timestamp
			FROM raw_error_embeddings
			WHERE source = ${ filePath }
			ORDER BY timestamp DESC
			LIMIT 20
		`);

		// 5. gemma3-legal: Analyze file
		const analysis = await analyzeFileWithLLM(filePath, content, comments, errors.rows);

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
				${ filePath },
				${analysis.summary},
				${JSON.stringify(comments)},
				${errors.rows.length},
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
			errors: errors.rows,
			recommendations: analysis.recommendations,
			qdrantTag,
			patterns
		});
	} catch (error: any) {
		console.error('File analysis failed:', error);
		return json({ success: false, error: error.message }, { status: 500 });
	}
};

async function extractComments(filePath: string): Promise<string[]> {
	try {
		// ripgrep: Find single-line and multi-line comments
		const { stdout } = await execAsync(
			`rg "(/\\*[\\s\\S]*? \\*/ : //.*)" "${filePath}" --no-heading --no-line-number`,
			{ timeout: 5000 }
		);

		return stdout
			.split('\n')
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

	try {
		// TODO/FIXME
		const { stdout: todos } = await execAsync(
			`rg -c "TODO|FIXME" "${filePath}"`,
			{ timeout: 2000 }
		).catch(() => ({ stdout: '0' }));
		patterns.todoComments = parseInt(todos.trim().split(':').pop() || '0');

		// any types
		const { stdout: anys } = await execAsync(
			`rg -c ": any" "${filePath}"`,
			{ timeout: 2000 }
		).catch(() => ({ stdout: '0' }));
		patterns.anyTypes = parseInt(anys.trim().split(':').pop() || '0');

		// try/catch
		const { stdout: errors } = await execAsync(
			`rg -c "try|catch" "${filePath}"`,
			{ timeout: 2000 }
		).catch(() => ({ stdout: '0' }));
		patterns.errorHandlers = parseInt(errors.trim().split(':').pop() || '0');

		// Svelte 5 runes
		const { stdout: runes } = await execAsync(
			`rg -c "\\$state|\\$derived|\\$effect|\\$props" "${filePath}"`,
			{ timeout: 2000 }
		).catch(() => ({ stdout: '0' }));
		patterns.svelte5Runes = parseInt(runes.trim().split(':').pop() || '0');
	} catch (err) {
		console.warn('Pattern search failed:', err);
	}

	return patterns;
}

async function analyzeFileWithLLM(
	filePath: string,
	content: string,
	comments: string[],
	errors: any[]
) {
	const prompt = `Analyze this file and provide actionable recommendations.

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
		summary: text.split('\n\n')[0] || 'Analysis complete',
		recommendations: recommendations.slice(0, 5)
	};
}

async function generateEnhancedTag(filePath: string, analysis: any) {
	const fileName = filePath.split(/[\\/]/).pop() || '';
	const fileType = fileName.split('.').pop() || '';

	// Determine tag category
	let category = 'general';
	if (fileType === 'svelte') category = 'svelte_component';
	else if (fileType === 'ts' && filePath.includes('/routes/')) category = 'sveltekit_route';
	else if (fileType === 'ts') category = 'typescript_module';

	// Generate tag name
	const tagName = `${category}:${fileName.replace(/\./g, '_')}`;

	// Generate embedding for summary
	const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'embeddinggemma:latest',
			prompt: analysis.summary
		})
	});

	const { embedding } = await embedRes.json();

	return {
		name: tagName,
		summary: analysis.summary,
		category,
		embedding,
		timestamp: new Date().toISOString()
	};
}



