import { z } from 'zod';
import { sha256Stable } from './contracts.js';

export const HELPER_REGISTRY_SCHEMA_V1 = 'atlas.helper-registry.v1' as const;
export const HELPER_CAPABILITY_SNAPSHOT_SCHEMA_V1 = 'atlas.helper-capability-snapshot.v1' as const;

export const HelperExecutionSurfaceSchema = z.enum([
	'REQUEST_RUNTIME',
	'SERVICE_ADAPTER',
	'LOCAL_TOOLING',
	'OFFLINE_EXECUTOR',
]);
export const HelperCostClassSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const HelperMutationClassSchema = z.literal('READ_ONLY');

export const HelperRegistryEntrySchema = z.object({
	helperId: z.string().min(1),
	helperRevision: z.string().regex(/^[a-f0-9]{64}$/),
	ownerRef: z.string().min(1),
	executionSurface: HelperExecutionSurfaceSchema,
	languages: z.array(z.string().min(1)),
	intents: z.array(z.string().min(1)),
	requires: z.array(z.string().min(1)),
	produces: z.array(z.string().min(1)),
	costClass: HelperCostClassSchema,
	mutationClass: HelperMutationClassSchema,
}).strict();
export type HelperRegistryEntryV1 = z.infer<typeof HelperRegistryEntrySchema>;

export const HelperRegistryV1Schema = z.object({
	schema: z.literal(HELPER_REGISTRY_SCHEMA_V1),
	revision: z.string().min(1),
	entries: z.array(HelperRegistryEntrySchema).min(1),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type HelperRegistryV1 = z.infer<typeof HelperRegistryV1Schema>;

export function assertHelperRegistryV1(value: HelperRegistryV1): HelperRegistryV1 {
	const registry = HelperRegistryV1Schema.parse(value);
	const { checksum, ...body } = registry;
	if (sha256Stable(body) !== checksum) throw new Error('HELPER_REGISTRY_CHECKSUM_MISMATCH');
	return registry;
}

const REGISTRY_SPECS = [
	{ helperId: 'rg-exact', ownerRef: 'sveltekit-frontend/src/lib/server/agent/tools/ripgrep-search.ts', executionSurface: 'REQUEST_RUNTIME', languages: ['*'], intents: ['find', 'inspect', 'repair-evidence'], requires: ['query-term'], produces: ['source-ref', 'text-match'], costClass: 'LOW' },
	{ helperId: 'postgres-fts', ownerRef: 'sveltekit-frontend/src/lib/server/search/postgres-fts.ts', executionSurface: 'REQUEST_RUNTIME', languages: ['*'], intents: ['find', 'inspect', 'explain'], requires: ['query-term', 'postgres-read'], produces: ['source-ref', 'lexical-hit'], costClass: 'LOW' },
	{ helperId: 'postgres-trigram', ownerRef: 'sveltekit-frontend/src/lib/server/retrieval/bm25-search.ts', executionSurface: 'REQUEST_RUNTIME', languages: ['*'], intents: ['find', 'inspect'], requires: ['query-term', 'postgres-read'], produces: ['source-ref', 'fuzzy-lexical-hit'], costClass: 'LOW' },
	{ helperId: 'tree-sitter-chunk', ownerRef: 'python/miniforge_nlp_sidecar.py#/ast/chunk', executionSurface: 'SERVICE_ADAPTER', languages: ['*'], intents: ['inspect', 'repair-evidence'], requires: ['source-bytes', 'source-revision', 'sidecar-8095'], produces: ['structural-span', 'syntax-facts'], costClass: 'MEDIUM' },
	{ helperId: 'ast-grep-structural', ownerRef: 'sveltekit-frontend/src/lib/server/atlas/language/ast-grep-structural-topk.ts', executionSurface: 'LOCAL_TOOLING', languages: ['typescript', 'javascript'], intents: ['find', 'inspect', 'repair-evidence'], requires: ['source-snapshot', 'structural-query'], produces: ['structural-match'], costClass: 'MEDIUM' },
	{ helperId: 'ts-morph-symbol', ownerRef: 'sveltekit-frontend/src/lib/server/atlas/language/ts-morph-semantic-enrichment.ts', executionSurface: 'LOCAL_TOOLING', languages: ['typescript', 'javascript'], intents: ['find', 'inspect', 'repair-evidence'], requires: ['source-snapshot', 'tsconfig'], produces: ['symbol-evidence'], costClass: 'MEDIUM' },
	{ helperId: 'lsp-definition', ownerRef: 'scripts/atlas/lib/compiler-semantic-resolver-v1.mjs', executionSurface: 'LOCAL_TOOLING', languages: ['typescript', 'javascript'], intents: ['find', 'inspect'], requires: ['source-snapshot', 'lsp-server'], produces: ['definition-location'], costClass: 'MEDIUM' },
	{ helperId: 'lsp-references', ownerRef: 'scripts/atlas/lib/compiler-semantic-resolver-v1.mjs', executionSurface: 'LOCAL_TOOLING', languages: ['typescript', 'javascript'], intents: ['find', 'inspect'], requires: ['source-snapshot', 'lsp-server'], produces: ['reference-locations'], costClass: 'MEDIUM' },
	{ helperId: 'docs-corpus-search', ownerRef: 'sveltekit-frontend/src/lib/server/atlas/docs/doc-intelligence-read-model.ts#searchDocCorpus', executionSurface: 'REQUEST_RUNTIME', languages: ['*'], intents: ['find', 'explain', 'compare'], requires: ['query-term', 'canonical-doc-corpus'], produces: ['revisioned-doc-hit'], costClass: 'LOW' },
	{ helperId: 'semantic-768', ownerRef: 'sveltekit-frontend/src/lib/server/retrieval/semantic-search-workflow.ts', executionSurface: 'REQUEST_RUNTIME', languages: ['*'], intents: ['find', 'explain', 'compare', 'repair-evidence'], requires: ['qualified-semantic-768', 'query-vector'], produces: ['semantic-hit'], costClass: 'HIGH' },
	{ helperId: 'graph-ppr', ownerRef: 'python/atlas_graph_runtime/networkx_executor.py; python/atlas_graph_runtime/cugraph_executor.py', executionSurface: 'OFFLINE_EXECUTOR', languages: ['*'], intents: ['find', 'inspect', 'repair-evidence'], requires: ['frozen-graph', 'candidate-ordinals', 'seed-weights'], produces: ['ppr-score'], costClass: 'HIGH' },
	{ helperId: 'langextract-grounding', ownerRef: 'sveltekit-frontend/src/lib/server/atlas/ai/langextract-transport.ts', executionSurface: 'SERVICE_ADAPTER', languages: ['*'], intents: ['explain', 'compare', 'repair-evidence'], requires: ['source-text', 'grounding-spans', 'langextract-service'], produces: ['grounded-claim'], costClass: 'HIGH' },
] as const;

function sortStrings(values: readonly string[]): string[] { return [...new Set(values)].sort(); }

const entries = REGISTRY_SPECS.map((spec) => {
	const canonicalSpec = {
		...spec,
		languages: sortStrings(spec.languages),
		intents: sortStrings(spec.intents),
		requires: sortStrings(spec.requires),
		produces: sortStrings(spec.produces),
		mutationClass: 'READ_ONLY' as const,
	};
	return HelperRegistryEntrySchema.parse({ ...canonicalSpec, helperRevision: sha256Stable(canonicalSpec) });
}).sort((a, b) => a.helperId.localeCompare(b.helperId));

const registryBody = { schema: HELPER_REGISTRY_SCHEMA_V1, revision: 'helper-registry:2026-09-27.1', entries };
export const HELPER_REGISTRY_V1: HelperRegistryV1 = HelperRegistryV1Schema.parse({
	...registryBody,
	checksum: sha256Stable(registryBody),
});

// Per-extension AST language vocabulary. Authority: python/miniforge_nlp_sidecar.py::_AST_LANGUAGE_EXTENSIONS,
// exposed live through the sidecar's /capabilities languageBindings. Each row is checked against that
// authority by the caller, not trusted as a copy. astGrepLanguage is null where ast-grep cannot parse the
// language (svelte): such files must use the tree-sitter path only.
export const AST_LANGUAGE_VOCABULARY_SCHEMA_V1 = 'atlas.ast-language-vocabulary.v1' as const;

export const AstLanguageBindingSchemaV1 = z.object({
	extension: z.string().regex(/^\.[a-z]{1,8}$/),
	sidecarLanguage: z.enum(['typescript', 'tsx', 'javascript', 'python', 'rust', 'go', 'java', 'svelte']),
	astGrepLanguage: z.enum(['typescript', 'tsx', 'javascript', 'python', 'rust', 'go', 'java']).nullable(),
	offsetConvention: z.literal('UTF8_BYTE_SIDECAR'),
});
export type AstLanguageBindingV1 = z.infer<typeof AstLanguageBindingSchemaV1>;

const AST_LANGUAGE_BINDINGS_V1: readonly AstLanguageBindingV1[] = [
	{ extension: '.ts', sidecarLanguage: 'typescript', astGrepLanguage: 'typescript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.mts', sidecarLanguage: 'typescript', astGrepLanguage: 'typescript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.cts', sidecarLanguage: 'typescript', astGrepLanguage: 'typescript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.tsx', sidecarLanguage: 'tsx', astGrepLanguage: 'tsx', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.js', sidecarLanguage: 'javascript', astGrepLanguage: 'javascript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.jsx', sidecarLanguage: 'javascript', astGrepLanguage: 'javascript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.mjs', sidecarLanguage: 'javascript', astGrepLanguage: 'javascript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.cjs', sidecarLanguage: 'javascript', astGrepLanguage: 'javascript', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.py', sidecarLanguage: 'python', astGrepLanguage: 'python', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.pyi', sidecarLanguage: 'python', astGrepLanguage: 'python', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.rs', sidecarLanguage: 'rust', astGrepLanguage: 'rust', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.go', sidecarLanguage: 'go', astGrepLanguage: 'go', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.java', sidecarLanguage: 'java', astGrepLanguage: 'java', offsetConvention: 'UTF8_BYTE_SIDECAR' },
	{ extension: '.svelte', sidecarLanguage: 'svelte', astGrepLanguage: null, offsetConvention: 'UTF8_BYTE_SIDECAR' },
];

/** Resolve a file path to its AST language binding. Returns null for unknown extensions (fail closed). */
export function resolveAstLanguageBindingV1(filePath: string): AstLanguageBindingV1 | null {
	const match = /\.[A-Za-z]{1,8}$/.exec(filePath);
	if (!match) return null;
	const ext = match[0].toLowerCase();
	const hit = AST_LANGUAGE_BINDINGS_V1.find((row) => row.extension === ext);
	return hit ? AstLanguageBindingSchemaV1.parse(hit) : null;
}
