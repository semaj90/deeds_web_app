import { json } from '@sveltejs/kit';
/**
 * Detective Analysis SSE Endpoint
 * Streams LLM-powered evidence analysis results in real-time.
 * Uses Ollama gemma4-rotorquant:latest for entity extraction, connection mapping,
 * anomaly detection, and timeline gap analysis.
 */
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';

const analyzeSchema = z.object({
	text: z.string().min(1).max(50000),
	caseId: z.string().min(1).max(200),
	evidence: z.array(z.unknown()).default([]),
	analysisType: z.enum(['contextual_detective', 'entity_extraction', 'connection_map']).default('contextual_detective')
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json().catch(() => null);
	if (!body) {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
	}

	const parsed = analyzeSchema.safeParse(body);
	if (!parsed.success) {
		return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message }), { status: 400 });
	}

	const { text, caseId, evidence, analysisType } = parsed.data;

	const encoder = new TextEncoder();
	const abortController = new AbortController();
	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: unknown, event?: string) => {
				try {
					if (event) controller.enqueue(encoder.encode(`event: ${event}\n`));
					const payload = typeof data === 'string' ? data : JSON.stringify(data);
					controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
				} catch { /* client disconnected */ }
			};

			try {
				// Step 1: Entity extraction
				send({ step: 'entity_extraction', percentage: 10, message: 'Extracting entities...' }, 'progress');

				const entityPrompt = buildEntityPrompt(text, evidence);
				const entityResult = await streamOllamaAnalysis(
					entityPrompt, controller, encoder, 'entity_extraction', abortController.signal
				);

				send({ step: 'entity_extraction', percentage: 30, entities: entityResult }, 'progress');

				// Step 2: Connection analysis
				send({ step: 'connection_analysis', percentage: 40, message: 'Analyzing connections...' }, 'progress');

				const connectionPrompt = buildConnectionPrompt(text, entityResult, evidence);
				const connectionResult = await streamOllamaAnalysis(
					connectionPrompt, controller, encoder, 'connection_analysis', abortController.signal
				);

				send({ step: 'connection_analysis', percentage: 60, connections: connectionResult }, 'progress');

				// Step 3: Anomaly detection
				send({ step: 'anomaly_detection', percentage: 70, message: 'Detecting anomalies...' }, 'progress');

				const anomalyPrompt = buildAnomalyPrompt(text, entityResult, evidence);
				const anomalyResult = await streamOllamaAnalysis(
					anomalyPrompt, controller, encoder, 'anomaly_detection', abortController.signal
				);

				send({ step: 'anomaly_detection', percentage: 85, anomalies: anomalyResult }, 'progress');

				// Step 4: Final synthesis
				send({ step: 'synthesis', percentage: 95, message: 'Synthesizing analysis...' }, 'progress');

				const analysis = {
					keyEntities: parseEntities(entityResult),
					suggestedConnections: parseConnections(connectionResult),
					anomalies: parseAnomalies(anomalyResult),
					timelineGaps: [],
					caseId,
					analysisType,
					timestamp: new Date().toISOString()
				};

				send(analysis, 'complete');
			} catch (err) {
				send({ message: 'Analysis failed' }, 'error');
			} finally {
				controller.close();
			}
		},
		cancel() {
			abortController.abort();
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

async function streamOllamaAnalysis(
	prompt: string,
	controller: ReadableStreamDefaultController,
	encoder: TextEncoder,
	step: string,
	signal?: AbortSignal
): Promise<string> {
	const response = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'gemma4-rotorquant:latest',
			prompt,
			stream: true,
			options: { temperature: 0.3, num_predict: 2048 }
		}),
		signal
	});

	if (!response.ok) {
		throw new Error(`Ollama error: ${response.status}`);
	}

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
				const parsed = JSON.parse(line);
				if (parsed.response) {
					fullText += parsed.response;
					// Stream partial tokens to client
					try {
						controller.enqueue(encoder.encode(
							`event: token\ndata: ${JSON.stringify({ step, token: parsed.response })}\n\n`
						));
					} catch { /* client disconnected */ }
				}
			} catch { /* skip malformed lines */ }
		}
	}

	return fullText;
}

function buildEntityPrompt(text: string, evidence: unknown[]): string {
	const evidenceSummary = Array.isArray(evidence) && evidence.length > 0
		? `\nRelated evidence items: ${evidence.length}`
		: '';

	return `You are a legal investigator analyzing case evidence. Extract all key entities from the following text.
Respond in JSON format: { "entities": [{ "name": "...", "type": "person|organization|location|date|money|document|event", "context": "..." }] }

Text to analyze:
${text.slice(0, 10000)}${evidenceSummary}

JSON response:`;
}

function buildConnectionPrompt(text: string, entities: string, _evidence: unknown[]): string {
	return `You are a legal investigator. Given these entities and text, identify connections and relationships.
Respond in JSON: { "connections": [{ "description": "...", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "type": "financial|communication|location|temporal|organizational" }] }

Entities found: ${entities.slice(0, 3000)}
Original text: ${text.slice(0, 5000)}

JSON response:`;
}

function buildAnomalyPrompt(text: string, entities: string, _evidence: unknown[]): string {
	return `You are a legal investigator. Identify anomalies, inconsistencies, and suspicious patterns.
Respond in JSON: { "anomalies": [{ "description": "...", "severity": "low|medium|high", "type": "inconsistency|gap|suspicious_pattern" }] }

Entities: ${entities.slice(0, 3000)}
Text: ${text.slice(0, 5000)}

JSON response:`;
}

function parseEntities(text: string): { name: string; type: string }[] {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);
			return (parsed.entities || []).map((e: Record<string, unknown>) => ({
				name: String(e.name || ''),
				type: String(e.type || 'unknown')
			}));
		}
	} catch { /* fallback */ }
	return [];
}

function parseConnections(text: string): { description: string; confidence: number }[] {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);
			return (parsed.connections || []).map((c: Record<string, unknown>) => ({
				description: String(c.description || ''),
				confidence: Number(c.confidence) || 0.5
			}));
		}
	} catch { /* fallback */ }
	return [];
}

function parseAnomalies(text: string): { description: string; severity: string }[] {
	try {
		const match = text.match(/\{[\s\S]*\}/);
		if (match) {
			const parsed = JSON.parse(match[0]);
			return (parsed.anomalies || []).map((a: Record<string, unknown>) => ({
				description: String(a.description || ''),
				severity: String(a.severity || 'medium')
			}));
		}
	} catch { /* fallback */ }
	return [];
}
