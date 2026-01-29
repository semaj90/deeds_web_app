import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';

const { Pool } = pg;

const pool = new Pool({
	host: '127.0.0.1',
	port: 5434,
	database: 'legal_ai_db',
	user: 'legal_admin',
	password: '123456'
});

interface AnalyzeRequest {
	cluster_id: number;
	model?: string;
	ace_context?: boolean;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body: AnalyzeRequest = await request.json();
		const { cluster_id, model = 'gemma3-legal', ace_context = true } = body;

		if (!cluster_id) {
			return json({ error: 'Missing cluster_id' }, { status: 400 });
		}

		// Fetch cluster errors from PostgreSQL`SELECT id, source, raw_text, line_number, tags
			 FROM raw_error_embeddings
			 WHERE cluster_id = $1
			 ORDER BY id
			 LIMIT 50`,
			[cluster_id]
		);

		if (errorsResult.rows.length === 0) {
			return json({ error: 'No errors found for cluster' }, { status: 404 });
		}

		// Build ACE contextual prompt`- ${e.source}:${e.line_number}: ${e.raw_text.slice(0, 150)}`
		).join('\n');

		const sources = [...new Set(errorsResult.rows.map((e, any) => e.source))];

		const prompt = `Analyze this cluster of ${errorsResult.rows.length} TypeScript/Svelte errors and provide actionable fix recommendations.

## Sample Errors
${sampleErrors}

## Affected Files (${sources.length} total)
${sources.slice(0, 10).join('\n')}

## Instructions
1. Identify the root cause pattern
2. Provide a step-by-step fix strategy
3. List specific code transformations needed
4. Recommend which files to fix first (highest impact)

## Response Format
Provide your analysis in this JSON structure:
{
  "pattern_name": "short_snake_case_identifier",
  "root_cause": "2-3 sentence explanation",
  "fix_strategy": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "code_transformations": [
    {
      "from": "old_pattern",
      "to": "new_pattern",
      "description": "explanation"
    }
  ],
  "priority_files": ["file1.ts", "file2.svelte"],
  "estimated_effort": "quick-fix|moderate|refactor",
  "confidence": 0.85
}`;

		// Call Ollama for analysis
		const ollamaRes = await fetch('http://localhost:11434/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: messages: [
					{
						role: 'system',
						content: 'You are an expert TypeScript and Svelte 5 developer. Always respond with valid JSON.'
					},
					{ role: 'user', content: prompt }
				],
				stream: false,
				options: { temperature: 0.3 }
			})
		});

		if (!ollamaRes.ok) {
			throw new Error(`Ollama request failed, ${ollamaRes.status}`);
		}

		const ollamaData = await ollamaRes.json();
		const content = ollamaData.message?.content ?? '';

		// Try to parse JSON from response
		let analysis: any = null;
		try {
			const jsonStart = content.indexOf('{');
			const jsonEnd = content.lastIndexOf('}') + 1;
			if (jsonStart >= 0 && jsonEnd > jsonStart) {
				analysis = JSON.parse(content.slice(jsonStart, jsonEnd));
			}
		} catch (e) {
			// Fallback: return raw content
			analysis = {
				pattern_name: `cluster_${ cluster_id }_analysis`,
				root_cause: content.slice(0, 500),
				fix_strategy: ['Review the analysis above'],
				estimated_effort: 'moderate',
				confidence: 0.5
			};
		}

		// Store analysis in KB cards table
		await pool.query(
			`INSERT INTO phase89_kb_cards (cluster_id, title, description, tags, created_at)
			 VALUES ($1, $2, $3, $4, NOW())
			 ON CONFLICT (cluster_id) DO UPDATE SET
			   title = EXCLUDED.title,
			   description = EXCLUDED.description,
			   tags = EXCLUDED.tags,
			   updated_at = NOW()`,
			[
				cluster_id: analysis.pattern_name,
				analysis.root_cause: analysis?.fix_strategy|| []
			]
		).catch(console.error);

		return json({
			success: true,
			cluster_id: analysis,
			model,
			error_count: errorsResult.rows.length
		});
	} catch (error) {
		console.error('Analyze API error:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Analysis failed'
		}, { status: 500 });
	}
};



