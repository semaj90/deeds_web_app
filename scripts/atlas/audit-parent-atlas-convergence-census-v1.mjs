#!/usr/bin/env node
/** Read-only census of active Parent Atlas runtime lineage surfaces. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const reportPath = join(root, 'docs', 'reports', 'parent-atlas-convergence-census-v1.json');
const sourceRoots = [join(root, 'sveltekit-frontend', 'src'), join(root, 'scripts', 'workers'), join(root, 'scripts', 'startup')];
const ignored = new Set(['node_modules', '.svelte-kit', 'dist', 'build']);
const files = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored.has(entry.name)) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(ts|tsx|mjs|mts|js)$/.test(entry.name)) files.push(file);
  }
}
sourceRoots.forEach(walk);

const rows = files.map((file) => ({ path: relative(root, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }));
const find = (pattern) => rows.filter((row) => pattern.test(row.text)).map((row) => row.path);
const count = (pattern) => rows.reduce((total, row) => total + (row.text.match(pattern) ?? []).length, 0);
const legacyModels = find(/gemma4-legal-iq4xs-direct|models\/hfor|hforf-gguf/i);
const embeddingFallbacks = find(/OLLAMA_EMBED_BASE_URL|OLLAMA_EMBED_MODEL|embeddinggemma:latest|\/api\/embed|onnx_directml/i);
const unsafeFeatureSurfaces = find(/latentLocalityScore|latent256Available|1\s*<<\s*9/);
const cacheTextOnly = find(/text_hash\s*=|ON CONFLICT\s*\(\s*text_hash\s*\)/i);

const result = {
  schema: 'atlas.parent-atlas.convergence-census.v1',
  generatedAt: 'DETERMINISTIC',
  scope: sourceRoots.map((path) => relative(root, path).split(sep).join('/')),
  synthesis: {
    legacyRequestModelSurfaceCount: legacyModels.length,
    legacyRequestModelSurfaces: legacyModels,
    v1ModelsAuthority: 'VERIFICATION_ONLY',
  },
  semanticEmbedding: {
    representationId: 'semantic_768',
    canonicalExecutor: 'llama-server:8081',
    canonicalEndpoint: '/v1/embeddings',
    dimensions: 768,
    maxInputTokens: 2048,
    fallbacksAllowed: false,
    legacyOrFlexibleEmbeddingSurfaces: embeddingFallbacks,
  },
  cacheLineage: {
    revisionQualifiedCacheKeyRequired: true,
    textOnlyCacheSurfaces: cacheTextOnly,
  },
  featureFabric: {
    productionLayout: 'CandidateFeatureLayoutV1',
    productionScalarCount: 12,
    experimentalLatentLocalitySurfaces: unsafeFeatureSurfaces,
    latentRetrievalVote: 'FORBIDDEN_UNTIL_PROMOTED',
  },
  topology: {
    authority: 'DERIVED_ONLY',
    canonicalAuthority: false,
  },
  status: embeddingFallbacks.length || cacheTextOnly.length || unsafeFeatureSurfaces.length ? 'REVIEW_REQUIRED' : 'PROVEN_BOUNDED',
  writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphArtifacts: 0 },
  note: 'This census classifies active source surfaces; it does not infer whether a match is canonical, patch files, or mutate any store.',
};

writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`CONVERGENCE_CENSUS ${result.status} files=${rows.length} embeddingSurfaces=${embeddingFallbacks.length} cacheSurfaces=${cacheTextOnly.length} featureSurfaces=${unsafeFeatureSurfaces.length}`);
console.log(`report=${reportPath}`);
