#!/usr/bin/env node
/**
 * Derive a read-only AST parsing scope from the daily Graphify file inventory.
 * Graphify is the source inventory; this script does not walk the filesystem
 * and does not write database state.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const input = path.resolve(ROOT, args.get('input') || '.tmp/atlas/graphify-file-index-v1/packets.jsonl');
const output = path.resolve(ROOT, args.get('out') || 'docs/reports/graphify-ast-scope-v1.json');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cts', '.svelte', '.py', '.go', '.rs', '.sql']);
const excludedSegments = new Set([
  '.git', 'node_modules', 'target', 'dist', 'build', 'coverage', 'logs',
  'archive', 'backups', '.tmp', '.python311', '.venv', '.venv_turbovec', 'site-packages',
  '.docker-build', '.svelte-error-fixes-backup', 'phase104-backups', 'scratch',
]);
const excludedPrefixes = new Set(
  String(args.get('exclude-prefixes') || '')
    .split(',')
    .map((value) => normalize(value))
    .filter(Boolean),
);

function normalize(value) { return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, ''); }
function sourceRef(row) { return normalize(row.source_ref || row.file_url || row.metadata?.path || ''); }
function exclusionReason(ref) {
  const normalized = normalize(ref);
  for (const prefix of excludedPrefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return `excluded-prefix:${prefix}`;
  }
  const parts = normalized.toLowerCase().split('/');
  const hit = parts.find((part) => excludedSegments.has(part));
  if (hit) return `excluded:${hit}`;
  const ext = path.posix.extname(normalized).toLowerCase();
  if (!sourceExtensions.has(ext)) return 'excluded:non-source-extension';
  return null;
}

if (!fs.existsSync(input)) throw new Error(`Graphify inventory not found: ${input}`);
const directories = new Map();
const included = new Set();
const excluded = new Map();
const inventoryHash = crypto.createHash('sha256');
let rows = 0;
let validRefs = 0;
const reader = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
for await (const line of reader) {
  inventoryHash.update(`${line}\n`, 'utf8');
  if (!line.trim()) continue;
  rows++;
  let row;
  try { row = JSON.parse(line); } catch { excluded.set('excluded:invalid-json', (excluded.get('excluded:invalid-json') || 0) + 1); continue; }
  const ref = sourceRef(row);
  if (!ref) { excluded.set('excluded:missing-source-ref', (excluded.get('excluded:missing-source-ref') || 0) + 1); continue; }
  validRefs++;
  const reason = exclusionReason(ref);
  if (reason) { excluded.set(reason, (excluded.get(reason) || 0) + 1); continue; }
  included.add(ref);
  const dir = path.posix.dirname(ref);
  directories.set(dir, (directories.get(dir) || 0) + 1);
}

const report = {
  schema: 'atlas.graphify-ast-scope.v1',
  readOnly: true,
  databaseWrites: false,
  input: path.relative(ROOT, input).replaceAll('\\', '/'),
  inventorySha256: inventoryHash.digest('hex'),
  rows,
  validRefs,
  includedFiles: included.size,
  includedDirectories: directories.size,
  includedSourceRefs: [...included].sort(),
  excludedReasons: Object.fromEntries([...excluded].sort((a, b) => b[1] - a[1])),
  includedDirectoryCounts: Object.fromEntries([...directories].sort((a, b) => b[1] - a[1])),
  policy: {
    sourceExtensions: [...sourceExtensions].sort(),
    excludedSegments: [...excludedSegments].sort(),
    excludedPrefixes: [...excludedPrefixes].sort(),
    authority: 'daily-graphify-file-inventory',
    nextConsumer: 'atlas_ast_nodes materializer',
  },
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, output: path.relative(ROOT, output).replaceAll('\\', '/') }, null, 2));
