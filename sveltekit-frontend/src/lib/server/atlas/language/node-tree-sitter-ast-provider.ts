import { createRequire } from 'node:module';

import type { AtlasStructuralEvidence, AtlasStructuralEvidenceChunk } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import type {
  AstProvider,
  AstProviderResult,
  CanonicalSourceRef,
} from '$lib/server/atlas/indexing/graphify-structural-materializer.js';

const require = createRequire(import.meta.url);

type Point = { row: number; column: number };

type SyntaxNode = {
  type: string;
  text?: string;
  startIndex: number;
  endIndex: number;
  startPosition: Point;
  endPosition: Point;
  namedChildren?: SyntaxNode[];
  children?: SyntaxNode[];
  childForFieldName?: (name: string) => SyntaxNode | null;
  isMissing?: boolean | (() => boolean);
};

type TreeEdit = {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: Point;
  oldEndPosition: Point;
  newEndPosition: Point;
};

type Tree = {
  rootNode: SyntaxNode;
  edit(edit: TreeEdit): void;
  getChangedRanges?(other: Tree): Array<{
    startIndex: number;
    endIndex: number;
    startPosition: Point;
    endPosition: Point;
  }>;
};

type ParserInstance = {
  setLanguage(language: unknown): void;
  parse(source: string, oldTree?: Tree): Tree;
};

type ParserConstructor = new () => ParserInstance;

type LoadedRuntime = {
  Parser: ParserConstructor;
  grammar: unknown;
  parserRevision: string;
  grammarRevision: string;
  grammarPackage: 'tree-sitter-typescript' | 'tree-sitter-javascript';
};

export type NodeTreeSitterProviderLanguage = 'typescript' | 'tsx' | 'javascript' | 'jsx';

const DECLARATION_KINDS = new Map<string, string>([
  ['function_declaration', 'function'],
  ['method_definition', 'method'],
  ['class_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['type_alias_declaration', 'type_alias'],
  ['enum_declaration', 'enum'],
  ['variable_declarator', 'variable'],
]);

function packageVersion(packageName: string): string {
  const pkg = require(`${packageName}/package.json`) as { version?: string };
  if (!pkg.version) throw new Error(`PACKAGE_VERSION_MISSING:${packageName}`);
  return pkg.version;
}

function loadRuntime(language: NodeTreeSitterProviderLanguage): LoadedRuntime {
  const parserModule = require('tree-sitter') as { default?: ParserConstructor } | ParserConstructor;
  const Parser = (typeof parserModule === 'function'
    ? parserModule
    : parserModule.default) as ParserConstructor | undefined;
  if (!Parser) throw new Error('TREE_SITTER_PARSER_EXPORT_MISSING');

  if (language === 'typescript' || language === 'tsx') {
    const grammarModule = require('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
    return {
      Parser,
      grammar: language === 'tsx' ? grammarModule.tsx : grammarModule.typescript,
      parserRevision: packageVersion('tree-sitter'),
      grammarRevision: packageVersion('tree-sitter-typescript'),
      grammarPackage: 'tree-sitter-typescript',
    };
  }

  return {
    Parser,
    grammar: require('tree-sitter-javascript') as unknown,
    parserRevision: packageVersion('tree-sitter'),
    grammarRevision: packageVersion('tree-sitter-javascript'),
    grammarPackage: 'tree-sitter-javascript',
  };
}

function normalizeLanguage(language: string): NodeTreeSitterProviderLanguage {
  const value = language.trim().toLowerCase();
  if (value === 'typescript' || value === 'ts') return 'typescript';
  if (value === 'tsx') return 'tsx';
  if (value === 'javascript' || value === 'js') return 'javascript';
  if (value === 'jsx') return 'jsx';
  throw new Error(`NODE_TREE_SITTER_UNSUPPORTED_LANGUAGE:${language}`);
}

function namedChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren ?? node.children?.filter((child) => child.type !== ',') ?? [];
}

function missing(node: SyntaxNode): boolean {
  if (typeof node.isMissing === 'function') return node.isMissing();
  return node.isMissing === true;
}

function nodeName(node: SyntaxNode): string | null {
  const field = node.childForFieldName?.('name');
  if (field?.text?.trim()) return field.text.trim();
  const candidate = namedChildren(node).find((child) => child.type === 'identifier' || child.type === 'type_identifier');
  return candidate?.text?.trim() || null;
}

function walk(root: SyntaxNode): SyntaxNode[] {
  const rows: SyntaxNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    rows.push(node);
    const children = namedChildren(node);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]!);
  }
  return rows;
}

function toChunk(node: SyntaxNode): AtlasStructuralEvidenceChunk | null {
  const kind = DECLARATION_KINDS.get(node.type);
  if (!kind) return null;
  const name = nodeName(node);
  return {
    // Intentionally omit upstream_* IDs. Until parity is proven, the Node
    // challenger must remain compatibility evidence and cannot unlock GIS
    // canonical promotion merely by generating its own identifiers.
    node_type: node.type,
    kind,
    name,
    parent_route: [],
    parent_context: null,
    start_byte: node.startIndex,
    end_byte: node.endIndex,
    start_line: node.startPosition.row + 1,
    start_column: node.startPosition.column,
    end_line: node.endPosition.row + 1,
    end_column: node.endPosition.column,
    calls: [],
    imports: [],
    exports: [],
  };
}

function parseEvidence(input: CanonicalSourceRef): { evidence: AtlasStructuralEvidence; runtime: LoadedRuntime; tree: Tree } {
  const language = normalizeLanguage(input.language);
  const runtime = loadRuntime(language);
  const parser = new runtime.Parser();
  parser.setLanguage(runtime.grammar);
  const tree = parser.parse(input.source);
  const nodes = walk(tree.rootNode);
  const diagnostics = nodes
    .filter((node) => node.type === 'ERROR' || missing(node))
    .map((node) => `${node.type === 'ERROR' ? 'ERROR' : 'MISSING'}:${node.startIndex}-${node.endIndex}`);
  const chunks = nodes.map(toChunk).filter((value): value is AtlasStructuralEvidenceChunk => Boolean(value));

  return {
    runtime,
    tree,
    evidence: {
      schema: 'atlas.ast.evidence.v1',
      engine: 'node-tree-sitter-challenger',
      engine_version: runtime.parserRevision,
      language,
      file_path: input.sourceRef,
      source_revision: input.sourceRevision,
      chunks,
      edges: [],
      diagnostics,
      syntax_status: diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'CLEAN',
    },
  };
}

/**
 * Read-only challenger behind the same AstProvider interface as 8095.
 *
 * It intentionally emits no upstream/canonical IDs and therefore cannot pass
 * native provenance promotion. Its purpose is parity measurement first.
 */
export function createNodeTreeSitterChallengerProvider(): AstProvider {
  return {
    async materialize(input): Promise<AstProviderResult> {
      try {
        const { evidence } = parseEvidence(input);
        return {
          provider: 'node-tree-sitter-challenger',
          status: evidence.diagnostics.length > 0 ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
          evidence,
          diagnostics: [...evidence.diagnostics],
        };
      } catch (error) {
        return {
          provider: 'node-tree-sitter-challenger',
          status: 'FAILED',
          diagnostics: [error instanceof Error ? error.message : String(error)],
          errorTag: 'NODE_TREE_SITTER_CHALLENGER_FAILURE',
        };
      }
    },
  };
}

function pointAtByte(source: string, byteIndex: number): Point {
  const buffer = Buffer.from(source, 'utf8');
  if (!Number.isInteger(byteIndex) || byteIndex < 0 || byteIndex > buffer.length) {
    throw new Error(`NODE_TREE_SITTER_EDIT_BYTE_RANGE_INVALID:${byteIndex}`);
  }
  let row = 0;
  let column = 0;
  for (let index = 0; index < byteIndex; index += 1) {
    if (buffer[index] === 0x0a) {
      row += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { row, column };
}

export type NodeTreeSitterIncrementalEditV1 = {
  startByte: number;
  oldEndByte: number;
  newEndByte: number;
};

export type NodeTreeSitterIncrementalProofV1 = {
  schema: 'atlas.node-tree-sitter-incremental-proof.v1';
  sourceRef: string;
  oldSourceRevision: string;
  newSourceRevision: string;
  parserRevision: string;
  grammarRevision: string;
  changedRanges: Array<{
    startByte: number;
    endByte: number;
    startPoint: Point;
    endPoint: Point;
  }>;
  oldTreeEditedBeforeReuse: true;
  oldTreeSuppliedToParse: true;
  canonicalWritesAllowed: false;
  providerAuthority: 'CHALLENGER_ONLY';
};

/**
 * GPH-16B optimization proof helper. It edits the old tree before passing it
 * back to Parser.parse(newSource, oldTree), matching Tree-sitter's required
 * incremental parsing sequence. It performs no persistence.
 */
export function proveNodeTreeSitterIncrementalReuseV1(input: {
  sourceRef: string;
  language: NodeTreeSitterProviderLanguage;
  oldSource: string;
  newSource: string;
  oldSourceRevision: string;
  newSourceRevision: string;
  edit: NodeTreeSitterIncrementalEditV1;
}): NodeTreeSitterIncrementalProofV1 {
  const runtime = loadRuntime(input.language);
  const parser = new runtime.Parser();
  parser.setLanguage(runtime.grammar);
  const oldTree = parser.parse(input.oldSource);
  const edit: TreeEdit = {
    startIndex: input.edit.startByte,
    oldEndIndex: input.edit.oldEndByte,
    newEndIndex: input.edit.newEndByte,
    startPosition: pointAtByte(input.oldSource, input.edit.startByte),
    oldEndPosition: pointAtByte(input.oldSource, input.edit.oldEndByte),
    newEndPosition: pointAtByte(input.newSource, input.edit.newEndByte),
  };
  oldTree.edit(edit);
  const newTree = parser.parse(input.newSource, oldTree);
  const changedRanges = (oldTree.getChangedRanges?.(newTree) ?? []).map((range) => ({
    startByte: range.startIndex,
    endByte: range.endIndex,
    startPoint: range.startPosition,
    endPoint: range.endPosition,
  }));

  return {
    schema: 'atlas.node-tree-sitter-incremental-proof.v1',
    sourceRef: input.sourceRef,
    oldSourceRevision: input.oldSourceRevision,
    newSourceRevision: input.newSourceRevision,
    parserRevision: runtime.parserRevision,
    grammarRevision: runtime.grammarRevision,
    changedRanges,
    oldTreeEditedBeforeReuse: true,
    oldTreeSuppliedToParse: true,
    canonicalWritesAllowed: false,
    providerAuthority: 'CHALLENGER_ONLY',
  };
}
