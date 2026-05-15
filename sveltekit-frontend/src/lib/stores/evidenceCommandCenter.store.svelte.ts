/**
 * Evidence Command Center store — Svelte 5 runes
 *
 * Manages: active view, evidence selection, command palette state
 */

export type CommandCenterView = 'board' | 'graph' | 'chat';

class EvidenceCommandCenterStore {
	activeView = $state<CommandCenterView>('board');
	selectedEvidenceIds = $state<Set<string>>(new Set());
	commandPaletteOpen = $state(false);

	setActiveView(view: CommandCenterView) {
		this.activeView = view;
	}

	toggleEvidenceSelection(id: string) {
		const next = new Set(this.selectedEvidenceIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		this.selectedEvidenceIds = next;
	}

	clearSelection() {
		this.selectedEvidenceIds = new Set();
	}

	openCommandPalette() {
		this.commandPaletteOpen = true;
	}

	closeCommandPalette() {
		this.commandPaletteOpen = false;
	}
}

export const evidenceCommandCenter = new EvidenceCommandCenterStore();

/** Derived convenience — true when at least one evidence item is selected */
export const hasSelection = {
	get current() {
		return evidenceCommandCenter.selectedEvidenceIds.size > 0;
	}
};
