/**
 * Build a bounded, rebuildable AST entity-candidate prefill artifact.
 *
 * This is intentionally a read-only source scan. It does not write Postgres,
 * Qdrant, Valkey, Neo4j, or the canonical entity registry. Neural domain
 * classification consumes the emitted rows in a later revisioned stage.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const limit = Math.max(1, Number(limitArg?.slice('--limit='.length) ?? 100));
const outputPath = outputArg?.slice('--output='.length) ?? 'docs/reports/ast-entity-prefill-v1.jsonl';
const write = process.argv.includes('--write');

const { Lang, parse } = await import(pathToFileURL(
  path.join(FRONTEND, 'node_modules/@ast-grep/napi/index.js'),
).href);

const languageForPath = (filePath) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.ts': return Lang.TypeScript;
    case '.tsx': return Lang.Tsx;
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs': return Lang.JavaScript;
    default: return null;
  }
};

const domainHintForPath = (relativePath) => {
  const value = relativePath.toLowerCase().replaceAll('\\', '/');
  if (value.includes('/retrieval/') || value.includes('qdrant') || value.includes('embedding')) return 'retrieval';
  if (value.includes('/graph') || value.includes('neo4j') || value.includes('pagerank')) return 'graph';
  if (value.includes('/ast') || value.includes('tree-sitter') || value.includes('symbol')) return 'ast';
  if (value.includes('/agent') || value.includes('workflow') || value.includes('mcp')) return 'agentic';
  if (value.includes('/db/') || value.includes('drizzle') || value.includes('postgres')) return 'persistence';
  return 'code';
};

const firstNamedChild = (node, kinds) => node.children().find((child) => kinds.has(child.kind()));

function extractEntities(text, filePath, relativePath) {
  const language = languageForPath(filePath);
  if (!language) return [];
  const root = parse(language, text).root();
  const declarations = new Map([
    ['function_declaration', ['function', new Set(['identifier'])]],
    ['generator_function_declaration', ['function', new Set(['identifier'])]],
    ['class_declaration', ['class', new Set(['type_identifier', 'identifier'])]],
    ['method_definition', ['method', new Set(['property_identifier', 'private_property_identifier', 'identifier'])]],
    ['variable_declarator', ['variable', new Set(['identifier', 'destructuring_pattern'])]],
    ['interface_declaration', ['interface', new Set(['type_identifier', 'identifier'])]],
    ['type_alias_declaration', ['type', new Set(['type_identifier', 'identifier'])]],
    ['enum_declaration', ['enum', new Set(['identifier', 'type_identifier'])]],
  ]);
  const entities = [];
  const domain = domainHintForPath(relativePath);

  function visit(node) {
    const kind = node.kind();
    const declaration = declarations.get(kind);
    if (declaration) {
      const [entityKind, nameKinds] = declaration;
      const nameNode = firstNamedChild(node, nameKinds);
      if (nameNode) {
        entities.push({
          entity_kind: entityKind,
        entity_id: `${relativePath.replaceAll('\\', '/')}#${entityKind}:${nameNode.text()}`,
          name: nameNode.text(),
          ast_kind: kind,
          start_byte: node.range().start.index,
          end_byte: node.range().end.index,
          domain_hint: domain,
          keyword_classes: [entityKind, domain],
        });
      }
    }
    for (const child of node.children()) visit(child);
  }

  visit(root);
  return entities;
}

function sourceFiles() {
  const output = execFileSync('rg', [
    '--files', '--hidden', '--no-ignore',
    '-g', '!**/node_modules/**', '-g', '!node_modules/**', '-g', '!.git/**', '-g', '!.gemini/**', '-g', '!.codex/**', '-g', '!.claude/**', '-g', '!.opencode/**',
    '-g', '!docs/reports/**', '-g', '!build/**', '-g', '!dist/**',
    '-g', '*.ts', '-g', '*.tsx', '-g', '*.js', '-g', '*.jsx', '-g', '*.mjs', '-g', '*.cjs',
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return output.split(/\r?\n/).filter(Boolean).slice(0, limit);
}

const rows = [];
for (const relativePath of sourceFiles()) {
  const absolutePath = path.resolve(ROOT, relativePath);
  try {
    const text = await fs.readFile(absolutePath, 'utf8');
    for (const entity of extractEntities(text, absolutePath, relativePath)) {
      rows.push({
        schema: 'atlas.ast-entity-prefill-row.v1',
        source_ref: relativePath.replaceAll('\\', '/'),
        source_revision: 'WORKSPACE_SCAN_UNREVISIONED',
        extractor_revision: 'ast-grep-napi-entity-prefill-v1',
        identity_status: 'CANDIDATE',
        classification_status: 'PENDING_ENCODER',
        ...entity,
      });
    }
  } catch (error) {
    rows.push({
      schema: 'atlas.ast-entity-prefill-error.v1',
      source_ref: relativePath.replaceAll('\\', '/'),
      extractor_revision: 'ast-grep-napi-entity-prefill-v1',
      error: String(error?.message ?? error),
    });
  }
}

const summary = {
  schema: 'atlas.ast-entity-prefill-receipt.v1',
  write,
  source_file_limit: limit,
  source_files_scanned: sourceFiles().length,
  entity_candidates: rows.filter((row) => row.entity_id).length,
  errors: rows.filter((row) => row.error).length,
  extractor: 'ast-grep-napi',
  identity_status: 'CANDIDATE_ONLY',
  classification_status: 'PENDING_ENCODER',
  canonical_writes: false,
};

console.log(JSON.stringify({ summary, sample: rows.slice(0, 10) }, null, 2));
if (write) {
  const absoluteOutput = path.resolve(ROOT, outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(absoluteOutput, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  console.log(JSON.stringify({ output: absoluteOutput }));
}
