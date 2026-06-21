/**
 * GRPO Strategy Engine — 4-Step Reasoning Chain
 *
 * Group Relative Policy Optimization "thinking" for courtroom simulation.
 * Runs RAG + KAG + Semantic searches against case data, then synthesizes
 * exactly 4 strategic recommendations via LLM with who/what/why/how taxonomy.
 *
 * Steps:
 *   1. RAG — hybridSearch legal_canon_chunks (BM42 + dense + RRF)
 *   2. KAG — Neo4j knowledge graph neighbors
 *   3. Semantic — hybridSearch fictional_case_chunks + legal_cases
 *   4. LLM Synthesis — generate 6 candidates, self-rank, return top 4
 */

import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint, ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';
// SimulationSession is exported from the simulation API route
type SimulationSession = import('../../../routes/api/simulation/+server').SimulationSession;
import type { StrategyRecommendation, StrategyResult, SearchTimings } from './grpo-types.js';

// Re-export types for consumers
export type { StrategyRecommendation, StrategyResult };

// Zod schema for structured LLM output
const strategyOutputSchema = z.object({
	thinking: z.string().describe('Chain-of-thought reasoning about the case'),
	recommendations: z.array(z.object({
		role: z.string().describe('Wizard persona name'),
		who: z.string().describe('Target party this strategy involves'),
		what: z.string().describe('Specific legal action or argument'),
		why: z.string().describe('Legal reasoning with citations'),
		how: z.string().describe('Step-by-step execution plan'),
		confidence: z.number().min(0).max(1).describe('Self-evaluated confidence'),
	})).min(4).max(4).describe('Exactly 4 top-ranked strategies'),
});

// ── Step 1: RAG Retrieval ────────────────────────────────────────────────────

interface RAGResult {
	chunks: Array<{ chunkId: string; citation: string; content: string; score: number }>;
	timing_ms: number;
}

async function ragRetrieval(session: SimulationSession): Promise<RAGResult> {
	const start = performance.now();
	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');

		const phase = session.phases[session.currentPhase] ?? 'trial';
		const chargeList = session.charges.map(c => c.chargeName).join(', ');
		const query = `${phase.replace(/_/g, ' ')} ${chargeList} ${session.caseData.jurisdiction} ${session.caseData.primaryStatute ?? ''}`.trim();

		const embedResult = await generateEmbeddings([query]);
		const queryVector = embedResult.vectors?.[0];
		if (!queryVector || queryVector.length !== 768) {
			return { chunks: [], timing_ms: Math.round(performance.now() - start) };
		}

		const mustConditions: Array<{ key: string; match: { value: string } }> = [];
		if (session.caseData.jurisdiction) {
			mustConditions.push({ key: 'jurisdiction', match: { value: session.caseData.jurisdiction } });
		}

		const result = await qdrant.hybridSearch({
			collection: 'legal_canon_chunks',
			queryEmbedding: queryVector,
			query,
			limit: 5,
			scoreThreshold: 0.30,
			filters: mustConditions.length > 0 ? { must: mustConditions } : undefined,
		}).catch(() => ({ results: [] }));

		const hits = (result as any).results ?? [];
		const chunks = hits.map((h: Record<string, any>) => ({
			chunkId: String(h.payload?.chunk_id ?? h.id ?? ''),
			citation: String(h.payload?.citation ?? h.payload?.chunk_id ?? ''),
			content: String(h.payload?.content ?? h.payload?.text ?? '').slice(0, 400),
			score: Number(h.score ?? 0),
		}));

		return { chunks, timing_ms: Math.round(performance.now() - start) };
	} catch {
		return { chunks: [], timing_ms: Math.round(performance.now() - start) };
	}
}

// ── Step 2: KAG Neighbors ────────────────────────────────────────────────────

interface KAGResult {
	neighbors: Array<{ nodeId: string; title: string; relationship: string }>;
	timing_ms: number;
}

async function kagRetrieval(session: SimulationSession): Promise<KAGResult> {
	const start = performance.now();
	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver = getNeo4jDriver();
		const neo4jSession = driver.session({ database: 'neo4j' });
		try {
			// Query for case-related legal concepts, statutes, precedents
			const result = await neo4jSession.run(
				`MATCH (c:Case {id: $caseId})-[r]-(n)
				 RETURN n.id AS nodeId, n.title AS title, type(r) AS relationship
				 LIMIT 10`,
				{ caseId: session.caseId }
			);
			const neighbors = result.records.map((rec) => ({
				nodeId: String(rec.get('nodeId') ?? ''),
				title: String(rec.get('title') ?? ''),
				relationship: String(rec.get('relationship') ?? ''),
			}));
			return { neighbors, timing_ms: Math.round(performance.now() - start) };
		} finally {
			await neo4jSession.close();
		}
	} catch {
		// Neo4j unavailable — degrade gracefully
		return { neighbors: [], timing_ms: Math.round(performance.now() - start) };
	}
}

// ── Step 3: Semantic / DAG Search ────────────────────────────────────────────

interface SemanticResult {
	cases: Array<{ id: string; title: string; summary: string; score: number }>;
	timing_ms: number;
}

async function semanticRetrieval(session: SimulationSession): Promise<SemanticResult> {
	const start = performance.now();
	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');

		// Query based on narrative + charge for case similarity
		const query = `${session.caseData.charge} ${session.caseData.narrative.slice(0, 200)} ${session.caseData.category}`;
		const embedResult = await generateEmbeddings([query]);
		const queryVector = embedResult.vectors?.[0];
		if (!queryVector || queryVector.length !== 768) {
			return { cases: [], timing_ms: Math.round(performance.now() - start) };
		}

		// Search both fictional cases and real precedents in parallel
		const [fictionalResult, precedentResult] = await Promise.all([
			qdrant.hybridSearch({
				collection: 'fictional_case_chunks',
				queryEmbedding: queryVector,
				query,
				limit: 3,
				scoreThreshold: 0.30,
			}).catch(() => ({ results: [] })),
			qdrant.hybridSearch({
				collection: 'legal_cases',
				queryEmbedding: queryVector,
				query,
				limit: 3,
				scoreThreshold: 0.30,
			}).catch(() => ({ results: [] })),
		]);

		const mapHits = (hits: any[]) => hits.map((h: Record<string, any>) => ({
			id: String(h.id ?? ''),
			title: String(h.payload?.title ?? h.payload?.case_name ?? ''),
			summary: String(h.payload?.summary ?? h.payload?.content ?? h.payload?.text ?? '').slice(0, 300),
			score: Number(h.score ?? 0),
		}));

		const allCases = [
			...mapHits((fictionalResult as any).results ?? []),
			...mapHits((precedentResult as any).results ?? []),
		].sort((a, b) => b.score - a.score).slice(0, 5);

		return { cases: allCases, timing_ms: Math.round(performance.now() - start) };
	} catch {
		return { cases: [], timing_ms: Math.round(performance.now() - start) };
	}
}

// ── Step 4: LLM Synthesis ────────────────────────────────────────────────────

function buildSynthesisPrompt(
	session: SimulationSession,
	rag: RAGResult,
	kag: KAGResult,
	semantic: SemanticResult,
): { system: string; user: string } {
	const phase = session.phases[session.currentPhase] ?? 'trial';
	const chargeList = session.charges.map(c => `${c.chargeName}${c.statute ? ' (' + c.statute + ')' : ''}`).join('; ');
	const actorList = session.actors.map(a => `${a.name} (${a.role})`).join('; ');
	const eventTimeline = session.events
		.sort((a, b) => a.orderIndex - b.orderIndex)
		.slice(0, 8)
		.map(e => `[${e.eventType}] ${e.description.slice(0, 100)}`)
		.join('\n');

	const ragBlock = rag.chunks.length > 0
		? 'Legal Canon (RAG):\n' + rag.chunks.map(c => `[${c.citation}] ${c.content}`).join('\n')
		: 'Legal Canon: No results retrieved.';

	const kagBlock = kag.neighbors.length > 0
		? 'Knowledge Graph (KAG):\n' + kag.neighbors.map(n => `${n.title} —[${n.relationship}]`).join('\n')
		: 'Knowledge Graph: No graph neighbors found.';

	const semanticBlock = semantic.cases.length > 0
		? 'Similar Cases (Semantic):\n' + semantic.cases.map(c => `${c.title}: ${c.summary}`).join('\n')
		: 'Similar Cases: No similar cases found.';

	const recentDialogue = session.dialogueHistory
		.slice(-4)
		.map(d => `[${d.role.toUpperCase()}] ${d.speaker}: ${d.content.slice(0, 200)}`)
		.join('\n');

	const system = `You are a GRPO Strategy Wizard for a fictional courtroom simulation. Your task is to analyze all available evidence and generate EXACTLY 4 strategic recommendations.

IMPORTANT: This is a FICTIONAL simulation for educational purposes only.

For each recommendation, assign a unique wizard persona role:
1. "Legal Strategist" — focuses on procedural and argumentative strategy
2. "Evidence Analyst" — focuses on physical/documentary evidence strength
3. "Procedural Expert" — focuses on rules of procedure and admissibility
4. "Case Historian" — focuses on precedent patterns and similar case outcomes

GRPO Process:
- Generate 6 candidate strategies internally
- Self-rank them by comparing each against the others (group-relative comparison)
- Return ONLY the top 4 with confidence scores reflecting relative ranking

Each recommendation MUST have:
- who: The target party (witness, defendant, judge, jury, opposing counsel)
- what: A specific, actionable legal strategy
- why: Legal reasoning citing retrieved canon/precedent where available
- how: A concrete 2-3 step execution plan`;

	const user = `Case: ${session.caseData.caseNumber}
Defendant: ${session.caseData.defendantName}
Charges: ${chargeList}
Jurisdiction: ${session.caseData.jurisdiction}
Procedure: ${session.procedureType}
Current Phase: ${phase.replace(/_/g, ' ')}
Narrative: ${session.caseData.narrative.slice(0, 400)}

Actors: ${actorList}

Event Timeline:
${eventTimeline}

Recent Proceedings:
${recentDialogue || '(No dialogue yet)'}

--- RETRIEVED EVIDENCE ---

${ragBlock}

${kagBlock}

${semanticBlock}

--- END EVIDENCE ---

Generate your chain-of-thought analysis in "thinking", then produce exactly 4 ranked strategy recommendations.`;

	return { system, user };
}

export async function generateStrategyRecommendations(
	session: SimulationSession,
): Promise<StrategyResult> {
	const totalStart = performance.now();

	// Run RAG + KAG + Semantic in parallel (all fault-tolerant)
	const [rag, kag, semantic] = await Promise.all([
		ragRetrieval(session),
		kagRetrieval(session),
		semanticRetrieval(session),
	]);

	// Build canon refs from RAG results
	const ragCanonRefs = rag.chunks.map(c => c.chunkId).filter(Boolean);

	// Determine which sources contributed
	const buildSources = (): StrategyRecommendation['sources'][] => {
		const base: StrategyRecommendation['sources'] = [];
		if (rag.chunks.length > 0) base.push('rag');
		if (kag.neighbors.length > 0) base.push('kag');
		if (semantic.cases.length > 0) base.push('semantic');
		return [base, base, base, base];
	};
	const sourceSets = buildSources();

	// Step 4: LLM Synthesis
	const synthStart = performance.now();
	const { system, user } = buildSynthesisPrompt(session, rag, kag, semantic);

	try {
		const res = await ollamaFetch(`${getOllamaEndpoint()}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				stream: false,
				format: strategyOutputSchema,
				options: { temperature: 0.8, num_predict: 2048 },
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) {
			throw new Error(`Ollama returned ${res.status}`);
		}

		const data = await res.json();
		const content = data.message?.content || data.response || '';

		// Parse structured output
		let parsed: z.infer<typeof strategyOutputSchema>;
		try {
			parsed = strategyOutputSchema.parse(JSON.parse(content));
		} catch {
			// If structured output failed, try extracting JSON from response
			const jsonMatch = content.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
			if (jsonMatch) {
				parsed = strategyOutputSchema.parse(JSON.parse(jsonMatch[0]));
			} else {
				throw new Error('Failed to parse LLM structured output');
			}
		}

		const synthesis_ms = Math.round(performance.now() - synthStart);

		const recommendations: StrategyRecommendation[] = parsed.recommendations.map((rec, i) => ({
			...rec,
			canonRefs: ragCanonRefs.slice(0, 3),
			sources: sourceSets[i] ?? [],
		}));

		return {
			recommendations,
			thinking: parsed.thinking,
			searchTimings: {
				rag_ms: rag.timing_ms,
				kag_ms: kag.timing_ms,
				semantic_ms: semantic.timing_ms,
				synthesis_ms,
				total_ms: Math.round(performance.now() - totalStart),
			},
		};
	} catch (err) {
		// LLM failed — return fallback recommendations based on search results
		const synthesis_ms = Math.round(performance.now() - synthStart);
		return {
			recommendations: buildFallbackRecommendations(session, rag, kag, semantic, ragCanonRefs, sourceSets),
			thinking: `LLM synthesis unavailable. Fallback recommendations generated from ${rag.chunks.length} RAG chunks, ${kag.neighbors.length} KAG neighbors, ${semantic.cases.length} similar cases.`,
			searchTimings: {
				rag_ms: rag.timing_ms,
				kag_ms: kag.timing_ms,
				semantic_ms: semantic.timing_ms,
				synthesis_ms,
				total_ms: Math.round(performance.now() - totalStart),
			},
		};
	}
}

// ── Fallback recommendations when LLM is unavailable ─────────────────────────

function buildFallbackRecommendations(
	session: SimulationSession,
	rag: RAGResult,
	kag: KAGResult,
	semantic: SemanticResult,
	canonRefs: string[],
	sourceSets: StrategyRecommendation['sources'][],
): StrategyRecommendation[] {
	const phase = session.phases[session.currentPhase] ?? 'trial';
	const charge = session.caseData.charge;

	return [
		{
			role: 'Legal Strategist',
			who: 'Defense Counsel',
			what: `Challenge the prosecution's burden of proof for ${charge}`,
			why: rag.chunks[0]
				? `Per ${rag.chunks[0].citation}: ${rag.chunks[0].content.slice(0, 150)}`
				: 'The prosecution must prove every element beyond a reasonable doubt.',
			how: '1. Identify weakest element of the charge. 2. Prepare cross-examination targeting that element. 3. Move for directed verdict if burden unmet.',
			confidence: 0.6,
			canonRefs: canonRefs.slice(0, 2),
			sources: sourceSets[0] ?? [],
		},
		{
			role: 'Evidence Analyst',
			who: 'Witness',
			what: `Scrutinize physical evidence chain of custody in ${phase.replace(/_/g, ' ')} phase`,
			why: semantic.cases[0]
				? `Similar case pattern: ${semantic.cases[0].title} — ${semantic.cases[0].summary.slice(0, 100)}`
				: 'Evidence authenticity and chain of custody are foundational to admissibility.',
			how: '1. Request authentication documents. 2. Cross-examine handling officers. 3. File motion to suppress if gaps found.',
			confidence: 0.55,
			canonRefs: canonRefs.slice(0, 1),
			sources: sourceSets[1] ?? [],
		},
		{
			role: 'Procedural Expert',
			who: 'Judge',
			what: 'File motion in limine to exclude prejudicial evidence',
			why: kag.neighbors[0]
				? `Knowledge graph link: ${kag.neighbors[0].title} (${kag.neighbors[0].relationship})`
				: 'FRE 403 balancing test — probative value vs. unfair prejudice.',
			how: '1. Identify most prejudicial exhibit. 2. Draft motion citing FRE 403. 3. Present oral argument at sidebar.',
			confidence: 0.5,
			canonRefs: canonRefs.slice(0, 1),
			sources: sourceSets[2] ?? [],
		},
		{
			role: 'Case Historian',
			who: 'Jury',
			what: `Leverage precedent patterns from similar ${session.caseData.category.replace(/_/g, ' ')} cases`,
			why: semantic.cases.length > 1
				? `${semantic.cases.length} similar cases found — patterns suggest ${semantic.cases[0].summary.slice(0, 100)}`
				: 'Historical case outcomes provide strategic guidance for jury persuasion.',
			how: '1. Research dispositions of similar charges. 2. Craft narrative aligning with favorable precedent. 3. Reference specific outcomes in closing argument.',
			confidence: 0.45,
			canonRefs,
			sources: sourceSets[3] ?? [],
		},
	];
}
