#!/usr/bin/env node
/**
 * Index fenced TypeScript/JavaScript from the revisioned OKF docs corpus.
 *
 * The crawler owns acquisition. This stage owns bounded symbol evidence:
 * ts-morph provides declaration metadata and ast-grep provides structural
 * parsing. Output is a rebuildable docs artifact, never canonical storage.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Project, SyntaxKind } from 'ts-morph';

const ROOT = process.cwd();
const CORPUS_ROOT = path.join(ROOT, 'docs/.okf/dev');
const RAW_ROOT = path.join(CORPUS_ROOT, 'raw');
const SYMBOLS_PATH = path.join(CORPUS_ROOT, 'symbol-index.jsonl');
const SUMMARY_PATH = path.join(CORPUS_ROOT, 'symbol-summary.json');
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Number.POSITIVE_INFINITY;

const astGrep = await import(pathToFileURL(
  path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js'),
).href);

const LANGUAGE_MAP = {
  ts: astGrep.Lang.TypeScript,
  typescript: astGrep.Lang.TypeScript,
  mts: astGrep.Lang.TypeScript,
  tsx: astGrep.Lang.Tsx,
  js: astGrep.Lang.JavaScript,
  javascript: astGrep.Lang.JavaScript,
  mjs: astGrep.Lang.JavaScript,
  jsx: astGrep.Lang.JavaScript,
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolute));
    else if (entry.isFile() && absolute.endsWith('.md')) files.push(absolute);
  }
  return files.sort();
}

function codeBlocks(markdown) {
  const blocks = [];
  const pattern = /```([A-Za-z0-9_+-]*)\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = pattern.exec(markdown))) {
    const language = match[1].toLowerCase();
    if (!LANGUAGE_MAP[language]) continue;
    blocks.push({
      language,
      text: match[2],
      markdownOffset: match.index,
      markdownLine: markdown.slice(0, match.index).split('\n').length,
    });
  }
  return blocks;
}

function astGrepSymbols(text, language) {
  const root = astGrep.parse(LANGUAGE_MAP[language], text).root();
  const symbols = [];
  const declarationKinds = new Map([
    ['function_declaration', ['function', new Set(['identifier'])]],
    ['generator_function_declaration', ['function', new Set(['identifier'])]],
    ['class_declaration', ['class', new Set(['type_identifier', 'identifier'])]],
    ['method_definition', ['method', new Set(['property_identifier', 'private_property_identifier', 'identifier'])]],
    ['variable_declarator', ['variable', new Set(['identifier', 'destructuring_pattern'])]],
    ['interface_declaration', ['interface', new Set(['type_identifier', 'identifier'])]],
    ['type_alias_declaration', ['type', new Set(['type_identifier', 'identifier'])]],
    ['enum_declaration', ['enum', new Set(['identifier', 'type_identifier'])]],
  ]);
  const firstNamedChild = (node, kinds) => node.children().find((child) => kinds.has(child.kind()));
  const visit = (node) => {
    const declaration = declarationKinds.get(node.kind());
    if (declaration) {
      const [kind, nameKinds] = declaration;
      const name = firstNamedChild(node, nameKinds);
      if (name) symbols.push({ kind, name: name.text(), line: node.startPosition().row + 1 });
    }
    for (const child of node.children()) visit(child);
  };
  visit(root);
  return symbols;
}

function tsMorphSymbols(project, text, language, virtualPath) {
  const sourceFile = project.createSourceFile(virtualPath, text, { overwrite: true });
  const declarations = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getTypeAliases(),
    ...sourceFile.getEnums(),
    ...sourceFile.getVariableDeclarations(),
  ];
  return declarations
    .map((declaration) => {
      const name = declaration.getName?.();
      if (!name) return null;
      return {
        kind: declaration.getKindName().replace(/Declaration$/, '').toLowerCase(),
        name,
        line: declaration.getStartLineNumber(),
      };
    })
    .filter(Boolean);
}

async function main() {
  let files;
  try {
    files = await markdownFiles(RAW_ROOT);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log(JSON.stringify({ schema: 'atlas.okf-dev-symbol-index.v1', status: 'NO_CORPUS', raw_root: RAW_ROOT }));
      return;
    }
    throw error;
  }

  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const records = [];
  let blocks = 0;
  let parsed = 0;
  for (const file of files.slice(0, Number.isFinite(limit) ? limit : undefined)) {
    const markdown = await fs.readFile(file, 'utf8');
    const relative = path.relative(ROOT, file).replaceAll('\\', '/');
    const sourceRef = relative.replace(/^docs\/.okf\/dev\/raw\//, 'okf-doc:');
    for (const [blockOrdinal, block] of codeBlocks(markdown).entries()) {
      blocks += 1;
      const virtualPath = `/okf/${sha256(`${relative}:${blockOrdinal}`).slice(0, 16)}.${block.language}`;
      let structuralSymbols;
      try {
        structuralSymbols = astGrepSymbols(block.text, block.language);
        parsed += 1;
      } catch (error) {
        structuralSymbols = [];
        console.warn(`[okf-index] AST-grep parse failed: ${relative}#${blockOrdinal}: ${error.message}`);
      }
      const semanticSymbols = tsMorphSymbols(project, block.text, block.language, virtualPath);
      const merged = new Map();
      for (const symbol of [...structuralSymbols, ...semanticSymbols]) {
        const key = `${symbol.kind}:${symbol.name}`;
        merged.set(key, { ...symbol, evidence_methods: [...(merged.get(key)?.evidence_methods ?? []), structuralSymbols.includes(symbol) ? 'ast-grep-napi' : 'ts-morph'] });
      }
      for (const symbol of merged.values()) {
        records.push({
          schema: 'atlas.okf-dev-symbol.v1',
          source_ref: sourceRef,
          markdown_path: relative,
          block_ordinal: blockOrdinal,
          language: block.language,
          markdown_line: block.markdownLine + symbol.line,
          symbol_kind: symbol.kind,
          symbol_name: symbol.name,
          evidence_methods: [...new Set(symbol.evidence_methods)],
          source_revision: sha256(markdown),
          canonical_authority: false,
          retrieval: { index: 'docs-okf-dev', mmap_candidate: true, arrow_ipc_candidate: true, acp: 'envelope-only', a2a: 'delegation-only' },
        });
      }
    }
  }

  const summary = {
    schema: 'atlas.okf-dev-symbol-summary.v1',
    status: dryRun ? 'DRY_RUN' : 'WRITTEN',
    source_files: Math.min(files.length, Number.isFinite(limit) ? limit : files.length),
    code_blocks: blocks,
    ast_grep_parsed_blocks: parsed,
    symbols: records.length,
    output: { symbol_index: SYMBOLS_PATH, summary: SUMMARY_PATH },
    canonical_authority: false,
  };
  if (!dryRun) {
    await fs.mkdir(CORPUS_ROOT, { recursive: true });
    await fs.writeFile(SYMBOLS_PATH, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8');
    await fs.writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[okf-index] failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
