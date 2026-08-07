// Tree-sitter AST Extraction Pipeline
// Extracts symbol boundaries, signatures, control flow, imports, exports, calls

import { Language, Symbol, NodeType, ControlFlow, Import, Export, CallExpression, SideEffect, GroundSpan } from './types';

export interface ASTResult {
  root: any;
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
    const rootNode = tree.rootNode;
    
    // Extract symbols
    extractSymbols(rootNode, source, language, symbols);
    
    // Extract edges
    extractEdges(rootNode, source, language, edges);
    
    // Extract ground spans
    extractGroundSpans(rootNode, source, symbols);
    
  } catch (err) {
    errors.push(`Parse error: ${err.message}`);
  }
  
  return { root: tree, symbols, edges, errors };
}

function extractSymbols(node: any, source: string, language: Language, symbols: Symbol[]): void {
  if (!node) return;
  
  const nodeType = node.type as string;
  
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
  for (const child of node.children) {
    extractSymbols(child, source, language, symbols);
  }
}

function extractFunction(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = node.namedChildren[0];
  const name = nameNode?.text || 'anonymous';
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:${name}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}:${node.startPosition.column}`,
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

function extractClass(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = node.namedChildren[0];
  const name = nameNode?.text || 'AnonymousClass';
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:${name}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}:${node.startPosition.column}`,
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

function extractMethod(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = node.namedChildren[0];
  const name = nameNode?.text || 'anonymous';
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:${name}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}:${node.startPosition.column}`,
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

function extractImport(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const sourceNode = node.namedChildren[0];
  const specifierNode = node.namedChildren[1];
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:import_${sourceNode?.text}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}`,
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

function extractExport(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const nameNode = node.namedChildren[0];
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:export_${nameNode?.text}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}`,
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

function extractCallExpression(node: any, source: string, language: Language, symbols: Symbol[]): void {
  const calleeNode = node.namedChildren[0];
  const callee = calleeNode?.text || 'unknown';
  
  const symbol: Symbol = {
    id: `${language.id}:${filePath}:${node.startPosition.row}:call_${callee}`,
    language,
    sourceRef: `${filePath}:${node.startPosition.row}`,
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

function extractSignature(node: any, language: Language): string {
  // Simplified signature extraction
  const paramsNode = node.namedChildren[1];
  return `${paramsNode?.text || ''}: void`;
}

function extractReturnType(node: any, language: Language): string | null {
  // Simplified return type extraction
  return null;
}

function extractEdges(node: any, source: string, language: Language, edges: any[]): void {
  // Simplified edge extraction
  // Full implementation would track: CALLS, IMPORTS, WRITES_TABLE, READS_TABLE, etc.
}

function extractGroundSpans(node: any, source: string, symbols: Symbol[]): void {
  // Simplified ground span extraction
  // Would extract exact source text references for each symbol
}

export async function parseSource(source: string, languageId: number): Promise<any> {
  // This would use the actual tree-sitter parser for the given language
  // Implementation depends on tree-sitter bindings
  throw new Error('Tree-sitter parser not yet implemented');
}
