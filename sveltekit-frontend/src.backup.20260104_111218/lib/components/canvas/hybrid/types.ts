export type Vec2 = { x: number; y: number };

export type BoardViewport = {
	pan: Vec2;   // world-space offset
	zoom: number;
};

export type BoardNodeKind = 'note' | 'image' | 'pdf' | 'link' | 'evidence';

export type BoardNode = {
	id: string;
	kind: BoardNodeKind;
	x: number;
	y: number;
	w: number;
	h: number;
	title?: string;
	body?: string;

	// Evidence binding (recommended)
	evidenceId?: string;

	// Rendering/behavior metadata
	locked?: boolean;
	meta?: Record<string, unknown>;

	// Optional visual overrides
	color?: string;
};

export type BoardEdge = {
	id: string;
	fromId: string;
	toId: string;
	style?: 'solid' | 'dashed';
	label?: string;
};

export type BoardSnapshot = {
	version: number;
	viewport: BoardViewport;
	nodes: BoardNode[];
	edges: BoardEdge[];
	updatedAt?: string;
};
