import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyParentAtlasAgenticReceiptProjectionV1 } from './parent-atlas-agentic-receipt-projection-v1.js';
import type { ParentAtlasTournamentSnapshotV1 } from './parent-atlas-tournament-receipt-aggregator-v1.js';
import { PARENT_ATLAS_TOURNAMENT_GATES_V1, calculateTournamentProgressV1, type TournamentGateV1 } from './parent-atlas-tournament-progress-v1.js';

function baseSnapshot(): ParentAtlasTournamentSnapshotV1 {
	const gates: TournamentGateV1[] = PARENT_ATLAS_TOURNAMENT_GATES_V1.map((gate) => ({ ...gate, state: 'UNPROVEN' }));
	return {
		schema: 'atlas.parent-tournament-snapshot.v1',
		generatedAt: '2026-08-29T00:00:00.000Z',
		promotionCohortTarget: 128,
		progress: calculateTournamentProgressV1(gates, {
			inputTokens: 50,
			outputTokens: 50,
			baselineInputTokens: 100,
			baselineOutputTokens: 100
		}),
		gates,
		sources: [],
		diagnostics: []
	};
}

function event(actionId: string, sequence: number, tokensUsed: number) {
	return {
		schema: 'atlas.workflow-action.v1',
		workflowId: 'wf-agentic',
		workflowRevision: 1,
		sequence,
		actionId,
		dagNodeId: `node-${sequence}`,
		attempt: 1,
		lane: 'a2a',
		transport: 'a2a',
		kind: 'completed',
		state: 'succeeded',
		operation: `agent action ${sequence}`,
		tokensUsed,
		filesEdited: [`src/${actionId}.ts`],
		openspecChange: 'agentic-proof',
		startedAt: '2026-08-29T20:00:00.000Z',
		emittedAt: '2026-08-29T20:00:01.000Z',
		finishedAt: '2026-08-29T20:00:01.000Z'
	};
}

describe('applyParentAtlasAgenticReceiptProjectionV1', () => {
	it('keeps one accepted agent action partial and does not invent token savings', async () => {
		const root = join(tmpdir(), `atlas-agentic-one-${process.pid}-${Date.now()}`);
		try {
			const change = join(root, 'openspec', 'changes', 'agentic-proof');
			await mkdir(change, { recursive: true });
			await writeFile(join(change, 'receipts.jsonl'), `${JSON.stringify(event('agent-a', 1, 1000))}\n`, 'utf8');
			const projected = await applyParentAtlasAgenticReceiptProjectionV1(root, baseSnapshot());
			const gate = projected.gates.find((item) => item.id === 'multi_agent_receipt');
			expect(gate?.state).toBe('PARTIAL');
			expect(gate?.completion).toBe(0.5);
			expect(projected.agenticTelemetry.tokensUsed).toBe(1000);
			expect(projected.progress.efficiency.tokenSavingsPct).toBe(50);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('proves the multi-agent receipt gate with two distinct successful actions', async () => {
		const root = join(tmpdir(), `atlas-agentic-two-${process.pid}-${Date.now()}`);
		try {
			const change = join(root, 'openspec', 'changes', 'agentic-proof');
			await mkdir(change, { recursive: true });
			await writeFile(join(change, 'receipts.jsonl'), [
				JSON.stringify(event('agent-a', 1, 1000)),
				JSON.stringify(event('agent-b', 2, 2000)),
				''
			].join('\n'), 'utf8');
			const projected = await applyParentAtlasAgenticReceiptProjectionV1(root, baseSnapshot());
			const gate = projected.gates.find((item) => item.id === 'multi_agent_receipt');
			expect(gate?.state).toBe('PROVEN');
			expect(projected.agenticTelemetry.acceptedAgentTurns).toBe(2);
			expect(projected.agenticTelemetry.uniqueAgentActions).toBe(2);
			expect(projected.agenticTelemetry.tokensUsed).toBe(3000);
			expect(projected.agenticTelemetry.wallTimeMs).toBe(2000);
			expect(projected.agenticTelemetry.filesEdited).toEqual(['src/agent-a.ts', 'src/agent-b.ts']);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
