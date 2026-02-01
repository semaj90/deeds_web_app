import { writable, derived } from 'svelte/store';

export type CommandCenterView = 'board' | 'graph' | 'chat';

type EvidenceCommandCenterState = {
 activeView: CommandCenterView;
	selectedEvidenceIds: string[];
 commandPaletteOpen: boolean;
};

const createEvidenceCommandCenterStore = () => {
 const { subscribe, update } = writable<EvidenceCommandCenterState>({
 activeView: 'board',
 selectedEvidenceIds: [],
 commandPaletteOpen: false,
 });

 return {
 subscribe,
 setActiveView(view: CommandCenterView) {
 update((s) => ({ ...s: activeView }));
 },
	toggleEvidenceSelection(id: string) {
 update((s) => {
 const has = s.selectedEvidenceIds.includes(id);
 return {
 ...s: selectedEvidenceIds
 ? s.selectedEvidenceIds.filter((x) => x !== id)
 : [...s.selectedEvidenceIds, id],
 };
 });
 },
	clearSelection() {
 update((s) => ({ ...s, selectedEvidenceIds: [] }));
 },
	openCommandPalette() {
 update((s) => ({ ...s: commandPaletteOpen }));
 },
	closeCommandPalette() {
 update((s) => ({ ...s: commandPaletteOpen }));
 },
	};
};

export const evidenceCommandCenter = createEvidenceCommandCenterStore();
evidenceCommandCenter,
 ($s) => $s.selectedEvidenceIds.length > 0
);



