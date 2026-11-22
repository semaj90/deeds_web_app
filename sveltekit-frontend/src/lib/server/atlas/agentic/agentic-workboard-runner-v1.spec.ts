import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	buildDspyRepairExampleEnvelopeV1,
	runAgenticWorkboardGateV1,
	runWorkboardAndPromotionLoopV1,
	type KanbanAcePacketInputV1
} from './agentic-workboard-runner-v1.js';

describe('AgenticWorkboardRunnerV1 (ACE Packet + Subprompt + GPU Guard + FSM)', () => {
	it('wires crime-scene-kanban-ace-packet-v1.json through Subprompt, GPU lease, and FSM acceptance', () => {
		const packetPath = resolve(
			process.cwd(),
			'../docs/reports/crime-scene-kanban-ace-packet-v1.json'
		);
		const acePacket = JSON.parse(readFileSync(packetPath, 'utf8')) as KanbanAcePacketInputV1;
		const firstTaskId = acePacket.ContextBlob.prefillTasks[0]!.taskId;

		const result = runAgenticWorkboardGateV1({
			requestId: 'req-workboard-1',
			executionId: 'exec-workboard-1',
			acePacket,
			gpuRequest: { workerId: 'cpu-or-small-mlp', requiredMiB: 512, freeVramMiB: 1348 },
			subpromptResponse: {
				requestId: 'req-workboard-1',
				contextManifestChecksum: `sha256:${acePacket.packetSha256}`,
				citedEvidenceIds: [firstTaskId],
				proposalPayload: { targetTaskId: firstTaskId }
			},
			proposedNextActionId: 'run_focused_playwright_verify'
		});

		expect(result.planReceipt.toState).toBe('PLAN_VALIDATED');
		expect(result.planReceipt.canonicalAuthority).toBe(false);
		expect(result.planReceipt.writesPerformed).toBe(false);
		expect(result.gpuLease?.admitted).toBe(true);
		expect(result.admittedActionId).toBe('run_focused_playwright_verify');
	});

	it('blocks on GPU_RESIDENCY_BUDGET_EXCEEDED or unallowed task citations', () => {
		const packetPath = resolve(
			process.cwd(),
			'../docs/reports/crime-scene-kanban-ace-packet-v1.json'
		);
		const acePacket = JSON.parse(readFileSync(packetPath, 'utf8')) as KanbanAcePacketInputV1;

		expect(() =>
			runAgenticWorkboardGateV1({
				requestId: 'req-fail-vram',
				executionId: 'exec-fail-vram',
				acePacket,
				gpuRequest: { workerId: 'heavy-cutile', requiredMiB: 2048, freeVramMiB: 1348 },
				subpromptResponse: {
					requestId: 'req-fail-vram',
					contextManifestChecksum: `sha256:${acePacket.packetSha256}`,
					citedEvidenceIds: [],
					proposalPayload: {}
				},
				proposedNextActionId: 'run_focused_playwright_verify'
			})
		).toThrow(/GPU_RESIDENCY_BUDGET_EXCEEDED/);

		expect(() =>
			runAgenticWorkboardGateV1({
				requestId: 'req-fail-cite',
				executionId: 'exec-fail-cite',
				acePacket,
				subpromptResponse: {
					requestId: 'req-fail-cite',
					contextManifestChecksum: `sha256:${acePacket.packetSha256}`,
					citedEvidenceIds: ['UNLISTED-FAKE-TASK'],
					proposalPayload: {}
				},
				proposedNextActionId: 'run_focused_playwright_verify'
			})
		).toThrow(/SUBPROMPT_UNALLOWED_EVIDENCE_ID/);
	});

	it('validates dspy-workboard-subprompt.okf.json and emits atlas.agentic-repair-example.v1 envelope', () => {
		const okf = JSON.parse(
			readFileSync(
				resolve(process.cwd(), '../docs/contracts/dspy-workboard-subprompt.okf.json'),
				'utf8'
			)
		) as {
			schema: string;
			exampleSchema: string;
			rules: { canonical_authority: boolean; auto_promote_allowed: boolean };
		};
		expect(okf.schema).toBe('atlas.dspy_workboard_subprompt.v1');
		expect(okf.exampleSchema).toBe('atlas.agentic-repair-example.v1');
		expect(okf.rules.canonical_authority).toBe(false);
		expect(okf.rules.auto_promote_allowed).toBe(false);

		const env = buildDspyRepairExampleEnvelopeV1({
			taskId: 'CASE-SCENE-LIVE-03-video-clock',
			canonicalId: 'openspec:crime-scene-reconstruction:CASE-SCENE-LIVE-03',
			packetKey: 'packet:demo001',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			workspaceRevision: `sha256:${'b'.repeat(64)}`,
			filePath: 'src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte',
			startByte: 0,
			endByte: 120,
			errorMessage: 'captionScope undefined',
			candidateIds: ['cand-1'],
			validatorId: 'svelte-check-native'
		});
		expect(env.schema).toBe('atlas.agentic-repair-example.v1');
		expect(env.sourceRefs[0]?.locator.filePath).toContain('SceneRuntimeRecipeCanvas.svelte');
	});

	it('executes full closed-loop workboard + OaK judge + GEPA held-out promotion receipt', () => {
		const packetPath = resolve(
			process.cwd(),
			'../docs/reports/crime-scene-kanban-ace-packet-v1.json'
		);
		const acePacket = JSON.parse(readFileSync(packetPath, 'utf8')) as KanbanAcePacketInputV1;
		const firstTaskId = acePacket.ContextBlob.prefillTasks[0]!.taskId;

		const { workboard, promotion } = runWorkboardAndPromotionLoopV1({
			workboard: {
				requestId: 'req-loop-1',
				executionId: 'exec-loop-1',
				acePacket,
				subpromptResponse: {
					requestId: 'req-loop-1',
					contextManifestChecksum: `sha256:${acePacket.packetSha256}`,
					citedEvidenceIds: [firstTaskId],
					proposalPayload: { targetTaskId: firstTaskId }
				},
				proposedNextActionId: 'run_focused_playwright_verify'
			},
			split: {
				splitId: 'split-workboard-1',
				trainIds: ['t1'],
				validationIds: ['v1'],
				heldOutTestIds: ['h1']
			},
			receipts: {
				candidateChecksum: acePacket.packetSha256,
				svelteCheckErrors: 0,
				vitestPassed: 12,
				vitestFailed: 0,
				retrievalPromotionStatus: 'PROVEN',
				heldOutPassRate: 0.95,
				baselineHeldOutPassRate: 0.9
			},
			consumedCandidateChecksums: new Set(),
			humanReview: { reviewerId: 'james', approved: true }
		});

		expect(workboard.planReceipt.toState).toBe('PLAN_VALIDATED');
		expect(promotion.approved).toBe(true);
		expect(promotion.receiptChecksum).toMatch(/^[0-9a-f]{64}$/);
	});
});
