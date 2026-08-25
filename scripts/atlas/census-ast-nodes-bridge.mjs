#!/usr/bin/env node
/**
 * Read-only bridge census: for every declaration-like AST-grep candidate in
 * a Graphify declaration-candidate JSONL artifact, check whether a matching
 * row already exists in `atlas_ast_nodes` via the shared
 * `buildAstSourceRefKey()` join key (AST-ID-01).
 *
 * This answers AST-ID-01's/AST-ID-03's open item: "run a full read-only
 * bridge census by language, node kind, source prefix, and unresolved cause
 * before any bulk symbol-version apply." It performs zero writes to
 * Postgres, Qdrant, Redis, or Neo4j — this is a report generator only.
 *
 * Usage: node scripts/atlas/census-ast-nodes-bridge.mjs
 *   --candidates=docs/reports/graphify-ast-declaration-candidates-v2.jsonl
 *   --report=docs/reports/atlas-ast-nodes-bridge-census-v2.json
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAstSourceRefKey, normalizeAstNodeKind } from './lib/ast-source-ref-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argValue = (name, fallback) => {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1).trim() : fallback;
};
const candidatesPath = path.resolve(root, argValue(
  '--candidates',
  'docs/reports/graphify-ast-declaration-candidates-v1.jsonl',
));
const reportPath = path.resolve(root, argValue(
  '--report',
  'docs/reports/atlas-ast-nodes-bridge-census-v1.json',
));
// Dumped read-only via: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db
//   -t -A -c "SELECT source_ref_key FROM atlas_ast_nodes WHERE source_ref_key IS NOT NULL"
// Avoids needing DATABASE_URL in this shell (see CLAUDE.md .env credential note).
const bridgedKeysDumpPath = path.join(root, '.tmp/atlas/atlas-ast-nodes-source-ref-keys.txt');

function topPrefix(relativePath) {
  const norm = String(relativePath ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = norm.split('/');
  return parts.length > 1 ? parts[0] : '(root)';
}

function inferLanguage(relativePath) {
  const ext = path.extname(String(relativePath ?? '')).toLowerCase();
  const map = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.svelte': 'svelte', '.py': 'python', '.go': 'go', '.rs': 'rust',
  };
  return map[ext] ?? (ext ? ext.slice(1) : 'unknown');
}

async function loadAtlasAstNodeKeys() {
  if (!fs.existsSync(bridgedKeysDumpPath)) {
    return {
      keys: null,
      error: `${bridgedKeysDumpPath} not found — dump it first via: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c "SELECT source_ref_key FROM atlas_ast_nodes WHERE source_ref_key IS NOT NULL" > ${bridgedKeysDumpPath}`,
    };
  }
  const lines = fs.readFileSync(bridgedKeysDumpPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  return { keys: new Set(lines), error: null };
}

async function main() {
  if (!fs.existsSync(candidatesPath)) {
    console.error(`[census] candidates file not found: ${candidatesPath}`);
    process.exitCode = 1;
    return;
  }

  const { keys: bridgedKeys, error: dbError } = await loadAtlasAstNodeKeys();

  const byLanguage = new Map();
  const byPrefix = new Map();
  const byStorageKind = new Map();
  const byCause = new Map();
  const byExistingPrefixMismatchPrefix = new Map();
  const byExistingPrefixMismatchKind = new Map();
  const existingPrefixMismatchSamples = [];
  const bridgedPrefixes = bridgedKeys
    ? new Set([...bridgedKeys].map((key) => topPrefix(String(key).split('#', 1)[0]))
    )
    : null;
  const bridgedFiles = bridgedKeys
    ? new Set([...bridgedKeys].map((key) => String(key).split('#', 1)[0]))
    : null;

  let total = 0;
  let matched = 0;
  let unmatched = 0;
  let unkeyable = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(candidatesPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    total += 1;

    const key = buildAstSourceRefKey(row.relative_path ?? row.source_ref, row.symbol_kind ?? row.ast_kind, row.symbol_name);
    const language = inferLanguage(row.relative_path ?? row.source_ref);
    const prefix = topPrefix(row.relative_path ?? row.source_ref);
    const storageKind = normalizeAstNodeKind(row.symbol_kind ?? row.ast_kind) || '(unknown)';

    byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
    byStorageKind.set(storageKind, (byStorageKind.get(storageKind) ?? 0) + 1);

    if (!key) {
      unkeyable += 1;
      byCause.set('unkeyable_candidate', (byCause.get('unkeyable_candidate') ?? 0) + 1);
      continue;
    }
    if (bridgedKeys && bridgedKeys.has(key)) {
      matched += 1;
    } else {
      unmatched += 1;
        const candidateFile = String(row.relative_path ?? row.source_ref ?? '').replaceAll('\\', '/');
        const cause = !bridgedKeys
        ? 'bridge_query_unavailable'
        : bridgedPrefixes.has(prefix)
          ? bridgedFiles.has(candidateFile)
            ? 'existing_file_key_or_symbol_mismatch'
            : 'existing_prefix_missing_file'
          : 'no_existing_atlas_ast_nodes_prefix';
      byCause.set(cause, (byCause.get(cause) ?? 0) + 1);
      if (cause === 'existing_file_key_or_symbol_mismatch') {
        byExistingPrefixMismatchPrefix.set(
          prefix,
          (byExistingPrefixMismatchPrefix.get(prefix) ?? 0) + 1,
        );
        byExistingPrefixMismatchKind.set(
          storageKind,
          (byExistingPrefixMismatchKind.get(storageKind) ?? 0) + 1,
        );
        if (existingPrefixMismatchSamples.length < 25) {
          existingPrefixMismatchSamples.push({
            relativePath: candidateFile || null,
            symbolName: row.symbol_name ?? null,
            symbolKind: row.symbol_kind ?? null,
            astKind: row.ast_kind ?? null,
            generatedKey: key,
          });
        }
      }
    }
  }

  const toSortedObject = (map) =>
    Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));

  const report = {
    schema: 'atlas.ast-nodes-bridge-census.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    databaseWrites: false,
    inputCandidatesPath: path.relative(root, candidatesPath),
    atlasAstNodesBridgeQuery: dbError ? { status: 'SKIPPED', reason: dbError } : { status: 'OK', bridgedKeyCount: bridgedKeys.size },
    totals: { total, matched, unmatched, unkeyable },
    matchRate: total > 0 ? Number(((matched / total) * 100).toFixed(2)) : null,
    breakdownByLanguage: toSortedObject(byLanguage),
    breakdownBySourcePrefix: toSortedObject(byPrefix),
    breakdownByStorageKind: toSortedObject(byStorageKind),
    breakdownByUnresolvedCause: toSortedObject(byCause),
    existingPrefixMismatch: {
      bySourcePrefix: toSortedObject(byExistingPrefixMismatchPrefix),
      byStorageKind: toSortedObject(byExistingPrefixMismatchKind),
      samples: existingPrefixMismatchSamples,
    },
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[census] fatal:', error);
  process.exitCode = 1;
});
