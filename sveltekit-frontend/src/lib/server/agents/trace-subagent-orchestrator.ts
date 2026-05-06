import { db } from '$lib/server/db/client';

import { sql } from 'drizzle-orm';
import { kagDagRuns, kagDagNodes } from '$lib/server/db/schema.js';
import { ontologySortationAgent } from './ontology-sortation-agent.js';
import { memoryEncodingAgent } from './memory-encoding-agent.js';
import type {
	TraceSubagentContext,
	TraceSubagentResult,
	TraceSubagentName
} from './trace-subagent-registry.js';

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

		// 5. LLM Synthesis (Stub for now)
		const synthesis = await runAndPersistStub('llm_synthesis', ctx, runUuid);
		results.push(synthesis);
		ctx.synthesis = 'Synthesis from TRACE subagents';

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

	} catch (error) {
		console.error('[orchestrator] DAG execution interrupted:', error);
		await db.update(kagDagRuns).set({ status: 'failed', metadata: { error: String(error) } }).where(sql`id = ${runUuid}`);
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
