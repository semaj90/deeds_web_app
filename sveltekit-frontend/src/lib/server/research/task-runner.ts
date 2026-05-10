import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { researchSummaries, userResearchTasks } from '$lib/server/db/schema-postgres.js';

export type ResearchTaskProvider = 'ollama';

interface ResearchTaskImageOutput {
  src?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  resolution?: string | null;
}

export interface ResearchTaskResult {
  answer: string;
  pipeline: string;
  durationMs: number | null;
  provider: ResearchTaskProvider;
  summaryId?: string;
  interactionId?: string;
  imageCount?: number;
  images?: ResearchTaskImageOutput[];
  thoughtSummaries?: string[];
  error?: string;
}

interface RunResearchTaskOverrides {
  selfPrompt?: string;
  pipelineHint?: string;
  provider?: ResearchTaskProvider;
}

function getProviderFromResult(result: unknown): ResearchTaskProvider {
  const provider =
    typeof result === 'object' && result !== null
      ? (result as Record<string, unknown>).provider
      : null;
  return provider === 'ollama' ? 'ollama' : 'ollama';
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < Math.min(text.length, 512); index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function persistResearchSummary(
  taskId: string,
  answer: string,
  pipelineHint: string,
  selfPrompt: string
) {
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
      userId: task?.userId ? parseInt(task.userId, 10) : null,
    })
    .returning({ id: researchSummaries.id });

  return summary?.id;
}

async function runOllamaResearch(
  selfPrompt: string,
  pipelineHint: string
): Promise<ResearchTaskResult> {
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
    [
      { role: 'system', content: system },
      { role: 'user', content: selfPrompt },
    ],
    'gemma4-legal:latest',
    { temperature: 0.3, maxTokens: 1536, timeoutMs: 120_000 }
  );

  return {
    answer,
    pipeline: pipelineHint,
    durationMs: Date.now() - start,
    provider: 'ollama',
  };
}

export async function runResearchTask(
  taskId: string,
  overrides: RunResearchTaskOverrides = {}
): Promise<void> {
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

    const result = await runOllamaResearch(selfPrompt, pipelineHint);

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