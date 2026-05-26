/**
 * POST /api/knowledge/lint — KB Linting Agent
 *
 * Scans the Qdrant knowledge_base collection for quality issues:
 *   1. Duplicates — near-identical vectors (cosine > 0.97)
 *   2. Stale entries — indexed_at older than maxAgeDays
 *   3. Contradictions — same topic but divergent content (detected via LLM)
 *
 * Body: { dryRun?: boolean, maxAgeDays?: number, dupThreshold?: number, checkContradictions?: boolean, limit?: number }
 * Returns: { duplicates, stale, contradictions, summary }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const QDRANT_URL = ENV.QDRANT_URL;
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const COLLECTION = 'knowledge_base';

const lintSchema = z.object({
	dryRun: z.boolean().optional().default(true),
	maxAgeDays: z.number().int().min(1).max(365).optional().default(30),
	dupThreshold: z.number().min(0.9).max(1.0).optional().default(0.97),
	checkContradictions: z.boolean().optional().default(false),
	limit: z.number().int().min(10).max(500).optional().default(100),
});

interface QdrantPoint {
	id: string | number;
	payload?: Record<string, unknown>;
	vector?: number[];
}

interface LintIssue {
	type: 'duplicate' | 'stale' | 'contradiction';
	pointIds: (string | number)[];
	reason: string;
	details?: Record<string, unknown>;
}

/** Scroll through Qdrant points with payload + vectors */
async function scrollPoints(limit: number, withVector: boolean): Promise<QdrantPoint[]> {
	const points: QdrantPoint[] = [];
	let offset: string | number | null = null;
	const batchSize = Math.min(limit, 100);

	while (points.length < limit) {
		const body: Record<string, unknown> = {
			limit: batchSize,
			with_payload: true,
			with_vector: withVector,
		};
		if (offset !== null) body.offset = offset;

		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15_000),
		});

		if (!res.ok) break;
		const data = await res.json();
		const batch = data.result?.points ?? [];
		if (batch.length === 0) break;

		points.push(...batch);
		offset = data.result?.next_page_offset ?? null;
		if (offset === null) break;
	}

	return points.slice(0, limit);
}

/** Cosine similarity between two vectors */
function cosineSim(a: number[], b: number[]): number {
	let dot = 0, magA = 0, magB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}

/** Delete points from Qdrant by IDs */
async function deletePoints(ids: (string | number)[]): Promise<boolean> {
	try {
		const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points: ids }),
			signal: AbortSignal.timeout(10_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Use LLM to check if two chunks contradict each other */
async function checkContradiction(textA: string, textB: string): Promise<{ contradicts: boolean; explanation: string }> {
	try {
		const prompt = `You are a legal knowledge base quality checker. Compare these two text chunks and determine if they CONTRADICT each other (state conflicting facts about the same topic).

Chunk A:
${textA.slice(0, 1500)}

Chunk B:
${textB.slice(0, 1500)}

Respond with JSON only: {"contradicts": true/false, "explanation": "brief reason"}`;

		const res = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				prompt,
				stream: false,
				format: 'json',
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) return { contradicts: false, explanation: 'LLM unavailable' };
		const data = await res.json();
		const parsed = JSON.parse(data.response ?? '{}');
		return {
			contradicts: Boolean(parsed.contradicts),
			explanation: String(parsed.explanation ?? ''),
		};
	} catch {
		return { contradicts: false, explanation: 'LLM check failed' };
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = lintSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { dryRun, maxAgeDays, dupThreshold, checkContradictions: doContradictions, limit } = parsed.data;
	const issues: LintIssue[] = [];
	const start = performance.now();

	try {
		// Fetch points (with vectors for duplicate detection)
		const points = await scrollPoints(limit, true);
		if (points.length === 0) {
			return json({ issues: [], summary: { total: 0, duplicates: 0, stale: 0, contradictions: 0 }, durationMs: 0 });
		}

		// 1. Stale entry detection
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
		const cutoffMs = cutoffDate.getTime();

		for (const point of points) {
			const indexedAt = point.payload?.indexed_at ?? point.payload?.uploaded_at;
			if (typeof indexedAt === 'string') {
				const ts = new Date(indexedAt).getTime();
				if (!isNaN(ts) && ts < cutoffMs) {
					issues.push({
						type: 'stale',
						pointIds: [point.id],
						reason: `Indexed ${Math.round((Date.now() - ts) / 86_400_000)} days ago (threshold: ${maxAgeDays}d)`,
						details: { indexed_at: indexedAt, document_name: point.payload?.document_name },
					});
				}
			}
		}

		// 2. Duplicate detection (pairwise cosine on vectors)
		const withVectors = points.filter((p) => Array.isArray(p.vector) && p.vector.length > 0);
		const dupPairs = new Set<string>();

		for (let i = 0; i < withVectors.length; i++) {
			for (let j = i + 1; j < withVectors.length; j++) {
				const sim = cosineSim(withVectors[i].vector!, withVectors[j].vector!);
				if (sim >= dupThreshold) {
					const key = `${withVectors[i].id}:${withVectors[j].id}`;
					if (!dupPairs.has(key)) {
						dupPairs.add(key);
						issues.push({
							type: 'duplicate',
							pointIds: [withVectors[i].id, withVectors[j].id],
							reason: `Cosine similarity ${sim.toFixed(4)} >= ${dupThreshold}`,
							details: {
								docA: withVectors[i].payload?.document_name,
								docB: withVectors[j].payload?.document_name,
							},
						});
					}
				}
			}
		}

		// 3. Contradiction detection (LLM-based, opt-in, limited)
		if (doContradictions) {
			// Group by topic
			const byTopic = new Map<string, QdrantPoint[]>();
			for (const point of points) {
				const topic = String(point.payload?.topic ?? point.payload?.document_name ?? 'unknown');
				const group = byTopic.get(topic) ?? [];
				group.push(point);
				byTopic.set(topic, group);
			}

			// Check pairs within same topic (limit to 10 checks to control LLM cost)
			let contradictionChecks = 0;
			const MAX_CONTRADICTION_CHECKS = 10;

			for (const [topic, group] of byTopic) {
				if (group.length < 2) continue;
				for (let i = 0; i < group.length && contradictionChecks < MAX_CONTRADICTION_CHECKS; i++) {
					for (let j = i + 1; j < group.length && contradictionChecks < MAX_CONTRADICTION_CHECKS; j++) {
						const textA = String(group[i].payload?.content ?? '');
						const textB = String(group[j].payload?.content ?? '');
						if (textA.length < 50 || textB.length < 50) continue;

						contradictionChecks++;
						const result = await checkContradiction(textA, textB);
						if (result.contradicts) {
							issues.push({
								type: 'contradiction',
								pointIds: [group[i].id, group[j].id],
								reason: result.explanation,
								details: { topic },
							});
						}
					}
				}
			}
		}

		// Execute deletions if not dry run
		let deleted = 0;
		if (!dryRun) {
			// Only delete duplicates (keep the first, remove the second) and stale entries
			const toDelete = new Set<string | number>();

			for (const issue of issues) {
				if (issue.type === 'stale') {
					issue.pointIds.forEach((id) => toDelete.add(id));
				} else if (issue.type === 'duplicate') {
					// Keep first, delete second
					if (issue.pointIds.length > 1) toDelete.add(issue.pointIds[1]);
				}
				// Never auto-delete contradictions — human review needed
			}

			if (toDelete.size > 0) {
				const success = await deletePoints([...toDelete]);
				if (success) deleted = toDelete.size;
			}
		}

		const summary = {
			totalPoints: points.length,
			duplicates: issues.filter((i) => i.type === 'duplicate').length,
			stale: issues.filter((i) => i.type === 'stale').length,
			contradictions: issues.filter((i) => i.type === 'contradiction').length,
			totalIssues: issues.length,
			deleted,
			dryRun,
		};

		return json({
			success: true,
			issues,
			summary,
			durationMs: Math.round(performance.now() - start),
		});
	} catch (err) {
		console.error('[/api/knowledge/lint] Failed:', (err as Error)?.message);
		return json({ error: 'KB lint failed' }, { status: 500 });
	}
};
