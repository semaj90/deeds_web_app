import { createHash } from 'node:crypto';
import { graphNodeKeyV1Schema, type GraphNodeKeyV1 } from '@deeds/parent-atlas';
import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export type GraphOrdinalRowV1 = {
	graphOrdinal: number;
	graphNodeKey: GraphNodeKeyV1;
};

export type GraphOrdinalMapV1 = {
	schema: 'atlas.graph-ordinal-map.v1';
	graphRevision: string;
	workspaceRevision: string;
	rowCount: number;
	rows: GraphOrdinalRowV1[];
	graphOrdinalMapChecksum: string;
	canonicalAuthority: false;
	writes: false;
};

const graphOrdinalRowV1Schema = z.object({
	graphOrdinal: z.number().int().nonnegative(),
	graphNodeKey: graphNodeKeyV1Schema,
}).strict();

export const graphOrdinalMapV1Schema = z.object({
	schema: z.literal('atlas.graph-ordinal-map.v1'),
	graphRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	rowCount: z.number().int().nonnegative(),
	rows: z.array(graphOrdinalRowV1Schema),
	graphOrdinalMapChecksum: sha256,
	canonicalAuthority: z.literal(false),
	writes: z.literal(false),
}).strict().superRefine((value, ctx) => {
	if (value.rowCount !== value.rows.length) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowCount'], message: 'GRAPH_ORDINAL_ROW_COUNT_MISMATCH' });
	}
	for (const [index, row] of value.rows.entries()) {
		if (row.graphOrdinal !== index) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'graphOrdinal'], message: 'GRAPH_ORDINAL_SEQUENCE_INVALID' });
			break;
		}
	}
	const expected = digest({ graphRevision: value.graphRevision, workspaceRevision: value.workspaceRevision, rows: value.rows });
	if (value.graphOrdinalMapChecksum !== expected) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphOrdinalMapChecksum'], message: 'GRAPH_ORDINAL_CHECKSUM_MISMATCH' });
	}
});

export type ParsedGraphOrdinalMapV1 = z.infer<typeof graphOrdinalMapV1Schema>;

function digest(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Creates the executor-local dense coordinate map; it does not alter node identity. */
export function buildGraphOrdinalMapV1(input: {
	graphRevision: string;
	workspaceRevision: string;
	graphNodeKeys: readonly string[];
}): GraphOrdinalMapV1 {
	if (!input.graphRevision || !input.workspaceRevision) throw new Error('GRAPH_ORDINAL_REVISION_BINDING_REQUIRED');
	const keys = input.graphNodeKeys.map((key) => graphNodeKeyV1Schema.parse(key));
	if (new Set(keys).size !== keys.length) throw new Error('GRAPH_ORDINAL_DUPLICATE_NODE_KEY');
	const rows = [...keys].sort().map((graphNodeKey, graphOrdinal) => ({ graphOrdinal, graphNodeKey }));
	return graphOrdinalMapV1Schema.parse({
		schema: 'atlas.graph-ordinal-map.v1',
		graphRevision: input.graphRevision,
		workspaceRevision: input.workspaceRevision,
		rowCount: rows.length,
		rows,
		graphOrdinalMapChecksum: digest({ graphRevision: input.graphRevision, workspaceRevision: input.workspaceRevision, rows }),
		canonicalAuthority: false,
		writes: false,
	});
}

export function parseGraphOrdinalMapV1(input: unknown): ParsedGraphOrdinalMapV1 {
	return graphOrdinalMapV1Schema.parse(input);
}

export function graphNodeKeyForOrdinalV1(map: GraphOrdinalMapV1, graphOrdinal: number): GraphNodeKeyV1 | null {
	return map.rows.find((row) => row.graphOrdinal === graphOrdinal)?.graphNodeKey ?? null;
}
