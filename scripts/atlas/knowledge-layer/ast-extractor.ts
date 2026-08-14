// Tree-sitter AST Extraction Pipeline
// Extracts symbol boundaries, signatures, control flow, imports, exports, calls

import { Language, Symbol } from './types';

export interface ASTResult {
  root: unknown;
  symbols: Symbol[];
  edges: { from: string; to: string; type: string; startLine: number; endLine: number }[];
  errors: string[];
}

export async function parseAndExtract(source: string, filePath: string, language: Language): Promise<ASTResult> {
  const errors: string[] = [];
  const symbols: Symbol[] = [];
  const edges: ASTResult['edges'] = [];

  try {
    // Parse with tree-sitter
    const tree = await parseSource(source, language.treeSitterLanguageId);
    const rootNode = (tree as { rootNode: unknown }).rootNode;

    // Extract symbols
    extractSymbols(rootNode, source, language, symbols);

    // Extract edges
    extractEdges(rootNode, source, language, edges);

    // Extract ground spans
    extractGroundSpans(rootNode, source, symbols);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(`Parse error: ${errorMessage}`);
  }

  return { root: tree, symbols, edges, errors };
}

function extractSymbols(
  node: unknown,
  source: string,
  language: Language,
  symbols: Symbol[]
): void {
  if (!node) return;

  const nodeType = (node as { type?: string }).type;

  switch (nodeType) {
    case 'function_declaration':
    case 'function_expression':
      extractFunction(node, source, language, symbols);
      break;

    case 'class_declaration':
      extractClass(node, source, language, symbols);
      break;

    case 'method_definition':
      extractMethod(node, source, language, symbols);
      break;

    case 'import_declaration':
      extractImport(node, source, language, symbols);
      break;

    case 'export_declaration':
      extractExport(node, source, language, symbols);
      break;

    case 'call_expression':
      extractCallExpression(node, source, language, symbols);
      break;
  }

  // Recurse into children
  const children = (node as { children?: unknown[] }).children;
  if (children) {
    for (const child of children) {
      extractSymbols(child, source, language, symbols);
    }
  }
}

function extractFunction(
  node: unknown,
  source: string,
  language: Language,
  symbols: Symbol[]
): void {
  const nameNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;
  const name = nameNode?.text || 'anonymous';

  const symbol: Symbol = {
    id: `${language.id}:${(node as { startPosition?: { row?: number } }).startPosition?.row}:${name}`,
    language,
    sourceRef: `${(node as { startPosition?: { row?: number; column?: number } }).startPosition?.row}:${(node as { startPosition?: { column?: number } }).startPosition?.column}`,
    nodeType: 'function_declaration',
    signature: extractSignature(node, language),
    returnType: extractReturnType(node, language),
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '', // Will be filled by Lane B
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractClass(node: unknown, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;
  const name = nameNode?.text || 'AnonymousClass';

  const symbol: Symbol = {
    id: `${language.id}:${(node as { startPosition?: { row?: number } }).startPosition?.row}:${name}`,
    language,
    sourceRef: `${(node as { startPosition?: { row?: number; column?: number } }).startPosition?.row}:${(node as { startPosition?: { column?: number } }).startPosition?.column}`,
    nodeType: 'class_declaration',
    signature: `class ${name}`,
    returnType: null,
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '',
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractMethod(node: unknown, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;
  const name = nameNode?.text || 'anonymous';

  const symbol: Symbol = {
    id: `${language.id}:${(node as { startPosition?: { row?: number } }).startPosition?.row}:${name}`,
    language,
    sourceRef: `${(node as { startPosition?: { row?: number; column?: number } }).startPosition?.row}:${(node as { startPosition?: { column?: number } }).startPosition?.column}`,
    nodeType: 'method_definition',
    signature: `method ${name}`,
    returnType: extractReturnType(node, language),
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '',
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractImport(node: unknown, source: string, language: Language, symbols: Symbol[]): void {
  const sourceNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;
  const specifierNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[1] as
    | { text?: string }
    | undefined;

  const symbol: Symbol = {
    id: `${language.id}:import_${sourceNode?.text}`,
    language,
    sourceRef: '0:0',
    nodeType: 'import_declaration',
    signature: `import ${specifierNode?.text} from ${sourceNode?.text}`,
    returnType: null,
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '',
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractExport(node: unknown, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;

  const symbol: Symbol = {
    id: `${language.id}:export_${nameNode?.text}`,
    language,
    sourceRef: '0:0',
    nodeType: 'export_declaration',
    signature: `export ${nameNode?.text}`,
    returnType: null,
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '',
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractCallExpression(
  node: unknown,
  _source: string,
  language: Language,
  symbols: Symbol[]
): void {
  const calleeNode = (node as { namedChildren?: unknown[] })?.namedChildren?.[0] as
    | { text?: string }
    | undefined;
  const callee = calleeNode?.text || 'unknown';

  const symbol: Symbol = {
    id: `${language.id}:call_${callee}`,
    language,
    sourceRef: '0:0',
    nodeType: 'call_expression',
    signature: `${callee}(...)`,
    returnType: null,
    throws: [],
    controlFlow: [],
    imports: [],
    exports: [],
    callExpressions: [],
    sideEffects: [],
    description: '',
    groundSpans: [],
    dbCalls: null,
    tests: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  symbols.push(symbol);
}

function extractSignature(_node: unknown): string {
  // Simplified signature extraction
  const paramsNode = (_node as { namedChildren?: unknown[] })?.namedChildren?.[1] as
    | { text?: string }
    | undefined;
  return `${paramsNode?.text || ''}: void`;
}

function extractReturnType(): string | null {
  // Simplified return type extraction
  return null;
}

function extractEdges(): void {
  // Simplified edge extraction
  // Full implementation would track: CALLS, IMPORTS, WRITES_TABLE, READS_TABLE, etc.
}

function extractGroundSpans(): void {
  // Simplified ground span extraction
  // Would extract exact source text references for each symbol
}

export async function parseSource(): Promise<unknown> {
  // This would use the actual tree-sitter parser for the given language
  // Implementation depends on tree-sitter bindings
  throw new Error('Tree-sitter parser not yet implemented');
}
