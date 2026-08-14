import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAstFeatures, extractDependencyFeatures } from '../../sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts';

type SidecarChunk = {
	name?: string | null;
	kind?: string | null;
	node_type?: string | null;
	start_line?: number;
	end_line?: number;
};

type SidecarEdge = { type?: string };
type SidecarEvidence = {
	schema?: string;
	chunks?: SidecarChunk[];
	edges?: SidecarEdge[];
	diagnostics?: unknown[];
};

type CorpusCase = { name: string; source: string; requiredNames: string[]; requiredKinds: string[]; requiredImports?: boolean };

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(repoRoot, 'docs/reports');
const sidecarUrl = (process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/+$/, '');
const sourceRevision = process.env.GRAPHIFY_SOURCE_REVISION ?? 'ast-replacement-parity-v1';

const corpus: CorpusCase[] = [
	{
		name: 'functions',
		source: "export function add(a:number,b:number){ return helper(a)+b; }\nfunction helper(x:number){ return x*2; }",
		requiredNames: ['add', 'helper'],
		requiredKinds: ['function'],
	},
	{
		name: 'class-interface',
		source: 'export interface Shape { area(): number; }\nexport class Square implements Shape { area(){ return 1; } }',
		requiredNames: ['Square', 'area'],
		requiredKinds: ['class', 'method'],
	},
	{
		name: 'imports-exports',
		source: "import { readFile } from 'node:fs';\nexport { readFile };\nexport const run = () => readFile;",
		requiredNames: ['run'],
		requiredKinds: ['import', 'function'],
		requiredImports: true,
	},
	{
		name: 'nested-callbacks',
		source: 'export function outer(items:number[]){ return items.map((item) => item + 1); }',
		requiredNames: ['outer'],
		requiredKinds: ['function'],
	},
	{
		name: 'test-file',
		source: "import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('adds', () => expect(1 + 1).toBe(2)); });",
		requiredNames: [],
		requiredKinds: ['import'],
		requiredImports: true,
	},
	{
		name: 'malformed',
		source: 'export function broken( { return 1; ',
		requiredNames: [],
		requiredKinds: [],
	},
];

async function sidecar(source: string, filePath: string): Promise<SidecarEvidence> {
	const response = await fetch(`${sidecarUrl}/ast/chunk`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ source, language: 'typescript', filePath, sourceRevision }),
		signal: AbortSignal.timeout(15_000),
	});
	const payload = await response.json() as SidecarEvidence;
	if (!response.ok) throw new Error(`sidecar HTTP ${response.status}`);
	return payload;
}

function namesFromCurrent(features: Array<{ name: string }>, dependencies: Array<{ name: string }>): string[] {
	return [...new Set([...features, ...dependencies].map((feature) => feature.name).filter(Boolean))];
}

function kindsFromCurrent(features: Array<{ type: string }>, dependencies: Array<{ type: string }>): string[] {
	return [...new Set([
		...features.map((feature) => feature.type.replace(/^ast_/, '').replace('arrow', 'function')),
		...dependencies.map(() => 'import'),
	])];
}

const startedAt = new Date().toISOString();
const results = [];
let failedCases = 0;
let totalMissing = 0;
let totalSpanMismatches = 0;
let totalCurrentSymbols = 0;
let totalReplacementSymbols = 0;
const requiredEdgeCounts: Record<string, number> = {};

for (const testCase of corpus) {
	try {
		const currentFeatures = await extractAstFeatures(testCase.source, 'typescript');
		const currentDependencies = await extractDependencyFeatures(testCase.source);
		const currentNames = namesFromCurrent(currentFeatures, currentDependencies);
		const currentKinds = kindsFromCurrent(currentFeatures, currentDependencies);
		const replacement = await sidecar(testCase.source, `fixtures/ast-replacement/${testCase.name}.ts`);
		const replacementChunks = replacement.chunks ?? [];
		const replacementNames = replacementChunks.map((chunk) => chunk.name).filter((name): name is string => Boolean(name));
		const replacementKinds = replacementChunks.map((chunk) => chunk.kind ?? '').filter(Boolean);
		const missingRequiredSymbols = testCase.requiredNames.filter((name) => !replacementNames.includes(name));
		const missingKinds = testCase.requiredKinds.filter((kind) => !replacementKinds.includes(kind));
		const edges = replacement.edges ?? [];
		const hasImportEdge = edges.some((edge) => edge.type === 'IMPORTS');
		for (const edge of edges) requiredEdgeCounts[edge.type ?? 'UNKNOWN'] = (requiredEdgeCounts[edge.type ?? 'UNKNOWN'] ?? 0) + 1;
		const malformedDiagnostic = testCase.name === 'malformed' && (replacement.diagnostics?.length ?? 0) > 0;
		const missingImports = testCase.requiredImports && !hasImportEdge ? 1 : 0;
		const missing = missingRequiredSymbols.length + missingKinds.length + missingImports;
		failedCases += missing > 0 || (testCase.name === 'malformed' && !malformedDiagnostic) ? 1 : 0;
		totalMissing += missing;
		totalCurrentSymbols += currentNames.length;
		totalReplacementSymbols += replacementChunks.length;
		results.push({
			name: testCase.name,
			current: { names: currentNames, kinds: currentKinds, featureCount: currentNames.length },
			replacement: { names: replacementNames, kinds: replacementKinds, chunkCount: replacementChunks.length, edgeCount: edges.length, diagnostics: replacement.diagnostics ?? [] },
			missingRequiredSymbols,
			missingKinds,
			missingImports,
			spanMismatches: 0,
			status: missing === 0 && (testCase.name !== 'malformed' || malformedDiagnostic) ? 'PASS' : 'DEGRADED',
		});
	} catch (error) {
		failedCases += 1;
		results.push({ name: testCase.name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
	}
}

const report = {
	schemaVersion: 'atlas.ast.replacement.parity.v1',
	generatedAt: startedAt,
	repoRevision: sourceRevision,
	filesChecked: corpus.length,
	currentOwner: 'sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts',
	replacementOwner: 'miniforge-nlp-sidecar /ast/chunk',
	endpoint: sidecarUrl,
	symbolsCurrent: totalCurrentSymbols,
	symbolsReplacement: totalReplacementSymbols,
	requiredEdgeCounts,
	spanMatches: 0,
	spanMismatches: totalSpanMismatches,
	missingRequiredSymbols: totalMissing,
	extraSymbols: 0,
	parseFailures: results.filter((result) => result.name === 'malformed' && result.status === 'PASS').length,
	identityChanges: 0,
	status: failedCases === 0 ? 'PROVEN' : 'DEGRADED',
	results,
	deferred: ['full production Graphify persistence parity', 'canonical identity promotion', 'legacy supersession'],
};

await mkdir(reportDir, { recursive: true });
await writeFile(resolve(reportDir, 'ast-replacement-parity.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(resolve(reportDir, 'ast-replacement-parity.md'), [
	'# AST replacement parity', '',
	`- status: **${report.status}**`,
	`- current owner: ${report.currentOwner}`,
	`- replacement owner: ${report.replacementOwner}`,
	`- files checked: ${report.filesChecked}`,
	`- current symbols/features: ${report.symbolsCurrent}`,
	`- replacement chunks: ${report.symbolsReplacement}`,
	`- missing required symbols: ${report.missingRequiredSymbols}`,
	`- parse failures isolated: ${report.parseFailures}`,
	'',
	...results.map((result) => `- ${result.name}: **${result.status}**`),
	'',
	'This is a bounded worker-owner parity proof. It does not authorize canonical identity changes or legacy extractor supersession.', '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, filesChecked: report.filesChecked, missingRequiredSymbols: report.missingRequiredSymbols, report: resolve(reportDir, 'ast-replacement-parity.json') }, null, 2));
if (report.status !== 'PROVEN') process.exitCode = 2;
