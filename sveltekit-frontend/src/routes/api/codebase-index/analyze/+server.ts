/**
 * Codebase File Analysis API
 *
 * POST /api/codebase-index/analyze
 *
 * Reads a source file, sends it to the LLM, and returns:
 *   - summary: what the file does
 *   - risks: coupling, complexity, security concerns
 *   - dependencies: key imports and their roles
 *   - suggestions: improvement recommendations
 *
 * Body: { filePath: string }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve, relative } from 'path';
import { readFileSync, statSync } from 'fs';
import { callOllamaChat } from '$lib/server/ollama.js';

const SRC_ROOT = resolve(process.cwd(), 'src');

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: { filePath?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const filePath = body.filePath;
	if (!filePath || typeof filePath !== 'string') {
		return json({ error: 'filePath is required' }, { status: 400 });
	}

	// Resolve relative to project root: "src/routes/..." → absolute path
	const normalizedPath = filePath.startsWith('src/')
		? resolve(process.cwd(), filePath)
		: resolve(SRC_ROOT, filePath);

	// Security: ensure file is within the project
	const projectRoot = resolve(process.cwd());
	if (!normalizedPath.startsWith(projectRoot)) {
		return json({ error: 'Path outside project boundary' }, { status: 400 });
	}

	// Read the file
	let fileContent: string;
	let fileStats: { size: number; lines: number };
	try {
		fileContent = readFileSync(normalizedPath, 'utf-8');
		const st = statSync(normalizedPath);
		fileStats = { size: st.size, lines: fileContent.split('\n').length };
	} catch {
		return json({ error: 'File not found or unreadable' }, { status: 404 });
	}

	// Truncate very large files for LLM context
	const MAX_CHARS = 12_000;
	const truncated = fileContent.length > MAX_CHARS;
	const contentForLLM = truncated
		? fileContent.slice(0, MAX_CHARS) + '\n\n... [TRUNCATED — file continues]'
		: fileContent;

	const relPath = relative(projectRoot, normalizedPath).replace(/\\/g, '/');

	const systemPrompt = `You are a senior software architect analyzing a TypeScript/Svelte codebase.
Analyze the file and return a JSON object with these fields:
- "summary": 1-2 sentence description of what this file does
- "risks": array of strings — coupling, complexity, security, or maintenance risks
- "dependencies": array of { "import": "...", "role": "..." } for the top 5 most important imports
- "suggestions": array of strings — concrete improvement ideas (max 3)
- "couplingScore": number 0-10 (0=isolated, 10=highly coupled)
- "complexityScore": number 0-10 (0=simple, 10=very complex)
- "healthGrade": string — "A", "B", "C", "D", or "F" (overall file health)

Return ONLY valid JSON, no markdown fences, no explanation.`;

	const userPrompt = `File: ${relPath}
Lines: ${fileStats.lines}
Size: ${fileStats.size} bytes
${truncated ? '(truncated to first 12K chars)' : ''}

\`\`\`
${contentForLLM}
\`\`\``;

	try {
		const raw = await callOllamaChat(systemPrompt, userPrompt);

		// Parse LLM response — strip markdown fences if present
		let cleaned = raw.trim();
		if (cleaned.startsWith('```')) {
			cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
		}

		let analysis: Record<string, unknown>;
		try {
			analysis = JSON.parse(cleaned);
		} catch {
			// LLM returned non-JSON — wrap it
			analysis = {
				summary: cleaned.slice(0, 200),
				risks: ['LLM returned non-structured response'],
				dependencies: [],
				suggestions: [],
				couplingScore: -1,
				complexityScore: -1,
				healthGrade: '?',
			};
		}

		return json({
			filePath: relPath,
			fileStats,
			truncated,
			analysis,
			analyzedAt: new Date().toISOString(),
		});
	} catch (err) {
		console.error('[codebase-analyze] LLM error:', err);
		return json(
			{
				filePath: relPath,
				fileStats,
				analysis: {
					summary: 'Analysis unavailable — LLM service unreachable',
					risks: [],
					dependencies: [],
					suggestions: [],
					couplingScore: -1,
					complexityScore: -1,
					healthGrade: '?',
				},
				error: 'LLM service unavailable',
			},
			{ status: 503 }
		);
	}
};
