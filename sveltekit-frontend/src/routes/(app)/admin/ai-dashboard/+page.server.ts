import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';
import { buildDailyGraphifyBoardRecommendations } from '$lib/server/atlas/board/daily-graphify-board-recommendations.js';
import { buildDailyGraphifyTaskCandidates } from '$lib/server/atlas/board/graphify-task-candidates.js';
import { loadRuntimeErrorPriorities } from '$lib/server/atlas/board/runtime-error-priorities.js';
import { rankDailyGraphifyBoardTasks } from '$lib/server/atlas/board/daily-graphify-task-priority.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAgenticErrorFixLane } from '$lib/server/atlas/board/agentic-error-fix-lane.js';
import {
	dispatchConflictFreeWorkboardBatchV1,
	type ConflictFreeWorkboardDispatchResultV1,
	type KanbanAcePacketInputV1
} from '$lib/server/atlas/agentic/agentic-workboard-runner-v1.js';
import { loadLatestSvelteEslintRunReceiptV1 } from '$lib/server/admin/svelte-eslint-run-receipt-v1.mjs';

function loadConflictFreeWorkboardDispatch(): ConflictFreeWorkboardDispatchResultV1 | null {
	try {
		const packetPath = resolve(process.cwd(), '../docs/reports/crime-scene-kanban-ace-packet-v1.json');
		if (!existsSync(packetPath)) return null;
		const acePacket = JSON.parse(readFileSync(packetPath, 'utf8')) as KanbanAcePacketInputV1;
		const rows = acePacket.ContextBlob.prefillTasks.slice(0, 8).map((t, idx) => ({
			taskId: t.taskId,
			canonicalTaskKey: `crime-scene-reconstruction:${t.taskId}:${idx + 1}`,
			cohortOrdinal: idx,
			changeId: 'crime-scene-reconstruction',
			communityId: 0,
			domainId: 0,
			mortonCode: idx,
			priorityScore: t.quickHitScore,
			finalScore: t.quickHitScore,
			routingActiveBit: true,
			umapXyz: [0, 0, 0] as [number, number, number],
			rot6d: [1, 0, 0, 0, 1, 0] as [number, number, number, number, number, number],
			latent64d: Array.from({ length: 64 }, () => 0),
			cohortRevision: null,
			sourceRevision: null,
			sourceSha256: null
		}));
		if (rows.length === 0) return null;
		return dispatchConflictFreeWorkboardBatchV1({
			requestId: 'admin-ai-dashboard-preview',
			executionId: 'workboard-preview',
			acePacket,
			rows,
			ownedFilesByKey: {}
		});
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') throw redirect(303, '/dashboard');
	const dailyGraphifyBoard = await loadDailyGraphifyBoard();
	const dailyGraphifyBoardRecommendations = await buildDailyGraphifyBoardRecommendations(dailyGraphifyBoard);
	const runtimeErrorPriorities = await loadRuntimeErrorPriorities();
	const svelteEslintRunReceipt = await loadLatestSvelteEslintRunReceiptV1();
	return {
		dailyGraphifyBoard,
		agenticErrorFixTasks: buildAgenticErrorFixLane(dailyGraphifyBoard),
		dailyGraphifyTaskCandidates: buildDailyGraphifyTaskCandidates(dailyGraphifyBoard),
		dailyGraphifyTaskPriorities: rankDailyGraphifyBoardTasks(dailyGraphifyBoard),
		dailyGraphifyBoardRecommendations,
		runtimeErrorPriorities,
		svelteEslintRunReceipt,
		conflictFreeWorkboardDispatch: loadConflictFreeWorkboardDispatch(),
	};
};
