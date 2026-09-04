#!/usr/bin/env node
/**
 * PARENT-ATLAS-CONCEPT-FABRIC-01 / CONCEPT-FABRIC-INVENTORY-01
 *
 * Read-only inventory of the existing Parent Atlas owners used to build a
 * schema-driven documentation and retrieval fabric. This deliberately does
 * not crawl external sites, call a model, touch a datastore, or create an
 * index. It records what is already present and which integration bridges
 * still need their own proof gate.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = path.join(ROOT, 'docs/reports/parent-atlas-concept-fabric-audit-v1.json');
const EXCLUDED = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build']);

const capabilityPatterns = {
  okfSchemaValidation: [
    'docs/.okf/schema.yaml', 'docs/.okf/registry.yaml', 'docs/okf-v1-source.okf',
    'concept-fabric-v1.ts', 'zod-to-json-schema',
  ],
  conceptAndDomain: [
    'domain-taxonomy.ts', 'domain-taxonomy-ml-bridge.ts', 'concept-fabric-v1.ts',
    'build-concept-seed-dry-v1.mts', 'domain-classification-adapter-v1.ts',
  ],
  sourceChunkAndAst: [
    'canonical-chunk-contract.ts', 'ast-grep-extractor.ts', 'ast-langextract-bridge.ts',
    'atlas-ast-evidence-normalizer.ts', 'canonical-chunk',
  ],
  externalDocsAndEvidence: [
    'external-doc-projection-v1.ts', 'qdrant-external-docs-hybrid.ts',
    'external-doc-retrieval-port.ts', 'firecrawl', 'crawl4ai', 'beautifulsoup',
  ],
  retrievalAndSearch: [
    'qdrant-search.ts', 'orchestrator.ts', 'retrieval-plan.ts',
    'candidate-shortlist-receipt-v1.mjs', 'go-retrieval', 'bm25',
  ],
  graphAndTuples: [
    'ontology-linked-tuple-v1.ts', 'hyperedge-contract.ts', 'neo4j-jsonl-exporter.ts',
    'export-neo4j-concept-networkx-v1.py', 'networkx', 'graph-retrieval-adapter.ts',
  ],
  aceAndPrefill: [
    'packet-io.ts', 'packet-lod-manifest.ts', 'token-aware-packer.ts',
    'ContextManifest', 'prefill', 'ace-packet-cache.ts',
  ],
  cacheAndResidency: [
    'valkey-client.ts', 'semantic-valkey.ts', 'bitfrost', 'ace-context-pack-cache.ts',
    'centroid', 'warm-startup',
  ],
  dagAndSynthesis: [
    'mastra-workflow-compiler.ts', 'parameterArtifact', 'parameter-artifact',
    'llama-server-provider.ts', 'analysis_pass_results', 'langextract-tool.ts',
  ],
  languageResolution: [
    'lsp', 'ts-morph', 'tree-sitter', 'ast-grep', 'language-provider',
  ],
};

async function walk(dir, relative = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDED.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.join(relative, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) files.push(...await walk(abs, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function matchingFiles(files, patterns) {
  return files.filter((file) => patterns.some((pattern) => file.toLowerCase().includes(pattern.toLowerCase()))).sort();
}

async function readText(relative) {
  try { return await fs.readFile(path.join(ROOT, relative), 'utf8'); } catch { return ''; }
}

async function main() {
  const files = (await walk(ROOT)).sort();
  const capabilities = Object.fromEntries(
    Object.entries(capabilityPatterns).map(([name, patterns]) => [name, {
      matchedFileCount: matchingFiles(files, patterns).length,
      files: matchingFiles(files, patterns).slice(0, 80),
    }]),
  );

  const rootPackage = JSON.parse(await readText('package.json') || '{}');
  const frontendPackage = JSON.parse(await readText('sveltekit-frontend/package.json') || '{}');
  const dependencies = { ...rootPackage.dependencies, ...rootPackage.devDependencies, ...frontendPackage.dependencies, ...frontendPackage.devDependencies };

  const report = {
    schema: 'atlas.parent-atlas-concept-fabric-audit.v1',
    generatedAt: new Date().toISOString(),
    scope: 'repository-owner-and-contract-inventory',
    writesPerformed: false,
    datastoreWritesPerformed: false,
    externalNetworkCallsPerformed: false,
    inventoryChecksum: sha256(files.join('\n')),
    inventoryFileCount: files.length,
    canonicalOwnerSummary: {
      sourceAndIdentity: 'PostgreSQL packet/chunk/source-revision tables',
      observations: '8095 Tree-sitter, AST-grep, bounded NLP/LangExtract adapters',
      denseRepresentation: 'EmbeddingGemma semantic_768',
      retrievalExecution: 'Go Retrieval/SearchRuntime with Postgres/Qdrant/GPU projections',
      graphProjection: 'Neo4j persistence plus NetworkX JSON interchange/CPU oracle',
      contextAssembly: 'ACE ContextManifest and token-aware packers',
      residency: 'BitFrost/Valkey revision- and checksum-addressed cache',
    synthesis: 'llama-server :8090, observed model selected by runtime policy',
    },
    existingPipelineOwners: {
      externalDocsAcquisition: 'scripts/docs-atlas/crawl-okf-dev-docs.mts (Firecrawl -> BeautifulSoup/fetch fallback; Zod-validated records)',
      docsCodeExtraction: 'scripts/docs-atlas/index-okf-dev-corpus.mjs (ts-morph + ast-grep; rebuildable symbol artifact)',
      directoryGraphStream: 'scripts/atlas/daily-graphify-directory-stream.mjs (manifest-bound graph stream; read-only receipt mode)',
      canonicalChunkContract: 'sveltekit-frontend/src/lib/server/atlas/contracts/canonical-chunk-contract.ts',
      retrievalBoundary: 'sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts + search/qdrant-search.ts',
      aceAssembly: 'scripts/atlas/ace-packet-assembly.mjs + server ACE ContextManifest adapters',
      synthesisBoundary: 'llama-server :8090/v1; Ollama remains EmbeddingGemma-only',
    },
    directoryIndexingStatus: {
      existingManifestPreview: 'scripts/atlas/preview-indexable-source-manifest-v1.mjs',
      existingGraphStream: 'scripts/atlas/daily-graphify-directory-stream.mjs',
      currentState: 'AVAILABLE_AS_READ_ONLY_ARTIFACT_PIPELINE',
      promotionState: 'NOT_PROVEN',
      sourceRevisionCaveat: 'The preview currently reports repository/git revision metadata; per-file canonical admission still requires exact source bytes, per-file sourceRevision, content hash, and workspace binding.',
      nextGate: 'DIRECTORY-INDEX-SOURCE-BINDING-01',
    },
    existingContractsAndOwners: capabilities,
    dependencyAvailability: {
      zod: Boolean(dependencies.zod),
      yaml: Boolean(dependencies.yaml),
      tsMorph: Boolean(dependencies['ts-morph']),
      astGrepCli: Boolean(dependencies['@ast-grep/cli']),
      qdrantClient: Boolean(dependencies['@qdrant/js-client-rest'] || dependencies['@qdrant/js-client-rest']),
      redis: Boolean(dependencies.redis || dependencies.ioredis),
      neo4j: Boolean(dependencies['neo4j-driver']),
      firecrawlClient: Boolean(dependencies['@mendable/firecrawl-js']),
    },
    schemaValidationModel: {
      okfSchema: 'docs/.okf/schema.yaml',
      okfRegistry: 'docs/.okf/registry.yaml',
      runtimeValidation: 'Zod contracts in sveltekit-frontend/src/lib/server/atlas/contracts',
      canonicalConceptSchema: 'concept-fabric-v1.ts',
      canonicalSerializationRequired: true,
      checksumRequired: true,
    },
    openBridges: [
      { gate: 'CONCEPT-SEED-DRY-01', status: 'EXISTS_READ_ONLY', owner: 'scripts/atlas/build-concept-seed-dry-v1.mts' },
      { gate: 'DIRECTORY-INDEX-OWNER-01', status: 'NEEDS_SINGLE_INCREMENTAL_OWNER', note: 'inventory -> chunks -> FTS/semantic/projections' },
      { gate: 'EXTERNAL-EVIDENCE-01', status: 'NEEDS_REVISION_SEALED_ACQUISITION', note: 'discovery must remain separate from durable evidence' },
      { gate: 'DAG-PARAMETER-MATERIALIZATION-01', status: 'OPEN', note: 'per-operator ParameterArtifactV1 instead of generic bound arguments' },
      { gate: 'ACE-FEATURE-SOURCE-OWNER-01', status: 'OPEN', note: 'live SearchRuntime snapshot -> ContextManifestV2 adapter' },
      { gate: 'BITFROST-HOT-READBACK-01', status: 'OPEN', note: 'hit/miss/stale rejection/invalidation proof' },
      { gate: 'LANGUAGE-SEMANTIC-PARITY-01', status: 'OPEN', note: 'Tree-sitter/AST-grep/ts-morph/LSP source-span alignment' },
      { gate: 'CONCEPT-RECOGNITION-ADAPTER-01', status: 'OPEN', note: 'observations -> existing ontology admission; no semantic auto-promotion' },
      { gate: 'CANDIDATE-FIT-EXPLANATION-01', status: 'OPEN', note: 'extend existing reranker; do not add a second ranker' },
    ],
    nextSafeStages: [
      'validate .okf and Zod schemas against fixtures',
      'run concept seed dry report and compare proposal checksum',
      'build directory indexing plan with sourceRevision and chunk checksums',
      'validate ACE prefill references without warming or writing cache',
      'promote implementation from scripts/atlas only after receipts pass',
    ],
    prohibitedInThisAudit: [
      'no Postgres/Qdrant/Neo4j/Valkey writes',
      'no external crawl or LLM invocation',
      'no Ollama generation; EmbeddingGemma remains the only permitted Ollama lane',
      'no 15128 or 151128 cohort interpretation',
    ],
  };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report: path.relative(ROOT, REPORT).replaceAll('\\', '/'), inventoryFileCount: files.length, inventoryChecksum: report.inventoryChecksum, writesPerformed: false }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
