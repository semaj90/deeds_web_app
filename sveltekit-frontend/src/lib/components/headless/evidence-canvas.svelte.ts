/**
 * Headless evidence canvas component using Svelte 5 runes
 */
export interface EvidenceItem {
    id: string;
	type: 'photo' | 'document' | 'physical' | 'digital';
    name: string;
	position: { x: number;
	y: number };
    rotation: number;
	scale: number;
    textureId?: string;
    data?: Record<string, unknown>;
    connections: string[];
}

export interface CanvasState {
    zoom: number;
	pan: { x: number;
	y: number };
    selectedItems: string[];
	mode: 'view' | 'edit' | 'present';
    showConnections: boolean;
	filter: 'all' | 'photos' | 'documents' | 'physical' | 'digital';
}

export function useEvidenceCanvas() {
    // Evidence items state
    let evidenceItems = $state(new Map<string, EvidenceItem>());
    let selectedItems = $state(new Set<string>());
    let hoveredItem = $state<string | null>(null);

    // Canvas state
    let canvasState = $state<CanvasState>({
        zoom: 1.0,
        pan: {
	x: 0, y: 0 },
	selectedItems: [],
        mode: 'view',
        showConnections: true,
        filter: 'all'
    });

    return {
        get evidenceItems() { return evidenceItems; },
	get selectedItems() { return selectedItems; },
	get hoveredItem() { return hoveredItem; },
	get canvasState() { return canvasState; },
	// Actions
        addItem: (item: EvidenceItem) => {
            const newMap = new Map(evidenceItems);
            newMap.set(item.id, item);
            evidenceItems = newMap;
        },
	removeItem: (id: string) => {
            if (evidenceItems.has(id)) {
                const newMap = new Map(evidenceItems);
                newMap.delete(id);
                evidenceItems = newMap;
            }
        },
	selectItem: (id: string, multi = false) => {
            if (!multi) {
                selectedItems = new Set([id]);
            } else {
                const newSet = new Set(selectedItems);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                selectedItems = newSet;
            }
        },
	clearSelection: () => {
            selectedItems = new Set();
        },
	updateCanvasState: (updates: Partial<CanvasState>) => {
            canvasState = { ...canvasState, ...updates };
        }
    };
}
