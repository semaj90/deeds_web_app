import type { DailyGraphifyBoardData, DailyGraphifyTask } from './daily-graphify-board.js';

const PRIORITY_SCORE: Record<DailyGraphifyTask['priority'], number> = {
	P0: 100,
	P1: 75,
	P2: 50,
	P3: 25,
};

export interface DailyGraphifyTaskPriorityRow {
	rank: number;
	taskId: string;
	label: string;
	priority: DailyGraphifyTask['priority'];
	priorityScore: number;
	status: string | null;
	blockedBy: string[];
	sourceRef: string | null;
}

export function rankDailyGraphifyBoardTasks(
	board: DailyGraphifyBoardData,
): DailyGraphifyTaskPriorityRow[] {
	const ordered = board.columns
		.flatMap((column) => column.tasks)
		.map((task) => ({ task, priorityScore: PRIORITY_SCORE[task.priority] }))
		.sort((left, right) =>
			right.priorityScore - left.priorityScore || left.task.id.localeCompare(right.task.id, 'en'),
		);

	return ordered.map(({ task, priorityScore }, index) => ({
		rank: index + 1,
		taskId: task.id,
		label: task.label,
		priority: task.priority,
		priorityScore,
		status: task.status ?? null,
		blockedBy: [...(task.blockedBy ?? [])],
		sourceRef: task.source_ref ?? null,
	}));
}
