import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { researchSummaries, userResearchTasks } from '$lib/server/db/schema-postgres.js';
import { getDeepResearchStatus, isDeepResearchEnabled, startDeepResearch } from '$lib/server/ai/deep-research-client.js';
import { summarizeDeepResearchInteraction, type DeepResearchImageOutput } from '$lib/server/ai/deep-research-summary.js';

export type ResearchTaskProvider = 'ollama' | 'google';

export interface ResearchTaskResult {
	answer: string;
	pipeline: string;
	durationMs: number | null;
	provider: ResearchTaskProvider;
	summaryId?: string;
	interactionId?: string;
	imageCount?: number;
	images?: DeepResearchImageOutput[];
	thoughtSummaries?: string[];
	error?: string;
}

interface RunResearchTaskOverrides {
	selfPrompt?: string;
	pipelineHint?: string;
	provider?: ResearchTaskProvider;
}

const GOOGLE_DEEP_RESEARCH_POLL_INTERVAL_MS = 5000;
const GOOGLE_DEEP_RESEARCH_MAX_POLLS = 120;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function getProviderFromResult(result: unknown): ResearchTaskProvider {
	const provider = typeof result === 'object' && result !== null
		? (result as Record<string, unknown>).provider
		: null;
	return provider === 'google' ? 'google' : 'ollama';
}

function fnv1a(text: string): string {
	let hash = 2166136261;
	for (let index = 0; index < Math.min(text.length, 512); index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

async function persistResearchSummary(taskId: string, answer: string, pipelineHint: string, selfPrompt: string) {
	const [task] = await db
		.select()
		.from(userResearchTasks)
		.where(eq(userResearchTasks.id, taskId))
		.limit(1);

	const [summary] = await db
		.insert(researchSummaries)
		.values({
			source: 'report',
			pipeline: pipelineHint as 'ace' | 'rag' | 'kag' | 'dag' | 'codebase',
			entityType: 'task_result',
			query: selfPrompt,
			queryHash: fnv1a(selfPrompt),
			title: task?.title ?? selfPrompt.slice(0, 120),
			summary: answer.slice(0, 4000),
			entityTags: [],
			relevanceScore: 0.8,
			userId: task?.userId ?? null,
		})
		.returning({ id: researchSummaries.id });

	return summary?.id;
}

async function runOllamaResearch(selfPrompt: string, pipelineHint: string): Promise<ResearchTaskResult> {
	const { bifrostChat } = await import('$lib/server/ollama.js');
	const systemPrompts: Record<string, string> = {
		rag: 'You are a legal research AI. Provide thorough analysis with citations to relevant statutes and case law.',
		kag: 'You are a legal knowledge graph analyst. Trace relationships between legal concepts, cases, and statutes.',
		dag: 'You are a legal document dependency analyst. Analyze document relationships and precedent chains.',
		ace: 'You are an advanced contextual legal AI. Synthesize information from multiple retrieval pipelines and provide actionable analysis.',
	};
	const system = systemPrompts[pipelineHint] ?? systemPrompts.ace;
	const start = Date.now();
	const answer = await bifrostChat(
		[{ role: 'system', content: system }, { role: 'user', content: selfPrompt }],
		'gemma4-legal:latest',
		{ temperature: 0.3, maxTokens: 1536, timeoutMs: 120_000 },
	);

	return {
		answer,
		pipeline: pipelineHint,
		durationMs: Date.now() - start,
		provider: 'ollama',
	};
}

async function waitForGoogleDeepResearch(interactionId: string) {
	for (let attempt = 0; attempt < GOOGLE_DEEP_RESEARCH_MAX_POLLS; attempt++) {
		const interaction = await getDeepResearchStatus(interactionId);
		const summary = summarizeDeepResearchInteraction(interaction);

		if (summary.status === 'completed' || summary.status === 'failed' || summary.status === 'cancelled') {
			return summary;
		}

		await sleep(GOOGLE_DEEP_RESEARCH_POLL_INTERVAL_MS);
	}

	throw new Error('Google Deep Research timed out before completion');
}

async function runGoogleResearch(selfPrompt: string, pipelineHint: string): Promise<ResearchTaskResult> {
	if (!isDeepResearchEnabled()) {
		throw new Error('GEMINI_API_KEY not configured for Google Deep Research');
	}

	const interaction = await startDeepResearch({
		input: selfPrompt,
		collaborativePlanning: false,
		visualization: 'auto',
		thinkingSummaries: 'auto',
	});

	const summary = await waitForGoogleDeepResearch(interaction.id);
	if (summary.status !== 'completed') {
		throw new Error(summary.error?.message ?? `Google Deep Research ended with status ${summary.status}`);
	}

	return {
		answer: summary.textOutput || 'Google Deep Research completed without text output.',
		pipeline: pipelineHint,
		durationMs: summary.durationMs,
		provider: 'google',
		interactionId: summary.interactionId,
		imageCount: summary.imageCount,
		images: summary.images,
		thoughtSummaries: summary.thoughtSummaries,
	};
}

export async function runResearchTask(taskId: string, overrides: RunResearchTaskOverrides = {}): Promise<void> {
	let provider: ResearchTaskProvider = overrides.provider ?? 'ollama';

	try {
		const [task] = await db
			.select()
			.from(userResearchTasks)
			.where(eq(userResearchTasks.id, taskId))
			.limit(1);

		if (!task) {
			throw new Error('Research task not found');
		}

		const selfPrompt = overrides.selfPrompt ?? task.selfPrompt;
		const pipelineHint = overrides.pipelineHint ?? task.pipelineHint;
		provider = overrides.provider ?? getProviderFromResult(task.result);

		const result = provider === 'google'
			? await runGoogleResearch(selfPrompt, pipelineHint)
			: await runOllamaResearch(selfPrompt, pipelineHint);

		let summaryId: string | undefined;
		try {
			summaryId = await persistResearchSummary(taskId, result.answer, pipelineHint, selfPrompt);
		} catch {
			// Non-fatal. The task still has the full result payload persisted below.
		}

		await db
			.update(userResearchTasks)
			.set({
				status: 'done',
				result: {
					...result,
					summaryId,
				} as Record<string, unknown>,
				notified: false,
				completedAt: new Date(),
			})
			.where(eq(userResearchTasks.id, taskId));
	} catch (error) {
		await db
			.update(userResearchTasks)
			.set({
				status: 'failed',
				result: {
					provider,
					error: error instanceof Error ? error.message : 'Research task execution failed',
				} as Record<string, unknown>,
				completedAt: new Date(),
			})
			.where(eq(userResearchTasks.id, taskId));
	}
}