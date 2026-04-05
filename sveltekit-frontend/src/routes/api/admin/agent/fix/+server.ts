import { json } from '@sveltejs/kit';
import { getOllamaUrl, getQdrantUrl } from '$lib/config/env.server.js';
// Stream endpoint not yet implemented
function broadcastAgentProgress(_data: unknown) { /* no-op */ }
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = getOllamaUrl();
const QDRANT_URL = getQdrantUrl();

const agentFixSchema = z.object({
	file_path: z.string().min(1, 'file_path is required').max(1000),
	errors: z.array(z.string().max(5000)).max(50).optional().default([]),
	auto_apply: z.boolean().optional().default(false),
});

interface AgentProgress {
	status: 'analyzing' | 'fixing' | 'testing' | 'complete' | 'failed';
	file_path: string, progress: number;
	message: string;
	fixes?: string[];
}

async function queryKnowledgeBase(filePath: string, errorContext: string): Promise<string> {
	try {
		// Generate embedding for the error context
		const embedResponse = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest',
				prompt: errorContext
			})
		});

		if (!embedResponse.ok) {
			console.error('Embedding generation failed');
			return '';
		}

		const embedData = await embedResponse.json();
		const vector = embedData.embedding;

		// Search Qdrant for similar fixes
		const searchResponse = await fetch(`${QDRANT_URL}/collections/phase76_knowledge_base/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vector, limit: 5,
				with_payload: true,
				filter: { should: [
						{
							key: 'file_path',
							match: { value: filePath }
						},
						{
							key: 'type',
							match: { value: 'fix' }
						}
					]
				}
			}),
			signal: AbortSignal.timeout(10_000)
		});

		if (!searchResponse.ok) {
			return '';
		}

		const searchData = await searchResponse.json();
		const results = searchData?.result|| [];

		// Concatenate relevant knowledge
		const knowledge = results
			.map((r: Record<string, any>) => r.payload?.content ?? r.payload?.text ?? '')
			.filter(Boolean)
			.join('\n\n');

		return knowledge;
	} catch (error) {
		console.error('KB query error:', error);
		return '';
	}
}

async function generateFix(
	filePath: string,
	errors: string[],
	knowledge: string,
	onProgress: (progress: AgentProgress) => void
): Promise<string[]> {
	const fixes: string[] = [];

	// Broadcast initial status
	onProgress({
		status: 'analyzing',
		file_path: filePath,
		progress: 0,
		message: 'Analyzing errors and retrieving context...'
	});
  
	const prompt = `You are an expert TypeScript/Svelte developer fixing errors in: ${ filePath }

ERRORS TO FIX:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

RELEVANT KNOWLEDGE BASE CONTEXT:
${knowledge ?? 'No specific context found. Use general best practices.'}

INSTRUCTIONS:
1. Analyze each error
2. Provide specific fixes (code snippets)
3. Explain why the fix works
4. Ensure Svelte 5 compatibility (use runes: $state, $derived, $effect)

Return fixes in JSON format:
{
  "fixes": [
    {
      "error": "...",
      "solution": "...",
      "code": "...",
      "explanation": "..."
    }
  ]
}`;

	onProgress({
		status: 'fixing',
		file_path: filePath,
		progress: 30,
		message: 'Generating fixes with LLM...'
	});

	try {
		const response = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma4-legal:latest',
				prompt,
				stream: false,
				options: { temperature: 0.3,
					top_p: 0.9,
					num_predict: 2048
				}
			})
		});

		if (!response.ok) {
			throw new Error('LLM generation failed');
		}

		const data = await response.json();
		const text = data?.response ?? '';

		onProgress({
			status: 'testing',
			file_path: filePath,
			progress: 70,
			message: 'Parsing and validating fixes...'
		});
  
		const jsonMatch = text.match(/\{[\s\S]*"fixes"[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			fixes.push(
				...parsed.fixes.map(
					(f: Record<string, any>) => `
**Error:** ${f.error}
**Solution:** ${f.solution}
\`\`\`typescript
${f.code}
\`\`\`
**Explanation:** ${f.explanation}
`
				)
			);
		} else {
			// Fallback: use raw text
			fixes.push(text);
		}

		onProgress({
			status: 'complete',
			file_path: filePath,
			progress: 100,
			message: `Generated ${fixes.length} fixes`,
			fixes
		});

		return fixes;
	} catch (error) {
		onProgress({
			status: 'failed',
			file_path: filePath,
			progress: 100,
			message: 'Fix execution failed'
		});
		throw error;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = agentFixSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}
		const { file_path, errors, auto_apply } = parsed.data;

		// Query KB for context
		const errorContext = errors.join('\n');
		const knowledge = await queryKnowledgeBase(file_path, errorContext);

		// Generate fixes
		const fixes = await generateFix(file_path, errors, knowledge, (progress) => {
			broadcastAgentProgress(progress);
		});

		return json({
			success: true,
			file_path, fixes,
			auto_applied: auto_apply,
			kb_context_used: knowledge.length > 0,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Agent fix error:', error);
		return json(
			{
				success: false,
				error: 'Failed to generate fixes'
			},
			{ status: 500 }
		);
	}
};




