/**
 * Query Intent Compiler (Gap 1)
 * Extracts structured EditSearchIntent from raw natural language queries
 */

import { EditSearchIntent, EditOperationKind } from './patch-context-types.js';

/**
 * Patterns for detecting operation hints from query text
 */
const OPERATION_PATTERNS: Record<EditOperationKind, RegExp[]> = {
  insert_statement: [/insert\s+(statement|code|line)/i, /add\s+(statement|code|line)/i],
  insert_after_import: [/after\s+import/i, /import.*add/i],
  insert_before_export: [/before\s+export/i, /export.*add/i],
  replace_symbol: [/replace\s+(\w+)/i, /swap\s+(\w+)/i],
  rename_symbol: [/rename\s+(\w+)/i, /change\s+name/i],
  change_contract: [/change\s+(signature|interface|contract)/i, /modify\s+(interface|contract)/i],
  add_parameter: [/add\s+(parameter|argument|param)/i, /new\s+(parameter|argument)/i],
  remove_parameter: [/remove\s+(parameter|argument|param)/i, /delete\s+(parameter|argument)/i],
  reorder_parameters: [/reorder\s+(parameters|arguments)/i, /sort\s+(parameters|arguments)/i],
  extract_function: [/extract\s+(function|method)/i, /create\s+(function|method)/i],
  inline_function: [/inline\s+(function|method)/i, /expand\s+(function|method)/i],
  delete_statement: [/delete\s+(code|statement|line)/i, /remove\s+(code|statement)/i],
  modify_condition: [/modify\s+(condition|if|check)/i, /change\s+(condition|if|check)/i],
  add_guard_clause: [/add\s+(guard|check|validation)/i, /guard\s+against/i],
};

/**
 * Detect language from query hints or file extensions
 */
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/typescript|\.ts(?:x)?$/, /type\s+script/i],
  tsx: [/\.tsx$/, /react.*type/i],
  javascript: [/javascript|\.js$/, /java\s*script/i],
  jsx: [/\.jsx$/, /react|jsx/i],
  python: [/python|\.py$/i],
  go: [/golang|\.go$/i],
};

/**
 * Extract import statements and their sources from query
 */
function extractImports(query: string): string[] {
  const imports: string[] = [];

  // Match: "from 'module'" or "from \"module\""
  const importMatches = query.match(/from\s+['"]([^'"]+)['"]/gi) || [];
  importMatches.forEach(match => {
    const module = match.match(/['"]([^'"]+)['"]/)?.[1];
    if (module) imports.push(module);
  });

  // Match: "import X" (standalone identifiers after "import")
  const singleImports = query.match(/import\s+(\w+)/gi) || [];
  singleImports.forEach(match => {
    const id = match.replace(/import\s+/i, '');
    if (id) imports.push(id);
  });

  return imports;
}

/**
 * Extract error messages or stack traces
 */
function extractErrorStrings(query: string): string[] {
  const errors: string[] = [];

  // Match error codes like TS2345, E501
  const errorCodes = query.match(/[A-Z]{1,3}\d{3,4}/g) || [];
  errors.push(...errorCodes);

  // Match quoted error messages
  const quotedErrors = query.match(/["'`]([^"'`]{20,}(?:error|failed|cannot)[^"'`]*)["`]/gi) || [];
  quotedErrors.forEach(match => {
    const msg = match.slice(1, -1);
    errors.push(msg);
  });

  return errors;
}

/**
 * Extract symbol names (identifiers) that are targets
 */
function extractSymbols(query: string): string[] {
  const symbols: string[] = [];

  // Match CamelCase identifiers (functions, classes)
  const identifiers = query.match(/\b[A-Z][a-zA-Z0-9]*(?:Function|Service|Handler|Component|Class)?\b/g) || [];
  symbols.push(...identifiers);

  // Match snake_case identifiers
  const snakeCase = query.match(/\b[a-z_]+_[a-z_0-9]*\b/g) || [];
  symbols.push(...snakeCase);

  return Array.from(new Set(symbols));
}

/**
 * Extract file paths from query
 */
function extractFilePaths(query: string): string[] {
  const paths: string[] = [];

  // Match: src/lib/..., packages/..., etc.
  const pathMatches = query.match(/(?:src|packages|scripts|lib|components)[\/\\][\w\-/.]{3,}/gi) || [];
  paths.push(...pathMatches);

  // Match quoted paths
  const quotedPaths = query.match(/["'`]([\w/.\\-]+\.(?:ts|tsx|js|jsx|py|go))["`]/gi) || [];
  quotedPaths.forEach(match => {
    const path = match.slice(1, -1);
    paths.push(path);
  });

  return Array.from(new Set(paths));
}

/**
 * Detect operation intent from query patterns
 */
function detectOperations(query: string): EditOperationKind[] {
  const operations: EditOperationKind[] = [];

  for (const [op, patterns] of Object.entries(OPERATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        operations.push(op as EditOperationKind);
        break;
      }
    }
  }

  return operations;
}

/**
 * Detect language hints from query
 */
function detectLanguages(query: string, filePaths?: string[]): string[] {
  const languages = new Set<string>();

  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        languages.add(lang);
      }
    }
  }

  // Infer from file extensions
  if (filePaths) {
    for (const path of filePaths) {
      if (path.endsWith('.ts')) languages.add('typescript');
      if (path.endsWith('.tsx')) languages.add('tsx');
      if (path.endsWith('.js')) languages.add('javascript');
      if (path.endsWith('.jsx')) languages.add('jsx');
      if (path.endsWith('.py')) languages.add('python');
      if (path.endsWith('.go')) languages.add('go');
    }
  }

  return Array.from(languages);
}

/**
 * Assess confidence of intent extraction
 */
function assessConfidence(
  intent: Partial<EditSearchIntent>
): 'high' | 'medium' | 'low' {
  let score = 0;

  if (intent.filePaths && intent.filePaths.length > 0) score += 2;
  if (intent.symbols && intent.symbols.length > 0) score += 2;
  if (intent.operationHints && intent.operationHints.length > 0) score += 2;
  if (intent.imports && intent.imports.length > 0) score += 1;
  if (intent.languages && intent.languages.length > 0) score += 1;

  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * Compile a raw query into structured EditSearchIntent
 */
export function compileEditIntent(rawQuery: string): EditSearchIntent {
  const filePaths = extractFilePaths(rawQuery);
  const symbols = extractSymbols(rawQuery);
  const imports = extractImports(rawQuery);
  const errorStrings = extractErrorStrings(rawQuery);
  const operations = detectOperations(rawQuery);
  const languages = detectLanguages(rawQuery, filePaths);

  // Extract literal search terms: space-separated words, excluding common filler words
  const fillerWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'from', 'with', 'by', 'add', 'change', 'modify', 'update', 'insert',
    'replace', 'remove', 'delete', 'create', 'new', 'file', 'code', 'function',
  ]);
  const literalTerms = rawQuery
    .toLowerCase()
    .split(/[\s\-_.,;:!?]+/)
    .filter(term => term.length > 2 && !fillerWords.has(term) && !symbols.includes(term));

  const intent: EditSearchIntent = {
    rawQuery,
    literalTerms: Array.from(new Set(literalTerms)),
    symbols: Array.from(new Set(symbols)),
    filePaths: Array.from(new Set(filePaths)),
    errorStrings: Array.from(new Set(errorStrings)),
    imports: Array.from(new Set(imports)),
    operationHints: Array.from(new Set(operations)),
    languages: Array.from(new Set(languages)),
    confidence: 'low', // Will be set below
  };

  intent.confidence = assessConfidence(intent);

  return intent;
}

/**
 * Example usage and tests
 */
export function testIntentCompiler(): void {
  const testQueries = [
    'Add DebouncedDagLogger after ExistingLogger import in src/lib/server/db/client.ts',
    'Replace validateSession with validateSessionAsync in auth.ts, rename old function to _validateSessionLegacy',
    'Insert guard clause before socket.emit in websocket handler, check for null connection',
    'Extract the error handling logic into a separate handleError function',
    'Remove deprecated validateEmailRegex parameter from parseUser function',
  ];

  for (const query of testQueries) {
    const intent = compileEditIntent(query);
    console.log(`Query: "${query}"`);
    console.log(`  Confidence: ${intent.confidence}`);
    console.log(`  Operations: ${intent.operationHints.join(', ')}`);
    console.log(`  Symbols: ${intent.symbols.join(', ')}`);
    console.log(`  Files: ${intent.filePaths.join(', ')}`);
    console.log(`  Languages: ${intent.languages.join(', ')}`);
    console.log();
  }
}
