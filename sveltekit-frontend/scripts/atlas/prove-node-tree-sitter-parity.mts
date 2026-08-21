import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { create8095AstProvider, type CanonicalSourceRef } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { createNodeTreeSitterAstProvider } from '$lib/server/atlas/indexing/node-tree-sitter-ast-provider.js';

type Fixture = { name: string; source: string };
type Chunk = { name?: string | null; kind?: string | null; start_line?: number; end_line?: number; start_byte?: number; end_byte?: number };

const repoRoot = resolve(process.cwd(), '..');
const reportDir = resolve(repoRoot, 'docs/reports');
const sidecarUrl = process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const fixtures: Fixture[] = [
	{ name: 'functions', source: "export function add(a:number,b:number){ return helper(a)+b; }\nfunction helper(x:number){ return x*2; }" },
	{ name: 'class-interface', source: 'export interface Shape { area(): number; }\nexport class Square implements Shape { area(){ return 1; } }' },
	{ name: 'imports-exports', source: "import { readFile } from 'node:fs';\nexport { readFile };\nexport const run = () => readFile;" },
	{ name: 'nested-callbacks', source: 'export function outer(items:number[]){ return items.map((item) => item + 1); }' },
	{ name: 'test-file', source: "import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('adds', () => expect(1 + 1).toBe(2)); });" },
	{ name: 'malformed', source: 'export function broken( { return 1; ' },
];

function chunks(result: Awaited<ReturnType<ReturnType<typeof createNodeTreeSitterAstProvider>['materialize']>>): Chunk[] {
	return (result.evidence?.chunks ?? []) as Chunk[];
}

function signature(chunk: Chunk): string {
	return `${chunk.name ?? ''}|${normalKind(chunk.kind)}|${chunk.start_byte ?? ''}|${chunk.end_byte ?? ''}|${chunk.start_line ?? ''}|${chunk.end_line ?? ''}`;
}

function normalKind(kind: string | null | undefined): string {
	return (kind ?? '').replace(/^ast_/, '').toUpperCase();
}

const nodeProvider = createNodeTreeSitterAstProvider();
const sidecarProvider = create8095AstProvider(sidecarUrl);
const results: Array<Record<string, unknown>> = [];

for (const fixture of fixtures) {
	const input: CanonicalSourceRef = {
		sourceRef: `fixtures/ast-replacement/${fixture.name}.ts`,
		sourceRevision: 'node-8095-parity-v1',
		language: 'typescript',
		source: fixture.source,
	};
	const [node, sidecar] = await Promise.all([
		nodeProvider.materialize(input),
		sidecarProvider.materialize(input),
	]);
	const nodeChunks = chunks(node);
	const sidecarChunks = chunks(sidecar);
	const nodeNames = [...new Set(nodeChunks.map((chunk) => chunk.name).filter((name): name is string => Boolean(name && name !== '<anonymous>')))].sort();
	const sidecarNames = [...new Set(sidecarChunks.map((chunk) => chunk.name).filter((name): name is string => Boolean(name && name !== '<anonymous>')))].sort();
	const nodeKinds = [...new Set(nodeChunks.map((chunk) => normalKind(chunk.kind)).filter(Boolean))].sort();
	const sidecarKinds = [...new Set(sidecarChunks.map((chunk) => normalKind(chunk.kind)).filter(Boolean))].sort();
	const nodeSignatures = new Set(nodeChunks.map(signature));
	const sidecarSignatures = new Set(sidecarChunks.map(signature));
	const missingNames = sidecarNames.filter((name) => !nodeNames.includes(name));
	const extraNames = nodeNames.filter((name) => !sidecarNames.includes(name));
	const missingKinds = sidecarKinds.filter((kind) => !nodeKinds.includes(kind));
	const nodeNamedByIdentity = new Set(nodeChunks.filter((chunk) => chunk.name && chunk.name !== '<anonymous>').map((chunk) => `${chunk.name}|${normalKind(chunk.kind)}`));
	const spanMismatches = sidecarChunks.filter((chunk) => chunk.name && chunk.name !== '<anonymous>' && nodeNamedByIdentity.has(`${chunk.name}|${normalKind(chunk.kind)}`) && !nodeSignatures.has(signature(chunk))).length;
	results.push({
		name: fixture.name,
		status: node.status === 'FAILED' || sidecar.status === 'FAILED' ? 'FAILED' : missingNames.length || missingKinds.length || spanMismatches || (node.evidence?.edges?.length ?? 0) !== (sidecar.evidence?.edges?.length ?? 0) ? 'DEGRADED' : 'PASS',
		node: { status: node.status, chunkCount: nodeChunks.length, names: nodeNames, kinds: nodeKinds, diagnostics: node.diagnostics },
		sidecar8095: { status: sidecar.status, chunkCount: sidecarChunks.length, names: sidecarNames, kinds: sidecarKinds, diagnostics: sidecar.diagnostics },
		missingNames,
		extraNames,
		missingKinds,
		spanMismatches,
		edges: { node: node.evidence?.edges?.length ?? 0, sidecar8095: sidecar.evidence?.edges?.length ?? 0 },
	});
}

const failed = results.filter((result) => result.status === 'FAILED').length;
const degraded = results.filter((result) => result.status === 'DEGRADED').length;
const report = {
	schemaVersion: 'atlas.ast.node.8095.parity.v1',
	generatedAt: new Date().toISOString(),
	status: failed ? 'FAILED' : degraded ? 'DEGRADED_COMPATIBILITY_GAP' : 'PROVEN',
	currentExecutor: 'treesitter-chunker-8095',
	challenger: 'treesitter-node',
	endpoint: sidecarUrl,
	filesChecked: fixtures.length,
	canonicalWrites: false,
	canonicalPromotionAllowed: false,
	deferred: ['typed edge parity', 'native provenance parity', 'canonical identity parity', 'provider switch'],
	results,
};
await mkdir(reportDir, { recursive: true });
await writeFile(resolve(reportDir, 'ast-node-8095-parity.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(resolve(reportDir, 'ast-node-8095-parity.md'), [
	'# Node Tree-sitter vs 8095 parity', '',
	`- status: **${report.status}**`,
	`- files checked: ${report.filesChecked}`,
	`- canonical writes: ${report.canonicalWrites}`,
	`- promotion allowed: ${report.canonicalPromotionAllowed}`, '',
	...results.map((result) => `- ${String(result.name)}: **${String(result.status)}**`), '',
	'Node is a compatibility challenger only; this report does not authorize a provider switch.', '',
].join('\n'));
console.log(JSON.stringify({ status: report.status, filesChecked: report.filesChecked, report: resolve(reportDir, 'ast-node-8095-parity.json') }, null, 2));
if (report.status === 'FAILED') process.exitCode = 2;
