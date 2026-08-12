import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';
import { buildDailyGraphifyBoardRecommendations } from '$lib/server/atlas/board/daily-graphify-board-recommendations.js';
import { buildDailyGraphifyTaskCandidates } from '$lib/server/atlas/board/graphify-task-candidates.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') throw redirect(303, '/dashboard');
	const dailyGraphifyBoard = await loadDailyGraphifyBoard();
	const dailyGraphifyBoardRecommendations = await buildDailyGraphifyBoardRecommendations(dailyGraphifyBoard);
	return {
		dailyGraphifyBoard,
		dailyGraphifyTaskCandidates: buildDailyGraphifyTaskCandidates(dailyGraphifyBoard),
		dailyGraphifyBoardRecommendations,
	};
};
