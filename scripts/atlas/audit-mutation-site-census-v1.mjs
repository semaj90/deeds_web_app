#!/usr/bin/env node
/**
 * PACKET_REGISTRY_WRITER_OWNERSHIP_01B — mutation-site-level census (read-only)
 *
 * Reopens PACKET_REGISTRY_WRITER_OWNERSHIP_01 at the correct granularity.
 * The prior gate proved MODULE-level import reachability, which two
 * separate corrections this session showed is not proof of MUTATION
 * reachability -- a module can be imported production-wide while its actual
 * writer function is called only by its own test, and a background-task
 * summary can misattribute one function's write scope to a neighboring one.
 *
 * This script uses ts-morph (AST, not regex) to find every Drizzle
 * `.insert(atlasPackets)` / `.update(atlasPackets)` / registry-equivalent
 * call expression in a fixed set of candidate files, resolve its ENCLOSING
 * FUNCTION by AST ancestry (not line-range guessing), and record exactly
 * which columns are written and what the conflict/where predicate is.
 *
 * Call-graph reachability (does any production runtime root actually call
 * that enclosing function) is then checked by targeted, function-NAME-scoped
 * rg search — not file/module-name search, which is what produced this
 * session's two false positives. Every reachability claim in the receipt
 * cites the exact caller file; nothing is inferred from cooccurrence.
 *
 * CANDIDATE_FILES is the union of every file this session's manual
 * investigation and the two Drizzle-writer sweeps (INSERT/UPDATE literal-SQL
 * grep, then `.insert|update(atlasPackets)` ORM grep) surfaced as touching
 * atlas_packets or atlas_packet_registry from live application code
 * (sveltekit-frontend/src). Standalone scripts/ candidates from the v1 gate
 * are NOT re-audited here at AST granularity -- they remain classified by
 * the v1 receipt's heuristic (package.json / cron-chain reachability), which
 * is a defensible granularity for one-shot CLI scripts with no route/
 * dispatcher caller path, unlike the production src/ writers this gate
 * targets. That scoping choice is recorded explicitly in the receipt, not
 * silently implied as full-repo AST coverage.
 *
 * Writes ONE receipt. Never executes a writer, never mutates schema/data.
 */
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'packet-registry-writer-ownership-01b-mutation-census-v1.json');

const CANDIDATE_FILES = [
  'sveltekit-frontend/src/lib/server/topology/canonical-id-hierarchy.ts',
  'sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts',
  'sveltekit-frontend/src/lib/server/unknown/promotion-executor.ts',
  'sveltekit-frontend/src/lib/server/workers/identity-worker.ts',
  'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
  'sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts',
  'sveltekit-frontend/src/lib/server/dispatch/mcp-tool-implementations.ts',
  'sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts',
  'sveltekit-frontend/src/lib/server/indexer/feature-label-enricher.ts',
  'sveltekit-frontend/src/lib/server/indexer/summary-freshness-checker.ts',
  'sveltekit-frontend/src/lib/gpu/som-clustering.ts',
  'sveltekit-frontend/src/lib/server/retrieval/promote-results.ts',
  'sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts',
];

const RUNTIME_ROOT_PATTERNS = [
  /\+server\.ts$/, /\+page\.server\.ts$/, /\+layout\.server\.ts$/,
  /^sveltekit-frontend\/src\/mcp\/server\.ts$/,
  /^sveltekit-frontend\/src\/hooks\.server\.ts$/,
];

function rgFn(fnName, roots) {
  try {
    const output = execFileSync(
      'rg',
      ['-n', '--no-ignore', '--hidden', '--glob', '!**/node_modules/**', '--glob', '!**/.git/**', '--glob', '!**/dist/**', '--glob', '!**/.svelte-kit/**', '--fixed-strings', '--', `${fnName}(`, ...roots],
      { cwd: ROOT, encoding: 'utf8', timeout: 20000 },
    );
    return output.split(/\r?\n/).filter(Boolean).map((line) => {
      const idx = line.indexOf(':');
      const idx2 = line.indexOf(':', idx + 1);
      return { file: line.slice(0, idx).replaceAll('\\', '/'), line: Number(line.slice(idx + 1, idx2)), text: line.slice(idx2 + 1).trim() };
    });
  } catch {
    return [];
  }
}

function enclosingFunctionName(node) {
  // BUG FIX (found live 2026-09-08): the original walker returned the name of
  // ANY VariableDeclaration ancestor, including a local result binding like
  // `const updated = await db.update(...)` -- which is not the enclosing
  // function, just a variable inside it. That produced a fabricated function
  // name "updated" for 5 real mutation sites in mcp-tool-implementations.ts,
  // which then poisoned the caller search (rgFn("updated(", ...) matched an
  // unrelated Svelte `onupdated()` callback in CitationSearch.svelte and was
  // reported as a caller of a database write it has nothing to do with).
  // Fix: only stop at a VariableDeclaration if its initializer is actually a
  // function/arrow-function value (i.e. `const fn = async (...) => {...}` or
  // `const fn = function(...) {...}`), never a plain value/await expression.
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration) {
      const name = current.getName?.();
      if (name) return name;
    }
    if (kind === SyntaxKind.VariableDeclaration) {
      const init = current.getInitializer?.();
      const initKind = init?.getKind?.();
      if (initKind === SyntaxKind.ArrowFunction || initKind === SyntaxKind.FunctionExpression) {
        const name = current.getName?.();
        if (name) return name;
      }
      // else: not a function-valued binding (e.g. a local `const updated = await db.update(...)`
      // result) -- do not stop here, keep walking up to the real enclosing function.
    }
    current = current.getParent();
  }
  return '(module scope)';
}

function extractMutationSites(project, relPath) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) return [];
  const sourceFile = project.addSourceFileAtPath(absPath);
  const sites = [];
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node;
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return;
    const propName = expr.getName();
    if (propName !== 'insert' && propName !== 'update' && propName !== 'delete') return;
    const args = call.getArguments();
    const argText = args.map((a) => a.getText()).join(', ');
    if (!/atlasPackets|atlas_packets|atlasPacketRegistry|atlas_packet_registry/.test(argText)) return;

    const fnName = enclosingFunctionName(call);
    const startLine = call.getStartLineNumber();

    // Try to find a following .values(...) / .set(...) / .onConflictDoUpdate(...) chain
    // by walking up to the full chained call expression's text (bounded to 2000 chars for readability).
    let chainRoot = call;
    let parent = chainRoot.getParent();
    while (parent && (parent.getKind() === SyntaxKind.PropertyAccessExpression || parent.getKind() === SyntaxKind.CallExpression)) {
      chainRoot = parent.getKind() === SyntaxKind.CallExpression ? parent : chainRoot;
      parent = parent.getParent();
    }
    const chainText = chainRoot.getText().slice(0, 2000);
    const columnsMatch = chainText.match(/\.(?:values|set)\(\s*\{([\s\S]{0,600}?)\}/);
    const columns = columnsMatch
      ? [...new Set([...columnsMatch[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]))]
      : [];
    const hasOnConflict = /\.onConflictDoUpdate\(/.test(chainText);
    const whereMatch = chainText.match(/\.where\(([\s\S]{0,200}?)\)/);

    sites.push({
      file: relPath,
      line: startLine,
      enclosingFunction: fnName,
      operation: propName.toUpperCase(),
      targetTable: /atlasPacketRegistry|atlas_packet_registry/.test(argText) ? 'atlas_packet_registry' : 'atlas_packets',
      columnsWritten: columns,
      hasOnConflictDoUpdate: hasOnConflict,
      wherePredicate: whereMatch ? whereMatch[1].trim() : null,
    });
  });
  return sites;
}

function classifySite(site, callers) {
  const identityCols = ['packetKey', 'packetId', 'sourceRef', 'featureId', 'featureLabel', 'directoryPath'];
  const writesIdentity = site.columnsWritten.some((c) => identityCols.includes(c)) || site.operation === 'INSERT';
  const productionCallers = callers.filter((c) => !c.file.endsWith('.spec.ts') && !c.file.endsWith('.test.ts'));
  const testOnlyCallers = callers.filter((c) => c.file.endsWith('.spec.ts') || c.file.endsWith('.test.ts'));
  const reachableFromRuntimeRoot = productionCallers.some((c) => RUNTIME_ROOT_PATTERNS.some((p) => p.test(c.file)));

  let classification;
  if (productionCallers.length === 0 && testOnlyCallers.length > 0) classification = 'TEST_ONLY_UNOWNED';
  else if (productionCallers.length === 0) classification = 'PRODUCTION_CAPABLE_UNOWNED';
  else if (writesIdentity && site.operation === 'INSERT') classification = 'CANONICAL_WRITER';
  else if (writesIdentity) classification = 'CANONICAL_METADATA_MUTATOR';
  else classification = 'REPRESENTATION_OR_METADATA_WRITER';

  return {
    ...site,
    writesIdentity,
    productionCallerCount: productionCallers.length,
    productionCallers: productionCallers.map((c) => `${c.file}:${c.line}`),
    testOnlyCallerCount: testOnlyCallers.length,
    reachableFromKnownRuntimeRootPattern: reachableFromRuntimeRoot,
    classification,
  };
}

async function main() {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, compilerOptions: { allowJs: true } });

  const allSites = [];
  for (const relPath of CANDIDATE_FILES) {
    const sites = extractMutationSites(project, relPath);
    allSites.push(...sites);
  }

  const classified = allSites.map((site) => {
    const callers = rgFn(site.enclosingFunction, ['sveltekit-frontend/src', 'scripts', 'packages'])
      .filter((c) => !(c.file === site.file && c.line === site.line)) // exclude the definition line itself when name matches call pattern
      .filter((c) => !c.file.endsWith(site.file)); // exclude same-file self references (definition + internal helpers)
    return classifySite(site, callers);
  });

  const classificationCounts = classified.reduce((out, s) => { out[s.classification] = (out[s.classification] ?? 0) + 1; return out; }, {});
  const canonicalWriters = classified.filter((s) => s.classification === 'CANONICAL_WRITER');
  const canonicalMetadataMutators = classified.filter((s) => s.classification === 'CANONICAL_METADATA_MUTATOR');
  const unowned = classified.filter((s) => s.classification === 'PRODUCTION_CAPABLE_UNOWNED');
  const testOnly = classified.filter((s) => s.classification === 'TEST_ONLY_UNOWNED');

  const report = {
    schema: 'atlas.packet-registry-writer-ownership.01b-mutation-census.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    scopeNote: 'AST-verified (ts-morph) mutation-site census for the 13 production sveltekit-frontend/src candidate files this session identified via Drizzle-call grep. Standalone scripts/ one-shot writers are NOT re-audited at this granularity -- they remain classified by the earlier packet-registry-writer-ownership-v1.json receipt (file-reachability heuristic), which is defensible for CLI-only scripts with no route/dispatcher caller path.',
    candidateFilesScanned: CANDIDATE_FILES,
    mutationSitesFound: classified.length,
    classificationCounts,
    canonicalWriterSites: canonicalWriters.map((s) => ({ file: s.file, line: s.line, fn: s.enclosingFunction, table: s.targetTable, columns: s.columnsWritten, callers: s.productionCallers })),
    canonicalMetadataMutatorSites: canonicalMetadataMutators.map((s) => ({ file: s.file, line: s.line, fn: s.enclosingFunction, table: s.targetTable, columns: s.columnsWritten, callers: s.productionCallers })),
    productionCapableUnownedSites: unowned.map((s) => ({ file: s.file, line: s.line, fn: s.enclosingFunction, table: s.targetTable, columns: s.columnsWritten })),
    testOnlySites: testOnly.map((s) => ({ file: s.file, line: s.line, fn: s.enclosingFunction })),
    allSites: classified,
    gate: 'PACKET_REGISTRY_WRITER_OWNERSHIP_01B',
    acceptance: {
      canonicalIdentityRuntimeWriters: canonicalWriters.length,
      exactlyOneCanonicalIdentityWriter: canonicalWriters.length === 1,
      canonicalMetadataMutatorsClassified: canonicalMetadataMutators.length,
      productionCapableUnownedCount: unowned.length,
      unknownMutationSites: classified.filter((s) => s.classification === undefined).length,
    },
    nextGate: 'PACKET_WRITE_REVISION_CONTRACT_01',
    nextAction: 'If exactlyOneCanonicalIdentityWriter is true, proceed to revision-contract auditing scoped to that single writer plus its metadata mutators. Do not execute any writer.',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'MUTATION_SITE_CENSUS_READ_ONLY_COMPLETE',
    mutationSitesFound: classified.length,
    classificationCounts,
    canonicalWriterSites: report.canonicalWriterSites,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'MUTATION_SITE_CENSUS_FAILED', error: String(error?.stack ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
