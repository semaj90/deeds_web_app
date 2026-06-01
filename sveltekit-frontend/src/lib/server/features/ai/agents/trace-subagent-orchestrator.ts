import { db } from '$lib/server/db/client';

import { sql } from 'drizzle-orm';
import { kagDagRuns, kagDagNodes } from '$lib/server/db/schema.js';
import { ontologySortationAgent } from '../../../agents/ontology-sortation-agent.js';
import { memoryEncodingAgent } from '../../../agents/memory-encoding-agent.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { archiveSynthesisMemory } from '$lib/server/indexer/synthesis-memory-archiver.js';
import { appendOutcomeLedger } from '$lib/server/observability/outcome-ledger.js';
import type {
	TraceSubagentContext,
	TraceSubagentResult,
	TraceSubagentName
} from '../../../agents/trace-subagent-registry.js';

/**
 * TRACE Subagent Orchestrator
 * 
 * Orchestrates the DAG of subagents and persists results for auditability.
 */
export async function runTraceSubagentDag(ctx: TraceSubagentContext) {
	const results: TraceSubagentResult[] = [];
	const t0 = Date.now();
	const runUuid = crypto.randomUUID();

	// Create run record
	await db.insert(kagDagRuns).values({
		id: runUuid,
		query: ctx.query || 'unspecified',
		queryHash: ctx.runId,
		status: 'running',
		metadata: { runId: ctx.runId }
	});

	try {
		// 1. Ontology Sortation
		const ontology = await runAndPersist(ontologySortationAgent, ctx, runUuid);
		results.push(ontology);
		if (ontology.status === 'failed') throw new Error('Ontology agent failed');
		ctx.ontology = ontology.output;

		// 2. Chunk Stream Indexing (Stub for now)
		const indexing = await runAndPersistStub('chunk_stream_indexing', ctx, runUuid);
		results.push(indexing);

		// 3. Cluster Mapping (Stub for now)
		const mapping = await runAndPersistStub('cluster_mapping', ctx, runUuid);
		results.push(mapping);

		// 4. Ranking (Stub for now)
		const ranking = await runAndPersistStub('ranking', ctx, runUuid);
		results.push(ranking);

		// 5. LLM Synthesis — reads cluster tags from rankedEvidence, calls inference chain
		const synthesis = await runLlmSynthesis(ctx, runUuid);
		results.push(synthesis);
		ctx.synthesis = synthesis.output?.text ?? '';

		// 6. Memory Encoding
		const memory = await runAndPersist(memoryEncodingAgent, ctx, runUuid);
		results.push(memory);
		ctx.memoryDecision = memory.output;

		// 7. Topology Update (Stub for now)
		const topology = await runAndPersistStub('topology_update', ctx, runUuid);
		results.push(topology);

		// Update run as finished
		await db.update(kagDagRuns).set({
			status: 'ok',
			totalDurationMs: Date.now() - t0,
			finishedAt: new Date()
		}).where(sql`id = ${runUuid}`);

		void appendOutcomeLedger({
			source: 'trace-subagent-orchestrator',
			runId: ctx.runId,
			runUuid,
			query: ctx.query,
			status: 'ok',
			durationMs: Date.now() - t0
		});

	} catch (error) {
		console.error('[orchestrator] DAG execution interrupted:', error);
		await db.update(kagDagRuns).set({ status: 'failed', metadata: { error: String(error) } }).where(sql`id = ${runUuid}`);
		
		void appendOutcomeLedger({
			source: 'trace-subagent-orchestrator',
			runId: ctx.runId,
			runUuid,
			query: ctx.query,
			status: 'failed',
			error: String(error),
			durationMs: Date.now() - t0
		});
	}

	return {
		runId: ctx.runId,
		runUuid,
		totalDurationMs: Date.now() - t0,
		results
	};
}

async function runAndPersist(agent: any, ctx: TraceSubagentContext, runUuid: string): Promise<TraceSubagentResult> {
	const t0 = Date.now();
	const result = await agent.run(ctx);
	
	await db.insert(kagDagNodes).values({
		runId: runUuid,
		nodeKey: agent.name,
		nodeType: 'agent',
		status: result.status,
		durationMs: Date.now() - t0,
		output: result.output,
	});

	return result;
}

async function runLlmSynthesis(ctx: TraceSubagentContext, runUuid: string): Promise<TraceSubagentResult> {
	const t0 = Date.now();
	try {
		// Group rankedEvidence by cluster_key / topo_class for cluster-aware prompt
		const evidence: Array<Record<string, unknown>> = ctx.rankedEvidence ?? ctx.ontology ?? [];
		const clusterMap = new Map<string, string[]>();
		for (const e of evidence.slice(0, 20)) {
			const key = String((e as Record<string, unknown>)['cluster_key'] ?? (e as Record<string, unknown>)['topo_class'] ?? 'general');
			const text = String((e as Record<string, unknown>)['content'] ?? (e as Record<string, unknown>)['text'] ?? '').slice(0, 300);
			if (!text) continue;
			const bucket = clusterMap.get(key) ?? [];
			bucket.push(text);
			clusterMap.set(key, bucket);
		}

		const clusterLines = [...clusterMap.entries()].slice(0, 5).map(([cluster, texts]) =>
			`**${cluster}**: ${texts.slice(0, 2).join(' | ')}`
		).join('\n');

		const prompt = [
			`Query: ${ctx.query ?? 'codebase analysis'}`,
			'',
			'Relevant context by cluster:',
			clusterLines || '(no cluster evidence available)',
			'',
			'Provide a concise technical synthesis of the above context. Focus on cross-cluster patterns and actionable insights.',
		].join('\n');

		const messages = [{ role: 'user' as const, content: prompt }];
		const response = await bifrostChat(messages, 'gemma4-rotorquant:latest', { temperature: 0.2, maxTokens: 600 });
		const text = String(response ?? '');

		// Fire-and-forget archive to synthesis_memory_768
		archiveSynthesisMemory({
			title: `TRACE synthesis: ${(ctx.query ?? '').slice(0, 80)}`,
			content: text,
			source: `trace:${ctx.runId}`,
			tags: [...clusterMap.keys()].slice(0, 8),
			metadata: { runId: ctx.runId, clusterCount: clusterMap.size },
		}).catch(() => {});

		const durationMs = Date.now() - t0;
		await db.insert(kagDagNodes).values({
			runId: runUuid, nodeKey: 'llm_synthesis', nodeType: 'agent',
			status: 'ok', durationMs, output: { text: text.slice(0, 500), clusterCount: clusterMap.size },
		});

		return { agent: 'llm_synthesis', status: 'ok', durationMs, output: { text } };
	} catch (error) {
		const durationMs = Date.now() - t0;
		await db.insert(kagDagNodes).values({
			runId: runUuid, nodeKey: 'llm_synthesis', nodeType: 'agent',
			status: 'failed', durationMs, output: {},
		}).catch(() => {});
		return { agent: 'llm_synthesis', status: 'failed', durationMs, error: String(error), output: { text: '' } };
	}
}

async function runAndPersistStub(name: TraceSubagentName, ctx: TraceSubagentContext, runUuid: string): Promise<TraceSubagentResult> {
	const t0 = Date.now();
	const result: TraceSubagentResult = {
		agent: name,
		status: 'ok',
		durationMs: 10,
		output: {},
		metadata: { stub: true }
	};

	await db.insert(kagDagNodes).values({
		runId: runUuid,
		nodeKey: name,
		nodeType: 'agent',
		status: 'ok',
		durationMs: 10,
		output: {},
	});

	return result;
}
