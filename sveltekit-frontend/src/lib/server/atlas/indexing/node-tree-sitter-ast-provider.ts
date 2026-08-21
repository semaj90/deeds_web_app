import { createRequire } from 'node:module';

import type {
  AtlasStructuralEvidence,
  AtlasStructuralEvidenceChunk,
} from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import type {
  AstProvider,
  AstProviderResult,
  CanonicalSourceRef,
} from './graphify-structural-materializer.js';

const require = createRequire(import.meta.url);

export type NodeTreeSitterProviderLanguage = 'typescript' | 'tsx' | 'javascript' | 'jsx';

type PositionLike = { row: number; column: number };
type SyntaxNodeLike = {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: PositionLike;
  endPosition: PositionLike;
  namedChildren: SyntaxNodeLike[];
  parent: SyntaxNodeLike | null;
  isMissing?: boolean | (() => boolean);
  childForFieldName?: (name: string) => SyntaxNodeLike | null;
};

type TreeLike = { rootNode: SyntaxNodeLike };
type ParserLike = {
  setLanguage(language: unknown): void;
  parse(source: string, oldTree?: unknown): TreeLike;
};

type LoadedRuntime = {
import type { AtlasStructuralEvidence, AtlasStructuralEvidenceChunk } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import type { AstProvider, AstProviderResult, CanonicalSourceRef } from './graphify-structural-materializer.js';

const require = createRequire(import.meta.url);

export type NodeTreeSitterChallengerLanguage = 'typescript' | 'tsx' | 'javascript' | 'jsx';

export interface NodeTreeSitterEditV1 {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: { row: number; column: number };
  oldEndPosition: { row: number; column: number };
  newEndPosition: { row: number; column: number };
}

export interface NodeTreeSitterIncrementalReceiptV1 {
  schema: 'atlas.node-tree-sitter-incremental-receipt.v1';
  sourceRef: string;
  sourceRevision: string;
  parserRevision: string;
  grammarRevision: string;
  oldTreeProvided: boolean;
  editApplied: boolean;
  changedRanges: Array<{
    startByte: number;
    endByte: number;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  }>;
  canonicalWritesAllowed: false;
  canonicalAuthority: false;
}

type NodeLike = {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  namedChildren?: NodeLike[];
  children?: NodeLike[];
  parent?: NodeLike | null;
  text?: string;
  isError?: boolean | (() => boolean);
  isMissing?: boolean | (() => boolean);
  childForFieldName?: (name: string) => NodeLike | null;
};

type TreeLike = {
  rootNode: NodeLike;
  edit(edit: NodeTreeSitterEditV1): void;
  getChangedRanges?: (other: TreeLike) => Array<{
    startIndex?: number;
    endIndex?: number;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  }>;
};

type ParserLike = {
  setLanguage(language: unknown): void;
  parse(source: string, oldTree?: TreeLike): TreeLike;
};

type Runtime = {
  Parser: new () => ParserLike;
  grammar: unknown;
  parserRevision: string;
  grammarRevision: string;
};

const DECLARATION_KINDS = new Map<string, string>([
  ['function_declaration', 'FUNCTION'],
  ['method_definition', 'METHOD'],
  ['class_declaration', 'CLASS'],
  ['interface_declaration', 'INTERFACE'],
  ['type_alias_declaration', 'TYPE'],
  ['enum_declaration', 'ENUM'],
  ['variable_declarator', 'VARIABLE'],
]);

function packageVersion(packageName: string): string {
  const manifest = require(`${packageName}/package.json`) as { version?: string };
  if (!manifest.version) throw new Error(`PACKAGE_VERSION_MISSING:${packageName}`);
  return manifest.version;
}

function normalizeLanguage(value: string, sourceRef: string): NodeTreeSitterProviderLanguage {
  const lowered = value.trim().toLowerCase();
  if (lowered === 'typescript' || lowered === 'ts') return sourceRef.endsWith('.tsx') ? 'tsx' : 'typescript';
  if (lowered === 'tsx') return 'tsx';
  if (lowered === 'javascript' || lowered === 'js') return sourceRef.endsWith('.jsx') ? 'jsx' : 'javascript';
  if (lowered === 'jsx') return 'jsx';
  throw new Error(`NODE_TREE_SITTER_UNSUPPORTED_LANGUAGE:${value}`);
}

function loadRuntime(language: NodeTreeSitterProviderLanguage): LoadedRuntime {
  const parserModule = require('tree-sitter') as { default?: new () => ParserLike } | (new () => ParserLike);
  const Parser = ('default' in parserModule ? parserModule.default : parserModule) as new () => ParserLike;
  if (!Parser) throw new Error('TREE_SITTER_PARSER_EXPORT_MISSING');

  if (language === 'typescript' || language === 'tsx') {
    const grammarModule = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
    return {
      Parser,
      grammar: language === 'tsx' ? grammarModule.tsx : grammarModule.typescript,
function packageVersion(name: string): string {
  const pkg = require(`${name}/package.json`) as { version?: string };
  if (!pkg.version) throw new Error(`PACKAGE_VERSION_MISSING:${name}`);
  return pkg.version;
}

function normalizeLanguage(language: string): NodeTreeSitterChallengerLanguage {
  const value = language.trim().toLowerCase();
  if (value === 'typescript' || value === 'ts') return 'typescript';
  if (value === 'tsx') return 'tsx';
  if (value === 'javascript' || value === 'js') return 'javascript';
  if (value === 'jsx') return 'jsx';
  throw new Error(`NODE_TREE_SITTER_UNSUPPORTED_LANGUAGE:${language}`);
}

function loadRuntime(language: NodeTreeSitterChallengerLanguage): Runtime {
  const parserModule = require('tree-sitter') as { default?: Runtime['Parser'] } | Runtime['Parser'];
  const Parser = (typeof parserModule === 'function'
    ? parserModule
    : parserModule.default) as Runtime['Parser'] | undefined;
  if (!Parser) throw new Error('TREE_SITTER_PARSER_EXPORT_MISSING');

  if (language === 'typescript' || language === 'tsx') {
    const grammarModule = require('tree-sitter-typescript') as { typescript?: unknown; tsx?: unknown };
    const grammar = language === 'tsx' ? grammarModule.tsx : grammarModule.typescript;
    if (!grammar) throw new Error(`TREE_SITTER_TYPESCRIPT_GRAMMAR_EXPORT_MISSING:${language}`);
    return {
      Parser,
      grammar,
      parserRevision: packageVersion('tree-sitter'),
      grammarRevision: packageVersion('tree-sitter-typescript'),
    };
  }

  return {
    Parser,
    grammar: require('tree-sitter-javascript') as unknown,
  const grammarModule = require('tree-sitter-javascript') as { default?: unknown } | unknown;
  return {
    Parser,
    grammar: typeof grammarModule === 'object' && grammarModule && 'default' in grammarModule
      ? grammarModule.default
      : grammarModule,
    parserRevision: packageVersion('tree-sitter'),
    grammarRevision: packageVersion('tree-sitter-javascript'),
  };
}

function field(node: SyntaxNodeLike, name: string): SyntaxNodeLike | null {
  return node.childForFieldName?.(name) ?? null;
}

function nodeName(node: SyntaxNodeLike): string | null {
  const explicit = field(node, 'name')?.text?.trim();
  if (explicit) return explicit;
  for (const child of node.namedChildren ?? []) {
    if (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'property_identifier') {
      const text = child.text.trim();
      if (text) return text;
    }
  }
  return null;
}

function stringLiteral(node: SyntaxNodeLike): string | null {
  const text = node.text.trim();
  const match = text.match(/^['"](.+)['"]$/s);
  return match?.[1] ?? null;
}

function isMissing(node: SyntaxNodeLike): boolean {
  if (typeof node.isMissing === 'function') return Boolean(node.isMissing());
  return node.isMissing === true;
}

function routeFor(node: SyntaxNodeLike): string[] {
  const route: string[] = [];
  let cursor = node.parent;
  while (cursor) {
    route.push(cursor.type);
    cursor = cursor.parent;
  }
  return route.reverse();
}

function firstDeclaredName(node: SyntaxNodeLike): string | null {
  for (const child of node.namedChildren ?? []) {
    if (DECLARATION_KINDS.has(child.type)) return nodeName(child);
function nodeFlag(node: NodeLike, key: 'isError' | 'isMissing'): boolean {
  const value = node[key];
  return typeof value === 'function' ? Boolean(value.call(node)) : Boolean(value);
}

function namedChildren(node: NodeLike): NodeLike[] {
  return Array.isArray(node.namedChildren)
    ? node.namedChildren
    : Array.isArray(node.children)
      ? node.children.filter((child) => Boolean(child.type) && !/^[,;(){}[\]]$/.test(child.type))
      : [];
}

const DECLARATION_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration',
  'variable_declaration',
  'variable_declarator',
]);

function kindForNode(type: string): string {
  if (type === 'function_declaration') return 'function';
  if (type === 'method_definition') return 'method';
  if (type === 'class_declaration') return 'class';
  if (type === 'interface_declaration') return 'interface';
  if (type === 'type_alias_declaration') return 'type';
  if (type === 'enum_declaration') return 'enum';
  return 'variable';
}

function sourceSlice(source: string, node: NodeLike): string {
  return Buffer.from(source, 'utf8').subarray(node.startIndex, node.endIndex).toString('utf8');
}

function nodeName(node: NodeLike, source: string): string | null {
  const named = node.childForFieldName?.('name');
  if (named) return sourceSlice(source, named).trim() || null;
  for (const child of namedChildren(node)) {
    if (child.type === 'identifier' || child.type === 'property_identifier' || child.type === 'type_identifier') {
      return sourceSlice(source, child).trim() || null;
    }
  }
  return null;
}

function chunkForNode(node: SyntaxNodeLike, kind: string): AtlasStructuralEvidenceChunk {
  const name = kind === 'FILE' ? null : nodeName(node);
  const imports: string[] = [];
  const exports: string[] = [];
  const calls: string[] = [];

  const visitEvidence = (current: SyntaxNodeLike): void => {
    if (current.type === 'import_statement') {
      for (const child of current.namedChildren ?? []) {
        if (child.type === 'string') {
          const value = stringLiteral(child);
          if (value) imports.push(value);
        }
      }
    }
    if (current.type === 'call_expression') {
      const callee = field(current, 'function')?.text?.trim();
      if (callee) calls.push(callee);
    }
    if (current.type === 'export_statement') {
      const exported = firstDeclaredName(current);
      if (exported) exports.push(exported);
    }
    for (const child of current.namedChildren ?? []) visitEvidence(child);
  };
  visitEvidence(node);

  if (name && node.parent?.type === 'export_statement') exports.push(name);

  return {
    node_type: node.type,
    kind,
    name,
    parent_route: routeFor(node),
    parent_context: node.parent?.type ?? null,
    start_byte: node.startIndex,
    end_byte: node.endIndex,
    start_line: node.startPosition.row,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row,
    end_column: node.endPosition.column,
    calls: [...new Set(calls)].sort(),
    imports: [...new Set(imports)].sort(),
    exports: [...new Set(exports)].sort(),
  };
}

function collectEvidence(tree: TreeLike): { chunks: AtlasStructuralEvidenceChunk[]; diagnostics: string[] } {
  const chunks: AtlasStructuralEvidenceChunk[] = [];
  const diagnostics: string[] = [];

  const visit = (node: SyntaxNodeLike): void => {
    if (node.type === 'ERROR') diagnostics.push(`TREE_SITTER_ERROR:${node.startIndex}-${node.endIndex}`);
    if (isMissing(node)) diagnostics.push(`TREE_SITTER_MISSING:${node.type}:${node.startIndex}`);

    const declarationKind = DECLARATION_KINDS.get(node.type);
    if (declarationKind) chunks.push(chunkForNode(node, declarationKind));

    for (const child of node.namedChildren ?? []) visit(child);
  };
  visit(tree.rootNode);

  // Always expose one FILE unit so empty modules remain observable while also
  // preserving whole-file imports/exports/call evidence for parity analysis.
  chunks.unshift(chunkForNode(tree.rootNode, 'FILE'));

  return {
    chunks: chunks.sort((a, b) => a.start_byte - b.start_byte || a.end_byte - b.end_byte || a.kind.localeCompare(b.kind)),
    diagnostics: [...new Set(diagnostics)].sort(),
  };
}

/**
 * Read-only challenger behind the existing AstProvider boundary.
 *
 * It deliberately does NOT mint upstream/canonical node, file, chunk, symbol,
 * packet, or source-revision identities. Those fields stay absent so the
 * Graphify provenance gate naturally treats this provider as a parity
 * observation until GIS/canonical-owner acceptance is separately proven.
 */
export function createNodeTreeSitterAstProvider(): AstProvider {
  return {
    async materialize(input: CanonicalSourceRef): Promise<AstProviderResult> {
      try {
        const language = normalizeLanguage(input.language, input.sourceRef);
function compactSignature(source: string, node: NodeLike): string {
  const text = sourceSlice(source, node)
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?.trim() ?? node.type;
  return text.slice(0, 320);
}

function collectDiagnostics(root: NodeLike): string[] {
  const diagnostics: string[] = [];
  const visit = (node: NodeLike) => {
    if (node.type === 'ERROR' || nodeFlag(node, 'isError')) {
      diagnostics.push(`ERROR:${node.startIndex}-${node.endIndex}`);
    }
    if (nodeFlag(node, 'isMissing')) {
      diagnostics.push(`MISSING:${node.type}:${node.startIndex}`);
    }
    for (const child of namedChildren(node)) visit(child);
  };
  visit(root);
  return diagnostics;
}

function collectChunks(root: NodeLike, source: string): AtlasStructuralEvidenceChunk[] {
  const chunks: AtlasStructuralEvidenceChunk[] = [];
  const route: string[] = [];

  const visit = (node: NodeLike) => {
    const isDeclaration = DECLARATION_TYPES.has(node.type);
    if (isDeclaration) {
      const name = nodeName(node, source);
      chunks.push({
        // Intentionally no upstream_* IDs: this challenger may observe spans,
        // but only GIS/Consiliency promotion may establish canonical identity.
        node_type: node.type,
        kind: kindForNode(node.type),
        name,
        parent_route: [...route],
        parent_context: route.at(-1) ?? null,
        start_byte: node.startIndex,
        end_byte: node.endIndex,
        start_line: node.startPosition.row,
        start_column: node.startPosition.column,
        end_line: node.endPosition.row,
        end_column: node.endPosition.column,
        calls: [],
        imports: [],
        exports: [],
      });
    }

    const routeToken = isDeclaration
      ? `${node.type}:${nodeName(node, source) ?? compactSignature(source, node)}`
      : null;
    if (routeToken) route.push(routeToken);
    for (const child of namedChildren(node)) visit(child);
    if (routeToken) route.pop();
  };

  visit(root);
  return chunks.sort((a, b) => a.start_byte - b.start_byte || a.end_byte - b.end_byte || a.node_type.localeCompare(b.node_type));
}

function materializeEvidence(input: CanonicalSourceRef, runtime: Runtime, tree: TreeLike): AtlasStructuralEvidence {
  const diagnostics = collectDiagnostics(tree.rootNode);
  return {
    schema: 'atlas.ast.evidence.v1',
    engine: 'node-tree-sitter-challenger',
    engine_version: `${runtime.parserRevision};grammar=${runtime.grammarRevision}`,
    language: normalizeLanguage(input.language),
    file_path: input.sourceRef,
    source_revision: input.sourceRevision,
    chunks: collectChunks(tree.rootNode, input.source),
    edges: [],
    diagnostics,
    error_tag: diagnostics.length > 0 ? 'ChunkingError' : null,
    syntax_status: diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'CLEAN',
  };
}

/**
 * Read-only challenger implementing the same AstProvider interface as 8095.
 * It never fabricates native upstream IDs, so Graphify provenance readiness
 * remains COMPATIBILITY_ONLY until a separate canonical identity join proves
 * those coordinates.
 */
export function createNodeTreeSitterAstProvider(): AstProvider {
  return {
    async materialize(input): Promise<AstProviderResult> {
      try {
        const language = normalizeLanguage(input.language);
        const runtime = loadRuntime(language);
        const parser = new runtime.Parser();
        parser.setLanguage(runtime.grammar);
        const tree = parser.parse(input.source);
        const { chunks, diagnostics } = collectEvidence(tree);
        const evidence: AtlasStructuralEvidence = {
          schema: 'atlas.ast.evidence.v1',
          engine: 'node-tree-sitter',
          engine_version: runtime.parserRevision,
          language,
          file_path: input.sourceRef,
          source_revision: input.sourceRevision,
          chunks,
          edges: [],
          diagnostics,
          syntax_status: diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'CLEAN',
        };
        return {
          provider: 'node-tree-sitter',
          status: diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
          evidence,
          diagnostics,
        };
      } catch (error) {
        return {
          provider: 'node-tree-sitter',
          status: 'FAILED',
          diagnostics: [error instanceof Error ? error.message : String(error)],
          errorTag: 'NODE_TREE_SITTER_RUNTIME_OR_SCHEMA_FAILURE',
        };
      }
    },
  };
}
        const evidence = materializeEvidence(input, runtime, tree);
        return {
          provider: 'node-tree-sitter-challenger',
          status: evidence.syntax_status === 'RECOVERED_WITH_ERRORS' ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
          evidence,
          diagnostics: evidence.diagnostics,
          errorTag: evidence.error_tag ?? undefined,
        };
      } catch (error) {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'FAILED',
          diagnostics: [`NODE_TREE_SITTER_CHALLENGER_FAILURE:${error instanceof Error ? error.message : String(error)}`],
          errorTag: 'NODE_TREE_SITTER_CHALLENGER_FAILURE',
        };
      }
    },
  };
}

/**
 * Native incremental proof helper. This is intentionally separate from the
 * production AstProvider method so GPH-16 delta correctness does not depend on
 * old-tree reuse. It exists only for parity/performance proofing.
 */
export function runNodeTreeSitterIncrementalProof(input: {
  sourceRef: string;
  sourceRevision: string;
  language: NodeTreeSitterChallengerLanguage;
  oldSource: string;
  newSource: string;
  edit: NodeTreeSitterEditV1;
}): NodeTreeSitterIncrementalReceiptV1 {
  const runtime = loadRuntime(input.language);
  const parser = new runtime.Parser();
  parser.setLanguage(runtime.grammar);
  const oldTree = parser.parse(input.oldSource);
  oldTree.edit(input.edit);
  const newTree = parser.parse(input.newSource, oldTree);
  const rawRanges = typeof oldTree.getChangedRanges === 'function'
    ? oldTree.getChangedRanges(newTree)
    : [];
  return {
    schema: 'atlas.node-tree-sitter-incremental-receipt.v1',
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    parserRevision: runtime.parserRevision,
    grammarRevision: runtime.grammarRevision,
    oldTreeProvided: true,
    editApplied: true,
    changedRanges: rawRanges.map((range) => ({
      startByte: range.startIndex ?? 0,
      endByte: range.endIndex ?? 0,
      startPosition: range.startPosition,
      endPosition: range.endPosition,
    })),
    canonicalWritesAllowed: false,
    canonicalAuthority: false,
  };
}
