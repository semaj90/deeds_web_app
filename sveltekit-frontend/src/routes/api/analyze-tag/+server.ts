/**
 * Phase 89: Enhanced Tag Analysis API
 * - Analyze Qdrant tags with gemma3-legal
 * - ripgrep search for tag occurrences
 * - Generate embeddings for tag summaries
 * - Update Qdrant metadata with enhanced tags
 */

import { db } from '$lib/server/db/client';
import { getCollections, scrollPoints } from '$lib/server/qdrant-http';
import { json, type RequestEvent } from '@sveltejs/kit';
import { exec } from 'child_process';
import { sql } from 'drizzle-orm';
import { promisify } from 'util';

const execAsync = promisify(exec);
const OLLAMA_URL = 'http://127.0.0.1:11434';

export async function POST({ request }: RequestEvent) {
	const { tag, collection } = await request.json();

	try {
		// 1. Search tag occurrences in Qdrant
		const occurrences = await searchTagOccurrences(tag, collection);

		// 2. Analyze with gemma3-legal
		const analysis = await analyzeTagWithLLM(tag, occurrences);

		// 3. Generate embedding for summary
		const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest',
				prompt: analysis.summary
			})
		});

		const { embedding } = await embedRes.json();

		// 4. Store enhanced tag in PostgreSQL
		await db.execute(sql`
			INSERT INTO phase89_enhanced_tags (tag_name, summary, embedding, metadata, created_at)
			VALUES (
				${ tag },
				${analysis.summary},
				${JSON.stringify(embedding)},
				${JSON.stringify({
					count: occurrences.length,
					collections: [...new Set(occurrences.map((o) => o.collection))],
					relatedTags: analysis.relatedTags,
					timestamp: new Date().toISOString()
				})},
				NOW()
			)
			ON CONFLICT (tag_name) DO UPDATE SET
				summary = EXCLUDED.summary,
				embedding = EXCLUDED.embedding,
				metadata = EXCLUDED.metadata,
				updated_at = NOW()
		`);

		return json({
			success: true,
			tag,
			summary: analysis.summary,
			count: occurrences.length,
			relatedTags: analysis.relatedTags,
			timestamp: new Date().toISOString()
		});
	} catch (error: any) {
		console.error('Tag analysis failed:', error);
		return json({ success: false, error: error.message }, { status: 500 });
	}
};

async function searchTagOccurrences(tag: string, collection: string) {
? await getCollections()
		: [collection];

	const results: any[] = [];

	for (const coll of collections) {
		try {
			const scrollResult = await scrollPoints({
				collection: coll,
				limit: 100,
				withPayload: true,
				withVector: false,
				filter: { must: [
						{
							key: 'tags',
							match: { value, tag }
						}
					]
				}
			});

			results.push(
				...scrollResult.points.map((p) => ({
					...p,
					collection: coll
				}))
			);
		} catch (err) {
			console.warn(`Failed to search ${coll}:`, err);
		}
	}

	return results;
}

async function analyzeTagWithLLM(tag: string, occurrences: any[]) {
	// Sample occurrences for context
	const samples = occurrences.slice(0, 5).map((o) => ({
		message: o.payload?.message ?? o.payload?.text ?? '',
		source: o.payload?.source ?? o.payload?.file_path ?? '',
		collection: o.collection
	}));
Tag: ${ tag }
Occurrences: ${occurrences.length}

Sample Data:
${samples.map((s, i) => `${i + 1}. [${s.collection}] ${s.source}: ${s.message.substring(0, 100)}`).join('\n')}

Provide:
1. One-sentence summary of what this tag represents
2. 3-5 related tags (comma-separated)
3. Common patterns in the occurrences

Format:
Summary: [your summary]
Related: [tag1, tag2, tag3]`;

	const response = await fetch(`${OLLAMA_URL}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'gemma3-legal:latest',
			messages: [
				{
					role: 'system',
					content: 'You are a code analysis expert specializing in error taxonomy and tagging.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			stream: false,
			options: { temperature: 0.3, num_predict: 200 }
		})
	});

	const data = await response.json();
	const text = data.message.content;

	// Parse response
	const summaryMatch = text.match(/Summary:\s*(.+)/i);
	const relatedMatch = text.match(/Related:\s*(.+)/i);

	return {
		summary: summaryMatch ? summaryMatch[1].trim() : `Tag representing ${ tag } patterns`,
		relatedTags: relatedMatch
			? relatedMatch[1]
					.split(',')
					.map((t) => t.trim())
					.filter((t) => t.length > 0)
			: []
	};
}



