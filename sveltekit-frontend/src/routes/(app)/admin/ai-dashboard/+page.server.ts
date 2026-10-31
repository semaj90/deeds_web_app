import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';
import { buildDailyGraphifyBoardRecommendations } from '$lib/server/atlas/board/daily-graphify-board-recommendations.js';
import { buildDailyGraphifyTaskCandidates } from '$lib/server/atlas/board/graphify-task-candidates.js';
import { loadRuntimeErrorPriorities } from '$lib/server/atlas/board/runtime-error-priorities.js';
import { rankDailyGraphifyBoardTasks } from '$lib/server/atlas/board/daily-graphify-task-priority.js';
import { buildAgenticErrorFixLane } from '$lib/server/atlas/board/agentic-error-fix-lane.js';
import { loadLatestSvelteEslintRunReceiptV1 } from '$lib/server/admin/svelte-eslint-run-receipt-v1.mjs';

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
	};
};
