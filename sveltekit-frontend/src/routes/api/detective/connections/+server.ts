import { json } from '@sveltejs/kit';
/**
 * Detective Connections SSE Endpoint
 * Streams entity relationship graph generation for case evidence.
 * Uses Ollama gemma4-legal to identify people, orgs, locations,
 * and their connections for the detective connection map.
 */
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';

const connectionsSchema = z.object({
	caseId: z.string().min(1).max(200),
	focusTypes: z.array(z.string()).default(['people', 'evidence', 'locations', 'events']),
	connectionStrength: z.number().min(0).max(1).default(0.4),
	maxDepth: z.number().min(1).max(10).default(3),
	context: z.string().max(50000).optional()
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

// Node colors by entity type
const TYPE_COLORS: Record<string, string> = {
	person: '#4f46e5',
	organization: '#059669',
	location: '#d97706',
	event: '#dc2626',
	document: '#7c3aed',
	money: '#0891b2',
	date: '#64748b',
	evidence: '#e11d48'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json().catch(() => null);
	if (!body) {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
	}

	const parsed = connectionsSchema.safeParse(body);
	if (!parsed.success) {
		return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message }), { status: 400 });
	}

	const { caseId, focusTypes, connectionStrength, context } = parsed.data;

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: unknown, event?: string) => {
				try {
					if (event) controller.enqueue(encoder.encode(`event: ${event}\n`));
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch { /* client disconnected */ }
			};

			try {
				send({ step: 'extracting', percentage: 20, message: 'Extracting entities from case...' }, 'progress');

				const prompt = buildGraphPrompt(caseId, focusTypes, context);
				const response = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'gemma4-legal:latest',
						prompt,
						stream: true,
						options: { temperature: 0.2, num_predict: 4096 }
					})
				});

				if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

				send({ step: 'analyzing', percentage: 40, message: 'Building connection graph...' }, 'progress');

				let fullText = '';
				const reader = response.body?.getReader();
				if (!reader) throw new Error('No response body');

				const decoder = new TextDecoder();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					for (const line of chunk.split('\n').filter(Boolean)) {
						try {
							const p = JSON.parse(line);
							if (p.response) {
								fullText += p.response;
								try {
									controller.enqueue(encoder.encode(
										`event: token\ndata: ${JSON.stringify({ token: p.response })}\n\n`
									));
								} catch { /* disconnected */ }
							}
						} catch { /* skip */ }
					}
				}

				send({ step: 'building', percentage: 80, message: 'Constructing visualization...' }, 'progress');

				const graph = parseGraphResponse(fullText, connectionStrength);

				send({
					connectionMap: graph,
					metadata: {
						caseId,
						nodeCount: graph.nodes.length,
						edgeCount: graph.edges.length,
						clusterCount: graph.clusters.length,
						timestamp: new Date().toISOString()
					}
				}, 'complete');
			} catch (err) {
				send({ message: 'Connection map failed' }, 'error');
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

function buildGraphPrompt(caseId: string, focusTypes: string[], context?: string): string {
	const contextBlock = context ? `\nCase context:\n${context.slice(0, 10000)}` : '';

	return `You are a legal investigator building an entity relationship graph for case "${caseId}".
Focus on: ${focusTypes.join(', ')}.

Respond in JSON format:
{
  "nodes": [{ "id": "unique_id", "type": "person|organization|location|event|document|money", "label": "display name" }],
  "edges": [{ "source": "node_id", "target": "node_id", "label": "relationship type", "weight": 0.0-1.0 }],
  "clusters": [{ "name": "cluster name", "nodeIds": ["id1", "id2"] }]
}

Rules:
- Each node must have a unique id (lowercase, no spaces)
- Edge weight indicates connection strength (0.0-1.0)
- Group related entities into clusters
- Include at least the key people, organizations, and locations${contextBlock}

JSON response:`;
}

function parseGraphResponse(
	text: string,
	minStrength: number
): { nodes: { type: string; label: string; color: string }[]; edges: unknown[]; clusters: unknown[] } {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);

			const nodes = (parsed.nodes || []).map((n: Record<string, unknown>) => ({
				id: String(n.id || ''),
				type: String(n.type || 'unknown'),
				label: String(n.label || n.id || ''),
				color: TYPE_COLORS[String(n.type)] || '#64748b'
			}));

			const edges = (parsed.edges || [])
				.filter((e: Record<string, unknown>) => (Number(e.weight) || 0) >= minStrength)
				.map((e: Record<string, unknown>) => ({
					source: String(e.source || ''),
					target: String(e.target || ''),
					label: String(e.label || ''),
					weight: Number(e.weight) || 0.5
				}));

			const clusters = (parsed.clusters || []).map((c: Record<string, unknown>) => ({
				name: String(c.name || ''),
				nodeIds: Array.isArray(c.nodeIds) ? c.nodeIds.map(String) : []
			}));

			return { nodes, edges, clusters };
		}
	} catch { /* fallback */ }

	return { nodes: [], edges: [], clusters: [] };
}
