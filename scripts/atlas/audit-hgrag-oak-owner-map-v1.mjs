import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const thisScript = path.resolve(fileURLToPath(import.meta.url));
const reportPath = path.join(root, '.tmp/atlas/hgrag-oak-owner-map-v1.json');
const roots = [
	'python',
	'scripts/atlas',
	'sveltekit-frontend/src/lib/server',
	'packages/parent-atlas-retrieval/src',
	'simd-bridge/cpp',
];
const ownerSpecs = [
	{ id: 'EXTERNAL_HYPERGRAPH_PROPOSAL', file: 'python/atlas_external_doc_hypergraph.py', symbol: 'build_hypergraph_fact_proposal_v1', classification: 'HYPERGRAPH_PROJECTION', authority: 'proposal-only' },
	{ id: 'GROUNDED_FACT_DATACLASS', file: 'python/atlas_grounded_nlp_fact_v1.py', symbol: 'GroundedNlpFactV1', classification: 'CANONICAL_CONTRACT', authority: 'transport-contract-only' },
	{ id: 'OAK_PYDANTIC_GROUNDED_FACT', file: 'python/oak_agent/grounded_nlp_fact_v1.py', symbol: 'GroundedNlpFactV1', classification: 'ORCHESTRATION', authority: 'validation-only' },
	{ id: 'OAK_STRUCTURED_FUNCTION_CONTRACTS', file: 'python/oak_agent/structured_contracts_v1.py', symbol: 'FindFailureContextArgsV1', classification: 'ORCHESTRATION', authority: 'bounded-tool-contract-only' },
	{ id: 'HYPERGRAPH_NETWORKX_BRIDGE', file: 'python/parent_atlas_ontology/hypergraph_networkx_bridge_v1.py', symbol: 'build_hypergraph_networkx_fixture_receipt_v1', classification: 'CPU_ORACLE', authority: 'request-local-computation' },
	{ id: 'NETWORKX_EXECUTOR', file: 'python/atlas_graph_runtime/networkx_executor.py', symbol: 'run_pagerank', classification: 'CPU_ORACLE', authority: 'derived-analytics-only' },
	{ id: 'CUGRAPH_EXECUTOR', file: 'python/atlas_graph_runtime/cugraph_executor.py', symbol: 'run_personalized_pagerank', classification: 'GPU_EXECUTOR', authority: 'derived-analytics-only' },
	{ id: 'NEO4J_RELATIONSHIP_PROJECTOR', file: 'sveltekit-frontend/src/lib/server/atlas/graph/relationship-kernel-neo4j-projector-v1.ts', symbol: 'projectRelationshipKernelsToNeo4j', classification: 'NEO4J_PROJECTION', authority: 'projection-only' },
	{ id: 'HYPERRAG_RETRIEVER', file: 'sveltekit-frontend/src/lib/server/ace/retrieval/hyperrag-retriever.ts', symbol: 'HyperRagRetriever', modulePath: 'hyperrag-retriever', classification: 'HYPERGRAPH_PROJECTION', authority: 'retrieval-consumer' },
	{ id: 'SIMDJSON_TYPED_EVIDENCE_STREAM', file: 'sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts', symbol: 'parseNdjsonTypedEvidenceStream', classification: 'ORCHESTRATION', authority: 'parse-and-validate-transport-only' },
	{ id: 'SIMDJSON_NAPI_BRIDGE', file: 'simd-bridge/cpp/simdjson_bridge.cc', symbol: 'SimdJsonParse', classification: 'ORCHESTRATION', authority: 'native-parser-only' },
	{ id: 'CUTILE_EXPERIMENT', file: 'python/atlas_cuda_cutile_simt_gemm_probe_v1.py', symbol: 'cuTile', classification: 'GPU_EXECUTOR', authority: 'experimental-kernel-only' },
];

const scannedFiles = roots.flatMap((relativeRoot) => walk(path.join(root, relativeRoot)))
	.filter((file) => /\.(?:py|ts|mts|mjs|cc|cpp|h|hpp)$/.test(file))
	.sort((left, right) => left.localeCompare(right));
const ownerMap = ownerSpecs.map((spec) => mapOwner(spec));
const stable = {
	schema: 'atlas.hgrag-oak-owner-map.v1',
	scopeRoots: roots,
	ownerCount: ownerMap.length,
	scannedSourceFileCount: scannedFiles.length,
	ownerMap,
	limitations: [
		'Curated source-owner inventory, not an exhaustive module census.',
		'Symbol text references do not prove runtime registration, invocation, or application reachability.',
		'Classification labels are proposed from source role and remain review-required.',
		'No implementation is classified DEAD_DUPLICATE and no files are deleted.',
	],
	canonicalAuthority: false,
	writesPerformed: false,
};
const receipt = {
	...stable,
	classificationStatus: 'STATIC_REVIEW_REQUIRED',
	generatedAt: new Date().toISOString(),
	checksum: sha256(JSON.stringify(stable)),
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
	schema: receipt.schema,
	ownerCount: receipt.ownerCount,
	scannedSourceFileCount: receipt.scannedSourceFileCount,
	classificationStatus: receipt.classificationStatus,
	checksum: receipt.checksum,
	owners: ownerMap.map((owner) => ({ id: owner.id, sourceStatus: owner.sourceStatus, declaredSymbolPresent: owner.declaredSymbolPresent, symbolTextReferenceCount: owner.symbolTextReferenceCount, modulePathReferenceCount: owner.modulePathReferenceCount })),
	reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));

function mapOwner(spec) {
	const absolutePath = path.join(root, spec.file);
	if (!existsSync(absolutePath)) {
		return { ...spec, sourceStatus: 'MISSING', sourceSha256: null, references: [], callerTextReferenceCount: 0 };
	}
	const source = readFileSync(absolutePath);
	const sourceText = source.toString('utf8');
	const declaredSymbolPresent = sourceText.includes(spec.symbol);
	const references = [];
	for (const file of scannedFiles) {
		if (path.resolve(file) === path.resolve(absolutePath) || path.resolve(file) === thisScript) continue;
		const text = readFileSync(file, 'utf8');
		const lines = text.split(/\r?\n/);
		for (let index = 0; index < lines.length; index++) {
			const symbolMatch = lines[index].includes(spec.symbol);
			const modulePathMatch = !symbolMatch && spec.modulePath && lines[index].includes(spec.modulePath);
			if (symbolMatch || modulePathMatch) {
				const relativePath = path.relative(root, file).replaceAll('\\', '/');
				references.push({
					file: relativePath,
					line: index + 1,
					referenceKind: modulePathMatch ? 'MODULE_PATH_REFERENCE' : 'SYMBOL_TEXT_REFERENCE',
					scopeKind: /(?:\.spec\.|\.test\.|\/tests?\/)/i.test(relativePath) ? 'TEST' : 'SOURCE',
				});
				break;
			}
		}
	}
	return {
		...spec,
		sourceStatus: declaredSymbolPresent ? 'PRESENT' : 'PRESENT_SYMBOL_UNVERIFIED',
		sourceSha256: sha256(source),
		declaredSymbolPresent,
		classificationStatus: 'REVIEW_REQUIRED',
		references: references.slice(0, 32),
		callerTextReferenceCount: references.length,
		sourceTextReferenceCount: references.filter((item) => item.scopeKind === 'SOURCE').length,
		testTextReferenceCount: references.filter((item) => item.scopeKind === 'TEST').length,
		modulePathReferenceCount: references.filter((item) => item.referenceKind === 'MODULE_PATH_REFERENCE').length,
		symbolTextReferenceCount: references.filter((item) => item.referenceKind === 'SYMBOL_TEXT_REFERENCE').length,
	};
}

function walk(directory) {
	if (!existsSync(directory)) return [];
	const results = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (['node_modules', '.svelte-kit', 'build', 'dist', '__pycache__', '.git'].includes(entry.name)) continue;
			results.push(...walk(path.join(directory, entry.name)));
		} else if (entry.isFile()) {
			const fullPath = path.join(directory, entry.name);
			if (statSync(fullPath).size <= 2 * 1024 * 1024) results.push(fullPath);
		}
	}
	return results;
}

function sha256(value) {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
