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
  // Ambient/ .d.ts declarations: an interface-body or namespace-body
  // function signature with no implementation body (`declare function
  // foo(): void`, an overload signature). treesitter-chunker's sidecar
  // classifies these as FUNCTION (node_type contains "function"); this
  // provider previously emitted nothing at all for them.
  ['function_signature', 'FUNCTION'],
  ['arrow_function', 'FUNCTION'],
  ['function_expression', 'FUNCTION'],
  ['generator_function', 'FUNCTION'],
  // Ambient/interface-body method signature with no implementation body
  // (`interface Foo { bar(): void; }`). Same rationale as function_signature
  // above -- the sidecar already classifies these as METHOD.
  ['method_signature', 'METHOD'],
  ['import_statement', 'IMPORT'],
  ['export_statement', 'EXPORT'],
  // TypeScript `namespace X {}` / `module X {}` declarations. 'NAMESPACE'
  // is intentionally not one of normalizeStructuralSymbolKind's known
  // keywords -- it falls through to UNKNOWN, matching the sidecar's own
  // UNKNOWN classification for internal_module (semanticKindComparable is
  // false for UNKNOWN-UNKNOWN pairs, so this can't introduce a new
  // SEMANTIC_KIND_MISMATCH). The point of adding this is only to close
  // the NAMED_SYMBOL_MISSING_LEFT gap -- both sides should agree such a
  // symbol exists, even without a specific shared kind vocabulary for it.
  ['internal_module', 'NAMESPACE'],
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
      parserRevision: packageVersion('tree-sitter'),
      grammarRevision: packageVersion('tree-sitter-typescript'),
    };
  }

  return {
    Parser,
    grammar: require('tree-sitter-javascript') as unknown,
    parserRevision: packageVersion('tree-sitter'),
    grammarRevision: packageVersion('tree-sitter-javascript'),
  };
}

function field(node: SyntaxNodeLike, name: string): SyntaxNodeLike | null {
  return node.childForFieldName?.(name) ?? null;
}

// Tree-sitter's TypeScript grammar names the left-hand side of a
// variable_declarator "name" even when it's a destructuring pattern, not a
// plain identifier -- e.g. `const { firstName, lastName } = user;` has a
// `name` field whose node type is object_pattern, not identifier, and whose
// .text is the entire pattern source ("{ firstName, lastName }"). That text
// is not a valid symbol name; emitting it as one was the root cause of the
// NAMED_SYMBOL_MISSING_RIGHT class in
// docs/reports/node-tree-sitter-provider-parity-corpus-v2.json (60/66
// files) -- the sidecar correctly does not emit a named symbol for these.
const DESTRUCTURING_PATTERN_TYPES = new Set(['object_pattern', 'array_pattern']);

function nodeName(node: SyntaxNodeLike): string | null {
  const nameField = field(node, 'name');
  if (nameField && DESTRUCTURING_PATTERN_TYPES.has(nameField.type)) return null;
  const explicit = nameField?.text?.trim();
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

const FUNCTION_VALUE_TYPES = new Set(['arrow_function', 'function_expression', 'generator_function']);

/**
 * `const foo = () => {}` parses as a `variable_declarator` whose value child
 * is an `arrow_function`/`function_expression` — structurally a function
 * binding, not a data variable. The old fallback tagged every declarator
 * 'VARIABLE' regardless, disagreeing with the 8095 sidecar's parity
 * classification for exactly this declaration style, which dominates real
 * TypeScript corpora (const/arrow is far more common than `function`
 * declarations). Tag it 'FUNCTION' like any other function-shaped
 * declaration instead.
 */
function resolveDeclarationKind(node: SyntaxNodeLike): string | undefined {
  if (node.type === 'variable_declarator') {
    const value = field(node, 'value');
    if (value && FUNCTION_VALUE_TYPES.has(value.type)) return 'FUNCTION';
  }
  return DECLARATION_KINDS.get(node.type);
}

function firstDeclaredName(node: SyntaxNodeLike): string | null {
  for (const child of node.namedChildren ?? []) {
    if (DECLARATION_KINDS.has(child.type)) return nodeName(child);
  }
  return null;
}

function chunkForNode(
  node: SyntaxNodeLike,
  kind: string,
  source: string,
): AtlasStructuralEvidenceChunk {
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
    // The Node binding exposes startIndex/endIndex in JavaScript string
    // coordinates. Atlas structural observations are UTF-8 byte coordinates,
    // so convert at the provider boundary before emitting evidence.
    start_byte: Buffer.byteLength(source.slice(0, node.startIndex), 'utf8'),
    end_byte: Buffer.byteLength(source.slice(0, node.endIndex), 'utf8'),
    start_line: node.startPosition.row,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row,
    end_column: node.endPosition.column,
    calls: [...new Set(calls)].sort(),
    imports: [...new Set(imports)].sort(),
    exports: [...new Set(exports)].sort(),
  };
}

function collectEvidence(tree: TreeLike, source: string): { chunks: AtlasStructuralEvidenceChunk[]; diagnostics: string[] } {
  const chunks: AtlasStructuralEvidenceChunk[] = [];
  const diagnostics: string[] = [];

  const visit = (node: SyntaxNodeLike): void => {
    if (node.type === 'ERROR') diagnostics.push(`TREE_SITTER_ERROR:${node.startIndex}-${node.endIndex}`);
    if (isMissing(node)) diagnostics.push(`TREE_SITTER_MISSING:${node.type}:${node.startIndex}`);

    const declarationKind = resolveDeclarationKind(node);
    if (declarationKind) chunks.push(chunkForNode(node, declarationKind, source));

    for (const child of node.namedChildren ?? []) visit(child);
  };
  visit(tree.rootNode);

  // Always expose one FILE unit so empty modules remain observable while also
  // preserving whole-file imports/exports/call evidence for parity analysis.
  chunks.unshift(chunkForNode(tree.rootNode, 'FILE', source));

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
        const runtime = loadRuntime(language);
        const parser = new runtime.Parser();
        parser.setLanguage(runtime.grammar);
        const tree = parser.parse(input.source);
        const { chunks, diagnostics } = collectEvidence(tree, input.source);
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
          provider: 'node-tree-sitter-challenger',
          status: diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
          evidence,
          diagnostics,
        };
      } catch (error) {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'FAILED',
          diagnostics: [error instanceof Error ? error.message : String(error)],
          errorTag: 'NODE_TREE_SITTER_RUNTIME_OR_SCHEMA_FAILURE',
        };
      }
    },
  };
}
