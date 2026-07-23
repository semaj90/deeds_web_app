import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') throw redirect(303, '/dashboard');
	return {
		dailyGraphifyBoard: await loadDailyGraphifyBoard(),
	};
};
