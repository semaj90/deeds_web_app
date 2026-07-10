import crypto from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';

type LangGraphCheckpointer = {
	setup: () => Promise<void>;
};

let checkpointerPromise: Promise<LangGraphCheckpointer | null> | null = null;

function isTruthy(value: string | undefined): boolean {
	return typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim());
}

export function isLangGraphCheckpointingEnabled(): boolean {
	return isTruthy(process.env.LANGGRAPH_CHECKPOINT_ENABLED) || isTruthy(process.env.AGENT_GRAPH_CHECKPOINTING);
}

export async function getLangGraphCheckpointer(): Promise<LangGraphCheckpointer | null> {
	if (!isLangGraphCheckpointingEnabled()) return null;
	if (!checkpointerPromise) {
		checkpointerPromise = (async () => {
			try {
				const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');
				const checkpointer = PostgresSaver.fromConnString(ENV.DATABASE_URL, {
					schema: process.env.LANGGRAPH_CHECKPOINT_SCHEMA ?? 'langgraph',
				});
				await checkpointer.setup();
				return checkpointer;
			} catch (err) {
				console.warn('[LangGraph] Postgres checkpointer unavailable:', err instanceof Error ? err.message : String(err));
				return null;
			}
		})();
	}
	return checkpointerPromise;
}

export function buildLangGraphConfig(
	threadId?: string,
	runId?: string,
	checkpointNs = ''
): {
	configurable: Record<string, string>;
} {
	const resolvedThreadId = threadId?.trim() || crypto.randomUUID();
	const configurable: Record<string, string> = {
		thread_id: resolvedThreadId,
	};
	if (runId?.trim()) configurable.run_id = runId.trim();
	if (checkpointNs.trim()) configurable.checkpoint_ns = checkpointNs.trim();
	return { configurable };
}

export function resetLangGraphCheckpointerForTests(): void {
	checkpointerPromise = null;
}
