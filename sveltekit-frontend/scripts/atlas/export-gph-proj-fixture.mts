#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildIncidenceProjectionV1 } from '../../src/lib/server/atlas/graph/incidence-projection-v1.js';
import type { HyperRelationV1 } from '../../src/lib/server/atlas/graph/hyper-relation-v1.js';

function arg(name: string, fallback: string): string {
	const index = process.argv.indexOf(name);
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const out = resolve(arg('--out', 'docs/reports/gph-proj/incidence-fixture.json'));
const workspaceRevision = arg('--workspace-revision', 'fixture-ws-1');
const projectionRevision = arg('--projection-revision', 'gph-proj-fixture-v1');

const relation: HyperRelationV1 = {
	schema: 'atlas.hyper-relation.v1',
	relationId: 'call-binding:42',
	relationType: 'CALL_BINDING',
	participants: [
		{ canonicalId: 'symbol:caller', role: 'caller', ordinal: 0 },
		{ canonicalId: 'symbol:callee', role: 'callee', ordinal: 1 },
		{ canonicalId: 'symbol:argument', role: 'argument', ordinal: 2 },
		{ canonicalId: 'symbol:parameter', role: 'parameter', ordinal: 3 },
		{ canonicalId: 'callsite:42', role: 'callsite', ordinal: 4 }
	],
	evidenceRefs: ['fixture:src/app.ts#L10-L14'],
	workspaceRevision,
	sourceRevision: 'fixture-source-rev-1',
	producerRevision: 'fixture-tree-sitter-v1'
};

const projection = buildIncidenceProjectionV1({
	workspaceRevision,
	projectionRevision,
	entities: [
		{ canonicalId: 'symbol:caller', nodeKind: 'symbol' },
		{ canonicalId: 'symbol:callee', nodeKind: 'symbol' },
		{ canonicalId: 'symbol:argument', nodeKind: 'symbol' },
		{ canonicalId: 'symbol:parameter', nodeKind: 'symbol' },
		{ canonicalId: 'callsite:42', nodeKind: 'callsite' }
	],
	relations: [relation]
});

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
	status: 'MATERIALIZED',
	out,
	projectionHash: projection.projectionHash,
	nodeCount: projection.nodes.length,
	edgeCount: projection.edges.length
}, null, 2));
