#!/usr/bin/env node
/**
 * DIRECTORY-INDEX-SOURCE-BINDING-01
 *
 * Build a deterministic, read-only source/chunk projection plan. This is the
 * bridge between an existing directory and the later OKF/FTS/semantic/ACE
 * pipeline. It hashes bytes; it does not use mtime, git HEAD, model output, or
 * a datastore as source identity.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.slice(2).split('=');
  return [key, rest.join('=') || true];
}));
const scanRoot = path.resolve(ROOT, String(args.get('root') || 'docs/.okf/dev/raw'));
const limit = Math.max(1, Number(args.get('limit') || 512));
const output = path.resolve(ROOT, String(args.get('output') || 'docs/reports/okf-directory-index-plan-v1.json'));
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build', '.tmp', 'models']);
const supported = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.py', '.go', '.rs', '.json', '.yaml', '.yml', '.sql']);

function digest(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function normalize(relative) { return relative.replaceAll('\\', '/'); }
function strategy(ext) {
  if (['.md', '.mdx'].includes(ext)) return { chunking: 'heading_section', observers: ['okf', 'langextract', 'nlp'] };
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.py', '.go', '.rs'].includes(ext)) return { chunking: 'symbol_and_span', observers: ['tree_sitter', 'ast_grep', 'compiler_or_lsp', 'nlp'] };
  if (['.json', '.yaml', '.yml'].includes(ext)) return { chunking: 'bounded_object_or_document', observers: ['okf', 'schema'] };
  return { chunking: 'statement_or_section', observers: ['schema'] };
}
async function walk(directory, relative = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const rows = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (rows.length >= limit || excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const rel = normalize(path.join(relative, entry.name));
    if (entry.isDirectory()) rows.push(...await walk(absolute, rel));
    else if (entry.isFile() && supported.has(path.extname(entry.name).toLowerCase())) rows.push({ absolute, relative: rel });
    if (rows.length >= limit) break;
  }
  return rows.slice(0, limit);
}

async function main() {
  const candidates = await walk(scanRoot);
  const rows = [];
  const rejected = [];
  for (const candidate of candidates) {
    try {
      const bytes = await fs.readFile(candidate.absolute);
      const ext = path.extname(candidate.relative).toLowerCase();
      const sourceRevision = digest(bytes);
      const plan = strategy(ext);
      rows.push({
        schema: 'atlas.okf-directory-source-binding.v1',
        sourceRef: `workspace:${candidate.relative}`,
        relativePath: candidate.relative,
        extension: ext,
        byteLength: bytes.byteLength,
        contentHash: sourceRevision,
        sourceRevision,
        chunking: plan.chunking,
        observers: plan.observers,
        projections: ['postgres_fts', 'semantic_768_candidate', 'ace_reference'],
        canonicalAuthority: false,
      });
    } catch (error) {
      rejected.push({ relativePath: candidate.relative, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const manifestMaterial = rows.map((row) => `${row.sourceRef}\0${row.sourceRevision}\0${row.byteLength}`).join('\n');
  const workspaceRevision = digest(Buffer.from(manifestMaterial, 'utf8'));
  const counts = Object.fromEntries([...new Set(rows.map((row) => row.chunking))].sort().map((key) => [key, rows.filter((row) => row.chunking === key).length]));
  const report = {
    schema: 'atlas.okf-directory-index-plan.v1',
    generatedAt: new Date().toISOString(),
    scanRoot: path.relative(ROOT, scanRoot).replaceAll('\\', '/'),
    limit,
    workspaceRevision,
    sourceManifestChecksum: workspaceRevision,
    sourceCount: rows.length,
    rejectedCount: rejected.length,
    chunkingCounts: counts,
    sourceOwner: 'scripts/atlas/plan-okf-directory-index-v1.mjs',
    canonicalAuthority: false,
    writesPerformed: false,
    datastoreWritesPerformed: false,
    externalNetworkCallsPerformed: false,
    projectionPlan: {
      postgres: 'FTS/GIN candidate plan only; no SQL executed',
      semantic: 'EmbeddingGemma semantic_768 after source/chunk admission; no embedding executed',
      structural: 'Tree-sitter/AST-grep/compiler/LSP observations after chunking',
      graph: 'NetworkX/Neo4j projection only after graph/source proof',
      context: 'ACE references and bounded LOD assembly after CandidateOrdinal admission',
      cache: 'BitFrost/Valkey descriptors only after revision-qualified context identity',
      synthesis: 'Ornith :8090 only after validated ContextManifest',
    },
    rejected,
    rows,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report: path.relative(ROOT, output).replaceAll('\\', '/'), sourceCount: rows.length, workspaceRevision, writesPerformed: false }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
