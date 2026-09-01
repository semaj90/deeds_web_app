#!/usr/bin/env node
/**
 * RETRIEVAL-02: Census every Qdrant query for explicit named-vector
 * selection; do not mass-edit callers.
 *
 * Read-only static analysis. Does not touch any live service. Does not
 * modify any caller -- this is an audit artifact only, per the task's own
 * explicit instruction.
 *
 * Method: find every direct call of the shape `<qdrantLikeIdentifier>.query(`
 * or `<qdrantLikeIdentifier>.search(` (and `.client.query(`/`.client.search(`)
 * across sveltekit-frontend/src/lib/server, excluding *.spec.ts, then check
 * a bounded text window after each call site for an explicit `using:`
 * (named-vector selector) key. This is a heuristic (a call spanning further
 * than the window, or constructing its request object elsewhere and
 * spreading it in, would be missed or misclassified) -- flagged explicitly
 * per finding, not silently assumed complete.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    try {
      statSync(join(dir, '.git'));
      return dir;
    } catch {
      /* keep walking up */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate repo root (no .git found in any ancestor directory)');
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(SCRIPT_DIR);
const REPORT_PATH = join(REPO_ROOT, 'docs', 'reports', 'retrieval-02-qdrant-named-vector-census-v1.json');
const WINDOW_LINES = 15;

const CALL_PATTERN = /\b(\w+(?:\.client)?)\.(query|search)\s*\(/;

function listTsFiles() {
  const out = execSync(`git -C "${REPO_ROOT}" ls-files -- "sveltekit-frontend/src/lib/server/**/*.ts"`, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  return out
    .split(/\r?\n/)
    .filter((p) => p.length > 0 && !p.endsWith('.spec.ts') && !p.endsWith('.d.ts'))
    .map((p) => join(REPO_ROOT, p));
}

function findCallSites(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const sites = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip matches inside comments/JSDoc examples -- found live during this
    // pass (unified/legal-ai-service.ts:8 and hypergraph-4d.ts:791 are both
    // `* qdrant.search(...)` documentation lines, not real call sites).
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
    const match = line.match(CALL_PATTERN);
    if (!match) continue;
    const receiver = match[1];
    // A bare single-keyword transaction-control call (client.query('BEGIN'/
    // 'COMMIT'/'ROLLBACK'), or a DDL bootstrap call like CREATE EXTENSION)
    // is unambiguously Postgres, not Qdrant, regardless of receiver name --
    // found live during this pass across several graph adapter files.
    const firstArgIsPgControlStatement = /\.(?:query)\(\s*['"`]\s*(BEGIN|COMMIT|ROLLBACK|CREATE\s+EXTENSION|SET\s|LISTEN|NOTIFY|UNLISTEN)/i.test(line);
    if (firstArgIsPgControlStatement) continue;
    // Only interested in receivers that look Qdrant-flavored, per repo
    // convention (qdrant / qdrantClient / this.qdrant / this.client bound to
    // a qdrant instance, q, etc.) -- a purely textual filter, verified per
    // finding below by including the actual receiver name in the report.
    if (!/qdrant/i.test(receiver) && receiver !== 'q' && receiver !== 'client') continue;
    const windowEnd = Math.min(lines.length, i + WINDOW_LINES);
    const window = lines.slice(i, windowEnd).join('\n');

    // A bare `client.query(...)` receiver is ambiguous -- it could be a
    // Postgres pg.Pool/Client (this repo's dominant convention for that
    // exact call shape) rather than Qdrant. Exclude matches whose window
    // looks like a SQL statement (parameterized SQL keywords immediately
    // inside the call) rather than a Qdrant request object. Not a perfect
    // filter -- flagged in the report's methodology note, not hidden.
    const SQL_KEYWORD_PATTERN = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|EXTENSION|INDEX)|ALTER\s+TABLE|LISTEN|NOTIFY|information_schema)\b/i;
    const looksLikeSql = receiver === 'client' && SQL_KEYWORD_PATTERN.test(window);
    if (looksLikeSql) continue;

    // Two valid named-vector selector shapes exist in this codebase's
    // Qdrant client usage: the newer top-level `using: 'name'` (Query API),
    // and the older `vector: { name: 'name', vector: [...] }` shape used by
    // some pre-migration call sites. Both count as explicit named-vector
    // selection for this census.
    const hasUsing = /\busing\s*:/.test(window);
    const hasNamedVectorShape = /\bvector\s*:\s*\{\s*\n?\s*name\s*:/.test(window);
    const hasExplicitSelection = hasUsing || hasNamedVectorShape;

    const collectionMatch = window.match(/\.(?:query|search)\(\s*['"`]?([A-Za-z0-9_.$]+)['"`]?\s*,/) ||
      line.match(/\.(?:query|search)\(\s*['"`]?([A-Za-z0-9_.$]+)['"`]?/);
    const collectionExpr = collectionMatch ? collectionMatch[1] : null;
    // A first argument that reads like a SQL-string variable name (not a
    // Qdrant collection-name literal/constant) means this receiver is
    // probably a Postgres client whose SQL text lives outside this forward
    // window (e.g. assigned to a `query`/`sql` variable earlier in the
    // function) -- this scanner cannot see backward past the call site.
    // Found live during this pass: soft-routing-orchestrator.ts:267 passes
    // a `query` variable holding a full Postgres FTS statement defined ~15
    // lines above the call, invisible to this forward-only heuristic.
    const uncertainReceiver = receiver === 'client' && collectionExpr !== null && /^(query|sql|text|queryText|sqlText|statement|stmt)$/i.test(collectionExpr);
    sites.push({
      file: relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
      line: i + 1,
      receiver,
      method: match[2],
      collectionExpr,
      hasExplicitUsingInWindow: hasUsing,
      hasNamedVectorShapeInWindow: hasNamedVectorShape,
      hasExplicitSelection,
      uncertainReceiver,
      windowLines: WINDOW_LINES,
      codeSnippet: lines.slice(i, Math.min(lines.length, i + 4)).join('\n'),
    });
  }
  return sites;
}

function main() {
  const files = listTsFiles();
  const allSites = [];
  for (const file of files) {
    allSites.push(...findCallSites(file));
  }

  const withUsing = allSites.filter((s) => s.hasExplicitSelection);
  const withoutUsing = allSites.filter((s) => !s.hasExplicitSelection);

  const report = {
    schema: 'atlas.retrieval-02-qdrant-named-vector-census.v1',
    task: 'RETRIEVAL-02',
    openspecChange: 'parent-atlas-retrieval-lineage-dag-convergence',
    readOnly: true,
    writesPerformed: false,
    callersModified: false,
    generatedAt: new Date().toISOString(),
    method:
      `Textual scan of every tracked .ts file under sveltekit-frontend/src/lib/server (excluding *.spec.ts, *.d.ts) ` +
      `for a call of the shape <identifier(.client)?>.query(...) or .search(...) where the receiver name contains ` +
      `"qdrant" (case-insensitive) or is exactly "q"/"client". Bare "client.query(...)" calls whose window contains ` +
      `SQL keywords (SELECT / INSERT INTO / UPDATE / DELETE FROM / CREATE TABLE|EXTENSION|INDEX / ALTER TABLE / ` +
      `LISTEN / NOTIFY / information_schema) in the window, or a first-argument transaction-control string ` +
      `(BEGIN/COMMIT/ROLLBACK/LISTEN/NOTIFY/UNLISTEN/SET/CREATE EXTENSION), are excluded as Postgres pg.Pool calls, ` +
      `not Qdrant -- found live during this pass across several files (context-assembler.ts:311, ` +
      `pagerank-schema-audit.ts:69, analysis/worker.ts:528, and multiple graph-adapter ROLLBACK calls were all false ` +
      `positives before these exclusions were added; comment/JSDoc lines were also excluded after ` +
      `unified/legal-ai-service.ts:8 and hypergraph-4d.ts:791 were found matching inside documentation examples, ` +
      `not real code). For each remaining match, the following ${WINDOW_LINES} lines are ` +
      `checked for EITHER of two valid named-vector selector shapes seen in this codebase: the newer top-level ` +
      `"using: 'name'" (Query API), or the older "vector: { name: 'name', vector: [...] }" shape (also found live ` +
      `during this pass, e.g. ai/llm-cache.ts:106, which would have been a false negative under a using-only check). ` +
      `This is still a HEURISTIC, not a type-checked AST analysis -- a call whose request object is constructed ` +
      `elsewhere and spread in, or whose selector falls outside the line window, would be misclassified. Each ` +
      `finding below is reported individually with its own code snippet so a human can verify, not just a trusted ` +
      `aggregate count.`,
    summary: {
      totalCallSitesFound: allSites.length,
      explicitSelectionFound: withUsing.length,
      noExplicitSelectionFoundInWindow: withoutUsing.length,
      ofWhichConfident: withoutUsing.filter((s) => !s.uncertainReceiver).length,
      ofWhichUncertainReceiver: withoutUsing.filter((s) => s.uncertainReceiver).length,
      distinctFiles: new Set(allSites.map((s) => s.file)).size,
    },
    interpretationNote:
      'A missing `using:` in the window does NOT necessarily mean the call is broken today -- some call sites target ' +
      'single-named-vector or unnamed-default collections where Qdrant does not require `using`. This census reports ' +
      'presence/absence of the parameter only; it does NOT verify each target collection\'s actual vector schema ' +
      '(that would require a live Qdrant introspection pass per collection, out of scope for this static census). ' +
      'RETRIEVAL-02 is explicitly audit-only ("do not mass-edit callers") -- findings below are not remediated here.',
    canonicalPathAlreadyFixed: {
      note:
        'sveltekit-frontend/src/lib/server/search/qdrant-search.ts (the canonical searchCodebaseAnn/searchQdrantCode ' +
        'entry point per retrieval-layer-separation.md) was already fixed for the missing-using defect in commit ' +
        '128e052ba4, per RETRIEVAL-01G/01H. This census additionally surfaces every OTHER direct Qdrant call site in ' +
        'the codebase that retrieval-layer-separation.md says should not exist (callers should route through the ' +
        'orchestrator/qdrant-search.ts, never call a Qdrant client directly) -- that architectural violation is a ' +
        'separate, larger finding this census makes visible for the first time, not something previously tracked.',
    },
    sitesWithoutExplicitUsing: withoutUsing,
    sitesWithExplicitUsing: withUsing,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Total call sites: ${allSites.length} across ${report.summary.distinctFiles} files`);
  console.log(`Explicit using: found: ${withUsing.length}`);
  console.log(`No explicit using found in window: ${withoutUsing.length}`);
}

main();
