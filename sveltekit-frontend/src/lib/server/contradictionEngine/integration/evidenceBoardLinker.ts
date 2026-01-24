import type { FactContradiction } from '../types.js';

export interface EvidenceBoard {
	addLink(link: { from: string | undefined; to: string | undefined; color: string; label: string }): void;
}

export function linkContradictionsToBoard(
	board: EvidenceBoard,
	contradictions: FactContradiction[]
): void {
	for (const contradiction of contradictions) {
		board.addLink({
			from: contradiction.first.rawId,
			to: contradiction.second.rawId,
			color: 'red',
			label: 'CONTRADICTION',
		});
	}
}

