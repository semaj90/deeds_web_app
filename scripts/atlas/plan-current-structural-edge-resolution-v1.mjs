#!/usr/bin/env node
/**
 * CSGR-2: wire the compiler-semantic resolver into the current-source structural edge plan.
 *
 * Reads docs/reports/current-structural-edge-artifact-plan-v2.json's unresolvedEdges, and for
 * each:
 *   - `syntax_only` (mostly import statements): classify the specifier via
 *     classifyModuleSpecifier() — no LSP call. EXTERNAL_MODULE is a correct terminal state.
 *   - `unresolved_target` (the sidecar found a reference/call it couldn't resolve within the
 *     same file): use the edge's own `evidenceStartLine`/`evidenceStartColumn` (1-indexed, the
 *     sidecar's raw convention — confirmed live against real source 2026-08-29) directly, no
 *     node join required. An earlier version of this script tried joining via
 *     `nodes[].upstreamNodeId`, which only covers occurrences the planner also materialized as a
 *     first-class chunk node (~5% of edges in a live sample) — this position-on-the-edge approach
 *     covers every edge the sidecar reports, since it's already there in the raw response.
 *
 * Read-only: writes only the output report, never mutates graphify_runs, workspaces, or graph
 * data. Per this proposal's CSGR-5 gate, this does NOT scale to the full corpus — it runs the
 * bounded 111-file cohort's edges (or a --limit-slice of the unresolved_target set, since a live
 * LSP call per edge has real per-call latency that must be measured, not guessed, before any
 * larger run is attempted).
 */

import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { createCompilerSemanticResolver, classifyModuleSpecifier } from './lib/compiler-semantic-resolver-v1.mjs';

const root = REPO_ROOT;
const frontendRoot = path.join(root, 'sveltekit-frontend');
const inputPath = path.join(root, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const outputPath = path.join(root, 'docs/reports/current-structural-edge-resolution-v1.json');
const unresolvedTargetLimit = Math.max(0, Number(process.env.ATLAS_CSGR2_UNRESOLVED_TARGET_LIMIT ?? 200));

function readDependencySet() {
  const deps = new Set();
  for (const pkgPath of [path.join(root, 'package.json'), path.join(frontendRoot, 'package.json')]) {
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) deps.add(name);
  }
  return deps;
}

function extractSpecifier(evidenceText) {
  const fromMatch = evidenceText.match(/from\s+['"]([^'"]+)['"]/);
  if (fromMatch) return fromMatch[1];
  const requireMatch = evidenceText.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
  if (requireMatch) return requireMatch[1];
  const bareImportMatch = evidenceText.match(/import\s+['"]([^'"]+)['"]/);
  if (bareImportMatch) return bareImportMatch[1];
  return null;
}

function languageForSourceRef(sourceRef) {
  if (/\.(tsx?|mts|cts)$/.test(sourceRef)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(sourceRef)) return 'javascript';
  if (/\.svelte$/.test(sourceRef)) return 'svelte';
  return null;
}

function importedNodeBuiltinReference(edge, sourceText) {
  const reference = String(edge.toEvidenceKey ?? '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(reference)) return null;
  for (const builtin of builtinModules) {
    const moduleName = builtin.startsWith('node:') ? builtin.slice(5) : builtin;
    if (!moduleName || moduleName.includes('/')) continue;
    const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const imported = new RegExp(`(?:from\\s+|require\\(\\s*)['"](?:node:)?${escaped}['"]`);
    if (!imported.test(sourceText)) continue;
    const referencePattern = new RegExp(`\\b${reference.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`);
    if (referencePattern.test(sourceText)) return `node:${moduleName}`;
  }
  return null;
}

async function main() {
  const artifact = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const unresolvedEdges = Array.isArray(artifact.unresolvedEdges) ? artifact.unresolvedEdges : [];

  const syntaxOnlyEdges = unresolvedEdges.filter((e) => e.resolution === 'syntax_only');
  const unresolvedTargetEdges = unresolvedEdges.filter((e) => e.resolution === 'unresolved_target');
  const dependencySet = readDependencySet();

  // --- syntax_only: classify by specifier, no LSP call, full set (cheap). ---
  //
  // Two real bugs found and fixed here (2026-08-29, full-corpus run against real data, not
  // assumed): both explain the entire "658 UNKNOWN_SPECIFIER" figure from the prior pass.
  //
  // Bug 1 — EXPORTS-typed edges were run through extractSpecifier(), which only matches
  // `from '...'`/`require(...)`/bare-quoted-import patterns. Live check: 0/468 EXPORTS-typed
  // syntax_only edges in this corpus have any such pattern in toEvidenceKey — every one is a
  // plain local declaration (`export function foo() {}`, `export class Foo {}`, etc.), which
  // has no module specifier to extract by construction (this dataset has zero re-export-from
  // edges to worry about; if one ever appears, the defensive `from '...'` check below still
  // catches it). Applying the import-specifier classifier to a declaration edge was a category
  // error, not a missing-data problem — fixed by giving EXPORTS its own path.
  //
  // Bug 2 — IMPORTS-typed edges come in pairs sharing the same fromEvidenceKey: one edge's
  // toEvidenceKey carries the full statement text (`"import fs from 'node:fs';"`, extractable)
  // and a sibling edge's toEvidenceKey carries just the bound identifier (`"fs"`, not
  // extractable by design — there's no specifier string on that edge, it lives on the sibling).
  // Live check: exactly 154/308 IMPORTS-typed edges lack an extractable specifier, and 308 is
  // even — consistent with "every import statement produces exactly 2 edges". Fixed by grouping
  // IMPORTS-typed edges by (fromEvidenceKey, sourceRef) and propagating a resolved sibling's
  // classification to the unresolvable one, tagged `siblingDerived: true` so it's distinguishable
  // from a directly-extracted classification.
  const EXPORT_REEXPORT_PATTERN = /from\s+['"]([^'"]+)['"]/;

  const syntaxOnlyResults = [];
  const importGroups = new Map(); // (fromEvidenceKey|sourceRef) -> edges, IMPORTS-typed only

  for (const edge of syntaxOnlyEdges) {
    if (edge.type === 'EXPORTS') {
      const reExportMatch = EXPORT_REEXPORT_PATTERN.exec(edge.toEvidenceKey ?? '');
      if (reExportMatch) {
        // Defensive path — not observed in this corpus, but a genuine re-export (`export { x }
        // from './y'`) does have a real module specifier and should be classified as one.
        const specifier = reExportMatch[1];
        syntaxOnlyResults.push({ sourceRef: edge.sourceRef, type: edge.type, toEvidenceKey: edge.toEvidenceKey, specifier, classification: classifyModuleSpecifier(specifier, { packageJsonDependencies: dependencySet }) });
      } else {
        // Plain local declaration — the "target" of an EXPORTS edge is a symbol in this same
        // file, not an external reference. Matches the operator-specified terminal enum's
        // RESOLVED_INTERNAL, not UNKNOWN_SPECIFIER.
        syntaxOnlyResults.push({ sourceRef: edge.sourceRef, type: edge.type, toEvidenceKey: edge.toEvidenceKey, specifier: null, classification: 'RESOLVED_INTERNAL' });
      }
      continue;
    }

    // IMPORTS-typed: classify directly where possible, defer sibling-derived ones to a second pass.
    const specifier = extractSpecifier(edge.toEvidenceKey ?? '');
    const classification = specifier ? classifyModuleSpecifier(specifier, { packageJsonDependencies: dependencySet }) : null;
    const result = { sourceRef: edge.sourceRef, type: edge.type, toEvidenceKey: edge.toEvidenceKey, specifier, classification, siblingDerived: false };
    syntaxOnlyResults.push(result);

    const groupKey = `${edge.fromEvidenceKey}|${edge.sourceRef}`;
    if (!importGroups.has(groupKey)) importGroups.set(groupKey, []);
    importGroups.get(groupKey).push(result);
  }

  // Second pass: propagate a resolved classification to unresolved siblings within each IMPORTS group.
  let siblingResolvedCount = 0;
  for (const group of importGroups.values()) {
    const resolved = group.find((r) => r.classification !== null);
    if (!resolved) continue;
    for (const r of group) {
      if (r.classification === null) {
        r.classification = resolved.classification;
        r.siblingDerived = true;
        siblingResolvedCount += 1;
      }
    }
  }
  // Anything still null after sibling propagation is genuinely unclassifiable from syntax alone.
  for (const r of syntaxOnlyResults) {
    if (r.classification === null) r.classification = 'UNKNOWN_SPECIFIER';
  }

  const syntaxOnlyCounts = {};
  for (const r of syntaxOnlyResults) syntaxOnlyCounts[r.classification] = (syntaxOnlyCounts[r.classification] ?? 0) + 1;

  // --- unresolved_target: use the edge's own evidenceStartLine/Column directly (no node join —
  // see header comment; a node-join approach was tried first and only covered ~5% of edges live). ---
  // unresolvedTargetEdges is grouped by source file in array order, and the first files
  // alphabetically are all scripts/atlas/* (outside the resolver's sveltekit-frontend/ root) —
  // an unbiased .slice(0, N) sampled zero in-workspace edges twice in a row live 2026-08-29.
  // Bias the sample toward sveltekit-frontend/ files so the resolver actually gets exercised;
  // out-of-workspace edges are still counted (OUTSIDE_RESOLVER_WORKSPACE_ROOT), just not
  // over-represented in a bounded sample.
  const inWorkspace = unresolvedTargetEdges.filter((e) => e.sourceRef.startsWith('sveltekit-frontend/'));
  const outOfWorkspace = unresolvedTargetEdges.filter((e) => !e.sourceRef.startsWith('sveltekit-frontend/'));
  const sampled = unresolvedTargetLimit > 0
    ? [...inWorkspace.slice(0, unresolvedTargetLimit), ...outOfWorkspace.slice(0, Math.min(10, unresolvedTargetLimit))]
    : unresolvedTargetEdges;
  const frontendResolver = createCompilerSemanticResolver({ workspaceRoot: frontendRoot });
  // Second resolver root for source files outside sveltekit-frontend/ (scripts/**, root src/lib/**
  // — the two dirs that actually cover every OUTSIDE_RESOLVER_WORKSPACE_ROOT edge, confirmed live
  // 2026-08-29). serverBinaryRoot stays pointed at sveltekit-frontend/ since repo root has no
  // node_modules of its own — see createCompilerSemanticResolver's serverBinaryRoot doc comment
  // for the exact failure mode this avoids (a missing binary silently hangs to a 60s initialize
  // timeout via the Windows shell wrapper instead of failing fast). Also requires
  // scripts/tsconfig.json (added this session) — without it, tsserver treats these as loose
  // out-of-project files with no @types/node, and every resolution comes back UNRESOLVED even
  // once the server itself starts correctly.
  const rootResolver = createCompilerSemanticResolver({ workspaceRoot: root, serverBinaryRoot: frontendRoot });
  const sourceCache = new Map(); // sourceRef -> { buffer, absolutePath } | null (missing)
  const unresolvedTargetResults = [];
  let requestCount = 0;
  const startedAt = Date.now();
  const concurrency = Math.max(1, Math.min(8, Number(process.env.ATLAS_CSGR2_CONCURRENCY ?? 4)));
  const timeoutMs = Math.max(250, Math.min(15000, Number(process.env.ATLAS_CSGR2_TIMEOUT_MS ?? 5000)));

  async function processEdge(edge) {
    const language = languageForSourceRef(edge.sourceRef);
    if (!language) {
      unresolvedTargetResults.push({ sourceRef: edge.sourceRef, edgeType: edge.type, language: null, fromEvidenceKey: edge.fromEvidenceKey, status: 'UNSUPPORTED_LANGUAGE' });
      return;
    }
    if (edge.evidenceStartLine == null || edge.evidenceStartColumn == null) {
      unresolvedTargetResults.push({ sourceRef: edge.sourceRef, edgeType: edge.type, language, fromEvidenceKey: edge.fromEvidenceKey, status: 'NO_EVIDENCE_POSITION' });
      return;
    }
    if (!sourceCache.has(edge.sourceRef)) {
      // sourceRef is always repo-root-relative (matches plan-current-structural-edge-artifact-v2.mjs's
      // own path.join(root, source.sourceRef) convention).
      const absolutePath = path.join(root, edge.sourceRef);
      sourceCache.set(edge.sourceRef, fs.existsSync(absolutePath) ? { buffer: fs.readFileSync(absolutePath), absolutePath } : null);
    }
    const source = sourceCache.get(edge.sourceRef);
    if (!source) {
      unresolvedTargetResults.push({ sourceRef: edge.sourceRef, edgeType: edge.type, language, fromEvidenceKey: edge.fromEvidenceKey, status: 'SOURCE_FILE_NOT_FOUND' });
      return;
    }
    const sourceText = source.buffer.toString('utf8');
    const importedBuiltin = importedNodeBuiltinReference(edge, sourceText);
    if (importedBuiltin) {
      unresolvedTargetResults.push({ sourceRef: edge.sourceRef, edgeType: edge.type, language, fromEvidenceKey: edge.fromEvidenceKey, toEvidenceKey: edge.toEvidenceKey, status: 'NODE_BUILTIN', targetCount: 0, builtin: importedBuiltin });
      return;
    }
    const resolver = source.absolutePath.startsWith(frontendRoot) ? frontendResolver : rootResolver;
    requestCount += 1;
    const resolution = await resolver.resolveDefinition({
      requestId: `csgr2:${edge.sourceRef}:${edge.fromEvidenceKey}`,
      workspaceRevision: artifact.workspaceRevision,
      sourceRef: edge.sourceRef,
      sourceRevision: edge.sourceRevision ?? null,
      sourceAbsolutePath: source.absolutePath,
      // REQUIRED — without this, ensureOpen()'s didOpen() sends `text: undefined`, which
      // JSON.stringify silently drops from the wire message entirely. The server then falls back
      // to reading the file live from disk, which means resolution runs against whatever is on
      // disk *right now*, not the exact bytes bound to sourceRevision — the exact STALE_SOURCE
      // risk this contract exists to prevent. Found live 2026-08-29 (resolution appeared to work,
      // 148/200, but was silently checking disk content instead of the bound revision).
      sourceText,
      // Sidecar convention is 1-indexed line/column (verified live 2026-08-29); LSP positions are
      // 0-indexed for both.
      position: { line: edge.evidenceStartLine - 1, character: edge.evidenceStartColumn },
      edgeType: edge.type,
      sourceEvidenceRef: edge.toEvidenceKey,
      language,
      timeoutMs,
    });
    unresolvedTargetResults.push({ sourceRef: edge.sourceRef, edgeType: edge.type, language, fromEvidenceKey: edge.fromEvidenceKey, toEvidenceKey: edge.toEvidenceKey, status: resolution.result.status, targetCount: resolution.result.targets.length, error: resolution.result.error ?? null });
  }
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= sampled.length) return;
      await processEdge(sampled[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(sampled.length, 1)) }, worker));
  await Promise.all([frontendResolver.dispose(), rootResolver.dispose()]);
  const durationMs = Date.now() - startedAt;

  const unresolvedTargetCounts = {};
  for (const r of unresolvedTargetResults) unresolvedTargetCounts[r.status] = (unresolvedTargetCounts[r.status] ?? 0) + 1;
  const unresolvedTargetDimensions = {};
  for (const result of unresolvedTargetResults) {
    const key = `${result.status}|${result.language ?? 'none'}|${result.edgeType ?? 'unknown'}`;
    unresolvedTargetDimensions[key] = (unresolvedTargetDimensions[key] ?? 0) + 1;
  }
  const diagnosticSamples = unresolvedTargetResults
    .filter((result) => ['UNRESOLVED', 'TIMEOUT', 'SERVER_ERROR', 'STALE_SOURCE'].includes(result.status))
    .sort((a, b) => (a.status === 'TIMEOUT' ? -1 : 0) - (b.status === 'TIMEOUT' ? -1 : 0))
    .slice(0, 25);

  const report = {
    schema: 'atlas.current-structural-edge-resolution.v1',
    mode: 'READ_ONLY_PLAN',
    generatedAt: new Date().toISOString(),
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphArtifacts: false },
    canonicalAuthority: false,
    inputWorkspaceRevision: artifact.workspaceRevision,
    totalUnresolvedEdges: unresolvedEdges.length,
    syntaxOnly: { total: syntaxOnlyEdges.length, sampled: syntaxOnlyResults.length, counts: syntaxOnlyCounts, siblingResolvedCount },
    unresolvedTarget: {
      total: unresolvedTargetEdges.length,
      sampled: sampled.length,
      sampleIsPartial: sampled.length < unresolvedTargetEdges.length,
      requestCount,
      concurrency,
      timeoutMs,
      durationMs,
      avgMsPerRequest: requestCount > 0 ? Math.round(durationMs / requestCount) : null,
      counts: unresolvedTargetCounts,
      dimensions: unresolvedTargetDimensions,
      diagnosticSamples,
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'CSGR2_SAMPLE_COMPLETE',
    syntaxOnlyCounts,
    unresolvedTargetSampleSize: sampled.length,
    unresolvedTargetTotal: unresolvedTargetEdges.length,
    unresolvedTargetCounts,
    avgMsPerRequest: report.unresolvedTarget.avgMsPerRequest,
    reportPath: path.relative(root, outputPath),
  }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
