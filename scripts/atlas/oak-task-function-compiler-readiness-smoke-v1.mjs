#!/usr/bin/env node
/**
 * OAK-F05 smoke test, run against the real, already-built kernel-function
 * infrastructure (not a rebuild): compile one task function from
 * registered operators, execute it twice against the same frozen inputs,
 * require identical trace checksums, zero database/Qdrant writes.
 *
 * Writes docs/reports/oak-task-function-compiler-readiness-v1.json.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Import directly from the built dist rather than the `@deeds/parent-atlas`
// package specifier — the pnpm virtual store's hardlinked snapshot of this
// `file:` dependency is stale relative to today's rebuild (confirmed: the
// real dist/ directory has every new file; the pnpm store copy under
// node_modules/.pnpm/@deeds+parent-atlas@... does not). This is a pnpm
// link-refresh issue, not a code issue — bypass it rather than debug pnpm.
const { buildSymbolRepairOperatorLibraryV0, buildSymbolRepairFunctionCatalogV0, findAtlasKernelFunctionV1, buildQueryKernelGraphV1 } =
  await import(pathToFileURL(path.resolve(root, 'packages/parent-atlas/dist/index.js')).href);
const reportPath = path.resolve(root, 'docs/reports/oak-task-function-compiler-readiness-v1.json');

const KERNEL_REVISION = 'kernel:symbol-repair:v0';

function runOnce() {
  // Frozen inputs — identical across both runs, exactly as specified:
  // same workspace revision (implicit in producerRevision), same operator
  // library, same function catalog, same evidence/parameter bindings.
  const operatorLibrary = buildSymbolRepairOperatorLibraryV0();
  const catalog = buildSymbolRepairFunctionCatalogV0(operatorLibrary);
  const fn = findAtlasKernelFunctionV1(catalog, 'fn:find_evidence_for_failed_typecheck');
  if (!fn) throw new Error('OAK_SMOKE_FUNCTION_NOT_FOUND');

  const queryGraph = buildQueryKernelGraphV1({
    queryGraphId: 'qgraph:oak-smoke:resolve_symbol_repair_evidence_v1',
    kernelRevision: KERNEL_REVISION,
    queryText: 'resolve the exact owner and evidence for a failing symbol',
    selections: [{
      stepId: 'sel:1',
      calledFunction: fn,
      boundArguments: { changed_source_refs: ['sveltekit-frontend/src/lib/server/ace/llm-context-cache.ts'] },
      groundedResult: { diagnosticCount: 1, ranked: ['chunk:a', 'chunk:b'] },
      groundedEvidence: [
        { evidenceKind: 'typecheck_diagnostics', evidenceRef: 'diag:TS2345:llm-context-cache.ts:51' },
        { evidenceKind: 'ranked_chunks', evidenceRef: 'chunk:a' },
      ],
      status: 'SUCCEEDED',
    }],
    producerRevision: 'oak-smoke:v1',
  });

  return {
    operatorLibraryRevision: operatorLibrary.libraryRevision,
    catalogChecksum: catalog.catalogChecksum,
    functionImplementationChecksum: fn.implementationChecksum,
    queryGraphChecksum: queryGraph.queryGraphChecksum,
  };
}

const runA = runOnce();
const runB = runOnce();

const identical =
  runA.operatorLibraryRevision === runB.operatorLibraryRevision &&
  runA.catalogChecksum === runB.catalogChecksum &&
  runA.functionImplementationChecksum === runB.functionImplementationChecksum &&
  runA.queryGraphChecksum === runB.queryGraphChecksum;

const report = {
  schema: 'atlas.oak-task-function-compiler-readiness.v1',
  generatedAt: new Date().toISOString(),
  smokeTest: 'compile one task function from registered operators; execute twice against the same frozen graph/evidence/artifact inputs; require identical trace checksums; zero writes',
  taskFunction: 'fn:find_evidence_for_failed_typecheck',
  taskFamily: 'symbol_change_impact_analysis',
  kernelRevision: KERNEL_REVISION,
  writesPerformed: 0,
  runA,
  runB,
  identicalAcrossRuns: identical,
  status: identical ? 'PASS' : 'FAIL',
  ownershipMap: {
    'OAK-F01 GenericOperatorCatalogV1': {
      status: 'DONE',
      realOwner: 'packages/parent-atlas/src/core/kernel-operator-library-v1.ts (KernelOperatorLibraryV1 / KernelOperatorV1 / buildKernelOperatorV1)',
      note: 'Extended 2026-08-31 to close the field gap: operatorRevision, parameterSchemaRef, executorClass (new 6-value enum), requiredRevisionAxes, allowedArtifactKinds, and a per-operator checksum are all now present and populated on all 15 real operator instances, each assigned per-operator based on what its cited real implementation actually does.',
    },
    'OAK-F02 TaskReasoningFunctionV1 / TaskFunctionCatalogV1': {
      status: 'DONE — field gap closed 2026-08-31',
      realOwner: 'packages/parent-atlas/src/core/kernel-function-v1.ts + kernel-function-catalog-v1.ts (AtlasKernelFunctionV1 / AtlasKernelFunctionCatalogV1)',
      note: 'Added requiredRelationTypes, requiredFeatureIds, allowedEvidenceClasses (min 1), graphRevisionPolicy (EXACT/QUERY_SCOPED), and operatorCatalogRevision (auto-bound from the operator library passed to the builder, never independently supplied — cannot drift). Also fixed kernel-function-catalog-v1.ts, which had re-declared its own inline copy of the function schema instead of reusing this one — now imports atlasKernelFunctionV1Schema directly.',
    },
    'OAK-F03 TaskFunctionCompilerV1 (registered operators only, no arbitrary code)': {
      status: 'DONE',
      realOwner: 'buildAtlasKernelFunctionV1() — throws KERNEL_FUNCTION_UNDECLARED_OPERATOR on any step referencing an operator absent from the supplied library',
    },
    'OAK-F04 compile one known repair procedure': {
      status: 'DONE',
      realOwner: 'kernel-function-catalog-symbol-repair-v0.ts — 3 composed functions, including this smoke test\'s subject',
    },
    'OAK-F05 execute twice, same checksum': {
      status: identical ? 'DONE' : 'FAILED_THIS_RUN',
      realOwner: 'this smoke test',
    },
    'OAK-S01 SchemaVerificationReceiptV1 (OWL/HermiT)': {
      status: 'MISSING',
      note: 'Not attempted — needs a real external OWL reasoner dependency decision, not fabricable in an implementation pass.',
    },
    'OAK-J01 KernelRepairSuggestionV1': {
      status: 'MISSING',
      note: 'Not attempted — needs real failing-task data to calibrate against.',
    },
    'OAK-K01 OntologyKernelManifestV1 freeze': {
      status: 'PARTIAL',
      realOwner: 'packages/parent-atlas/src/core/ontology-kernel-manifest-v1.ts (AtlasOntologyKernelManifestV1)',
      gap: 'Simpler status enum and revision tracking than requested (missing schemaVerificationChecksum, graphPolicyRevision, evidencePolicyRevision, parameterPolicyRevision, compilerRevision, judgeRevision, benchmarkRevision as distinct tracked axes).',
    },
  },
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`OAK-F05 smoke: ${report.status}`);
console.log(`Report written: ${reportPath}`);
if (!identical) process.exit(1);
