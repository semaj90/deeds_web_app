// SYMBOL-VARIABLE-SUBCATEGORY-01 (2026-09-22, read-only, zero writes).
//
// Prompted by external review of the SYMBOL-REGISTRY-POPULATION-PREVIEW-01 result: before any
// operator decides a VARIABLE promotion policy, inspect what the 10,429 REJECT_KIND_POLICY
// VARIABLE observations actually ARE (module bindings, class fields, locals, parameters,
// destructuring), rather than deciding policy on one undifferentiated bucket.
//
// Reuses the frozen SYMBOL-WIRE-01 corpus manifest (docs/reports/symbol-kind-corpus-v1.json,
// 300 files, workspaceRevision pinned) so results are directly comparable to
// SYMBOL-REGISTRY-POPULATION-PREVIEW-01's countsByKind.VARIABLE=10429. Does NOT modify
// normalizeStructuralSymbolKind or buildObservationsForFile -- this is a separate, additive
// analysis walker that tracks ancestor-node-type context, which the canonical runner does not
// currently capture (its parent_route is hardcoded to [] -- see symbol-wire-observation-runner.mjs).
//
// Writes: none. Reads source files + the frozen corpus manifest only. Produces this script's own
// JSON report; does not touch atlas_symbol_registry, atlas_symbol_versions, Qdrant, Redis, Neo4j,
// or Graphify.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // sveltekit-frontend/
const CORPUS_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-kind-corpus-v1.json');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'symbol-variable-subcategory-audit-v1.json');

// Exactly the two raw node types that normalizeStructuralSymbolKind() maps to 'VARIABLE'
// (structural-observation-v1.ts:72) AND the only two that symbol-wire-observation-runner.mjs's
// DECLARATION_NODE_TYPES walks for this kind. Confirmed by direct read before writing this script.
const VARIABLE_RAW_TYPES = new Set(['variable_declarator', 'lexical_declaration']);

function classifyBindingPatternType(nameNode) {
  if (!nameNode) return 'NO_NAME_FIELD';
  switch (nameNode.type) {
    case 'identifier':
      return 'SIMPLE_BINDING';
    case 'object_pattern':
      return 'DESTRUCTURING_OBJECT';
    case 'array_pattern':
      return 'DESTRUCTURING_ARRAY';
    default:
      return `OTHER:${nameNode.type}`;
  }
}

function classifyScopeContext(ancestorTypes) {
  // ancestorTypes is nearest-first (immediate parent first).
  const containingFnTypes = new Set([
    'function_declaration',
    'function_expression',
    'arrow_function',
    'method_definition',
    'generator_function_declaration',
  ]);
  const isInClassBody = ancestorTypes.includes('class_body');
  const isInParamList = ancestorTypes.some((t) => t === 'formal_parameters');
  const nearestFnIdx = ancestorTypes.findIndex((t) => containingFnTypes.has(t));
  const isInFunctionBody = nearestFnIdx !== -1;
  const isModuleLevel = !isInClassBody && !isInParamList && !isInFunctionBody;

  if (isInParamList) return 'PARAMETER_CONTEXT';
  if (isInClassBody && !isInFunctionBody) return 'CLASS_BODY_DIRECT';
  if (isInFunctionBody) return 'FUNCTION_LOCAL';
  if (isModuleLevel) return 'MODULE_LEVEL';
  return 'UNCLASSIFIED_CONTEXT';
}

function walkWithAncestors(node, ancestorTypes, onDeclNode) {
  if (VARIABLE_RAW_TYPES.has(node.type)) {
    onDeclNode(node, ancestorTypes);
  }
  const nextAncestors = [node.type, ...ancestorTypes];
  for (let i = 0; i < node.childCount; i += 1) {
    walkWithAncestors(node.child(i), nextAncestors, onDeclNode);
  }
}

function auditFile(absPath) {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const source = readFileSync(absPath, 'utf8');
  let tree;
  try {
    tree = parser.parse(source);
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }

  const records = [];
  walkWithAncestors(tree.rootNode, [], (node, ancestorTypes) => {
    const nameNode = node.childForFieldName?.('name') ?? null;
    records.push({
      rawNodeType: node.type,
      bindingPatternType: node.type === 'variable_declarator' ? classifyBindingPatternType(nameNode) : 'N/A_LEXICAL_DECLARATION_WRAPPER',
      scopeContext: classifyScopeContext(ancestorTypes),
      isNestedInsideLexicalDeclaration: node.type === 'variable_declarator' && ancestorTypes.includes('lexical_declaration'),
      isExported: ancestorTypes.includes('export_statement'),
    });
  });

  return { ok: true, records };
}

async function main() {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  console.log(`SYMBOL-VARIABLE-SUBCATEGORY-01: auditing ${corpus.files.length} files (frozen corpus, workspaceRevision=${corpus.workspaceRevision})`);

  let filesParsed = 0;
  let filesFailed = 0;
  let totalVariableRaw = 0;
  const byRawNodeType = {};
  const byBindingPatternType = {};
  const byScopeContext = {};
  let nestedDeclaratorCount = 0;
  let exportedCount = 0;

  for (const relPath of corpus.files) {
    const absPath = path.join(REPO_ROOT, relPath);
    let result;
    try {
      result = auditFile(absPath);
    } catch (err) {
      result = { ok: false, error: String(err?.message ?? err) };
    }
    if (!result.ok) {
      filesFailed += 1;
      continue;
    }
    filesParsed += 1;
    for (const r of result.records) {
      totalVariableRaw += 1;
      byRawNodeType[r.rawNodeType] = (byRawNodeType[r.rawNodeType] ?? 0) + 1;
      byBindingPatternType[r.bindingPatternType] = (byBindingPatternType[r.bindingPatternType] ?? 0) + 1;
      byScopeContext[r.scopeContext] = (byScopeContext[r.scopeContext] ?? 0) + 1;
      if (r.isNestedInsideLexicalDeclaration) nestedDeclaratorCount += 1;
      if (r.isExported) exportedCount += 1;
    }
  }

  const report = {
    schema: 'atlas.symbol-variable-subcategory-audit.v1',
    gate: 'SYMBOL-VARIABLE-SUBCATEGORY-01',
    generatedAt: new Date().toISOString(),
    corpusManifestUsed: {
      workspaceRevision: corpus.workspaceRevision,
      corpusSize: corpus.corpusSize,
      generatedAt: corpus.generatedAt,
    },
    filesParsed,
    filesFailed,
    totalVariableRawObservations: totalVariableRaw,
    comparisonNote:
      'SYMBOL-REGISTRY-POPULATION-PREVIEW-01 reported countsByKind.VARIABLE=10429 for this same ' +
      'frozen corpus. This script walks the identical two raw node types (variable_declarator, ' +
      'lexical_declaration) that normalizeStructuralSymbolKind() maps to VARIABLE, so ' +
      'totalVariableRawObservations should match 10429 exactly if no other kind-normalization path ' +
      'contributes to VARIABLE -- if it does not match, that is itself a real finding, not noise.',
    byRawNodeType,
    byBindingPatternType,
    byScopeContext,
    nestedDeclaratorInsideLexicalDeclarationCount: nestedDeclaratorCount,
    nestedDeclaratorNote:
      'variable_declarator nodes counted here that ALSO sit inside a lexical_declaration ancestor ' +
      'in the SAME walk. Both node types independently map to VARIABLE, so a single `const a = 1, b ' +
      '= 2;` statement contributes 1 lexical_declaration + 2 variable_declarator observations -- ' +
      'this number quantifies that overlap, not a bug in this audit script.',
    exportedCount,
    writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphifyRuns: 0 },
    canonicalAuthority: false,
    writesPerformed: false,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
