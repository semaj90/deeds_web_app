import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ContextForestEdgeSchema = z.object({
	from: z.number().int().nonnegative(),
	to: z.number().int().nonnegative(),
	edgeType: z.string().min(1),
	score: z.number().finite(),
	tokenCost: z.number().finite().nonnegative().default(1),
});

export const ContextForestInputSchema = z.object({
	workspaceRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	ordinalMapChecksum: z.string().min(1),
	policyRevision: z.string().min(1),
	roots: z.array(z.number().int().nonnegative()).min(1),
	edges: z.array(ContextForestEdgeSchema),
	maxNodes: z.number().int().positive().default(64),
	maxEdges: z.number().int().positive().default(128),
	maxDepth: z.number().int().nonnegative().default(3),
	maxTokenCost: z.number().finite().positive().default(300),
});

export type ContextForestInput = z.input<typeof ContextForestInputSchema>;
export type ContextForestEdge = z.infer<typeof ContextForestEdgeSchema>;

export interface ContextForestV1 {
	schema: 'atlas.context-forest.v1';
	workspaceRevision: string;
	graphRevision: string;
	ordinalMapChecksum: string;
	policyRevision: string;
	roots: number[];
	nodeOrdinals: number[];
	edges: ContextForestEdge[];
	depthByNode: Record<string, number>;
	checksum: string;
}

function checksum(value: unknown): string {
	return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Deterministic bounded CPU baseline; executors may consume its output later. */
export function sampleContextForest(raw: ContextForestInput): ContextForestV1 {
	const input = ContextForestInputSchema.parse(raw);
	const roots = [...new Set(input.roots)].sort((a, b) => a - b);
	const byFrom = new Map<number, ContextForestEdge[]>();
	for (const edge of input.edges) {
		const list = byFrom.get(edge.from) ?? [];
		list.push(edge);
		byFrom.set(edge.from, list);
	}
	for (const list of byFrom.values()) {
		list.sort((a, b) => b.score - a.score || a.edgeType.localeCompare(b.edgeType) || a.to - b.to);
	}

	const depth = new Map<number, number>(roots.map((root) => [root, 0]));
	const selected: ContextForestEdge[] = [];
	let tokenCost = 0;
	for (const root of roots) {
		const queue = [root];
		while (queue.length > 0 && depth.size < input.maxNodes && selected.length < input.maxEdges) {
			const from = queue.shift()!;
			const fromDepth = depth.get(from)!;
			if (fromDepth >= input.maxDepth) continue;
			for (const edge of byFrom.get(from) ?? []) {
				if (selected.length >= input.maxEdges || depth.size >= input.maxNodes) break;
				if (depth.has(edge.to) || tokenCost + edge.tokenCost > input.maxTokenCost) continue;
				depth.set(edge.to, fromDepth + 1);
				selected.push(edge);
				tokenCost += edge.tokenCost;
				queue.push(edge.to);
			}
		}
	}

	const nodeOrdinals = [...depth.keys()].sort((a, b) => a - b);
	const result = {
		schema: 'atlas.context-forest.v1' as const,
		workspaceRevision: input.workspaceRevision,
		graphRevision: input.graphRevision,
		ordinalMapChecksum: input.ordinalMapChecksum,
		policyRevision: input.policyRevision,
		roots,
		nodeOrdinals,
		edges: selected,
		depthByNode: Object.fromEntries([...depth.entries()].sort(([a], [b]) => a - b)),
	};
	return { ...result, checksum: checksum(result) };
}
