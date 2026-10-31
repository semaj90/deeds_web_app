import type { DailyGraphifyBoardData, DailyGraphifyTask } from './daily-graphify-board.js';

export const AGENTIC_ERROR_FIX_ORIGIN = 'agentic_error_fixing_v1';

export interface AgenticErrorFixTask {
	id: string;
	priority: DailyGraphifyTask['priority'];
	label: string;
	status: string;
	sourceRef: string | null;
	script: string | null;
	gate: string | null;
	blockedBy: string[];
	evidenceRefs: string[];
	reasonCodes: string[];
}

const PRIORITY_SCORE: Record<DailyGraphifyTask['priority'], number> = {
	P0: 100,
	P1: 75,
	P2: 50,
	P3: 25,
};

export function buildAgenticErrorFixLane(board: DailyGraphifyBoardData): AgenticErrorFixTask[] {
	return board.columns
		.flatMap((column) => column.tasks)
		.filter((task) => task.origin === AGENTIC_ERROR_FIX_ORIGIN)
		.sort((left, right) =>
			PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority] || left.id.localeCompare(right.id, 'en'),
		)
		.map((task) => ({
			id: task.id,
			priority: task.priority,
			label: task.label,
			status: task.status ?? 'PROPOSED',
			sourceRef: task.source_ref ?? null,
			script: task.script ?? null,
			gate: task.gate ?? null,
			blockedBy: [...(task.blockedBy ?? [])],
			evidenceRefs: [...(task.evidence_refs ?? [])],
			reasonCodes: [...(task.reason_codes ?? [])],
		}));
}
