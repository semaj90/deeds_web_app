#!/usr/bin/env node

/**
 * TypeScript AST Extractor
 *
 * Extracts symbols from TypeScript/JavaScript files using the TypeScript Compiler API.
 *
 * `extractSymbolsFromSource(content, filePath)` is the reusable, side-effect-free core (no
 * file I/O) — import this directly from other scripts (e.g.
 * scripts/atlas/graphify-symbol-extractor-v1.mts) rather than shelling out to the CLI below.
 * `extractSymbols(filePath)` remains the CLI-facing wrapper (reads the file itself).
 *
 * Each symbol now carries `start_byte`/`end_byte` (previously computed internally via
 * node.getStart()/node.getEnd() but discarded before this extension), `signature_text` (a
 * source slice, not the destructive 100-char truncation the old `hash` field used), a full
 * `ast_fingerprint` (sha256 of the complete node text, not the old 12-char truncated hash —
 * `hash` is kept for backward compatibility, `ast_fingerprint` is the new full-length field),
 * and `parent_chain` (ordered array of {kind, name} ancestors within the same file) so a
 * downstream writer can resolve `parent_symbol_id` without a second AST pass.
 *
 * Output (CLI): JSON array of symbols
 *   [
 *     { "kind": "function", "name": "getName", "start_line": 42, "end_line": 50,
 *       "start_byte": 1200, "end_byte": 1340, "signature_text": "...", "hash": "abc123",
 *       "ast_fingerprint": "<64-char sha256>", "parent_chain": [] },
 *     ...
 *   ]
 *
 * Usage: node ts-ast-extractor.mjs <file_path>
 */

import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import crypto from 'crypto';

// Import TypeScript Compiler
let ts;
try {
  ts = await import('typescript');
} catch (err) {
  console.error(JSON.stringify({
    error: 'TypeScript not available',
    message: err.message
  }));
  process.exit(1);
}

const { default: TypeScript } = ts;

const CONTAINER_KINDS = new Set(['function', 'class', 'interface', 'enum', 'module']);
const SIGNATURE_TEXT_MAX_CHARS = 400;

/**
 * Extract symbols from already-read TypeScript/JavaScript source text. Pure function: no
 * file I/O, no process.exit — throws on genuine parse failure so callers can handle it
 * per-file (e.g. mark graphify_files.parse_status = 'PARSE_FAILED') instead of crashing a batch.
 */
export function extractSymbolsFromSource(content, filePath) {
  const sourceFile = TypeScript.createSourceFile(
    filePath,
    content,
    TypeScript.ScriptTarget.Latest,
    true
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0];
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const message = TypeScript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const error = new Error(`PARSE_FAILED: ${filePath}:${line + 1}:${character + 1}: ${message}`);
    error.code = 'PARSE_FAILED';
    throw error;
  }

  const symbols = [];
  const parentStack = [];

  function pushSymbol(kind, name, node, startLine, endLine) {
    const startByte = node.getStart();
    const endByte = node.getEnd();
    const fullText = content.substring(startByte, endByte);
    symbols.push({
      kind,
      name,
      start_line: startLine,
      end_line: endLine,
      start_byte: startByte,
      end_byte: endByte,
      signature_text: fullText.slice(0, SIGNATURE_TEXT_MAX_CHARS),
      hash: crypto.createHash('sha256').update(fullText).digest('hex').slice(0, 12),
      ast_fingerprint: crypto.createHash('sha256').update(fullText).digest('hex'),
      parent_chain: parentStack.map((entry) => ({ kind: entry.kind, name: entry.name })),
    });
  }

  function visit(node) {
    const lineAndChar = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const endLineAndChar = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const startLine = lineAndChar.line + 1;
    const endLine = endLineAndChar.line + 1;

    let kind = null;
    let name = null;

    if (node.kind === TypeScript.SyntaxKind.FunctionDeclaration) {
      kind = 'function';
      name = node.name?.text || 'anonymous';
    } else if (node.kind === TypeScript.SyntaxKind.ClassDeclaration) {
      kind = 'class';
      name = node.name?.text || 'anonymous';
    } else if (node.kind === TypeScript.SyntaxKind.InterfaceDeclaration) {
      kind = 'interface';
      name = node.name?.text || 'anonymous';
    } else if (node.kind === TypeScript.SyntaxKind.ModuleDeclaration) {
      kind = 'module';
      name = node.name?.text || 'anonymous';
    } else if (node.kind === TypeScript.SyntaxKind.ImportDeclaration) {
      const text = content.substring(node.getStart(), node.getEnd());
      kind = 'import';
      name = text.replace(/\n/g, ' ').slice(0, 60);
    } else if (
      node.kind === TypeScript.SyntaxKind.ExportDeclaration ||
      node.kind === TypeScript.SyntaxKind.ExportAssignment
    ) {
      const text = content.substring(node.getStart(), node.getEnd());
      kind = 'export';
      name = text.replace(/\n/g, ' ').slice(0, 60);
    } else if (node.kind === TypeScript.SyntaxKind.EnumDeclaration) {
      kind = 'enum';
      name = node.name?.text || 'anonymous';
    } else if (node.kind === TypeScript.SyntaxKind.TypeAliasDeclaration) {
      kind = 'type_alias';
      name = node.name?.text || 'anonymous';
    }

    if (kind) {
      pushSymbol(kind, name, node, startLine, endLine);
    }

    const isContainer = kind && CONTAINER_KINDS.has(kind);
    if (isContainer) parentStack.push({ kind, name });
    TypeScript.forEachChild(node, visit);
    if (isContainer) parentStack.pop();
  }

  visit(sourceFile);

  return symbols;
}

const PARSE_TIMEOUT_MS = 10_000;

/**
 * Synchronous guard around extractSymbolsFromSource. The TypeScript parser can fail to return
 * on some malformed input (observed: a stray `*\/` in a source file), so the parse runs in a
 * child process with a timeout. A hang becomes PARSE_TIMEOUT for this file instead of stalling
 * the batch. Costs one process spawn per call; use it where input may be untrusted or malformed.
 */
export function extractSymbolsFromSourceGuarded(content, filePath, timeoutMs = PARSE_TIMEOUT_MS) {
  const moduleUrl = pathToFileURL(fileURLToPath(import.meta.url)).href;
  const childSource = [
    `import(${JSON.stringify(moduleUrl)}).then((m) => {`,
    `  let input = '';`,
    `  process.stdin.setEncoding('utf8');`,
    `  process.stdin.on('data', (chunk) => { input += chunk; });`,
    `  process.stdin.on('end', () => {`,
    `    const req = JSON.parse(input);`,
    `    process.stdout.write(JSON.stringify(m.extractSymbolsFromSource(req.content, req.filePath)));`,
    `  });`,
    `});`,
  ].join('\n');
  try {
    const out = execFileSync(process.execPath, ['-e', childSource], {
      input: JSON.stringify({ content, filePath }),
      timeout: timeoutMs,
      maxBuffer: 256 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (err) {
    if (err.code === 'ETIMEDOUT') {
      const timeoutErr = new Error(`PARSE_TIMEOUT: ${filePath} exceeded ${timeoutMs}ms`);
      timeoutErr.code = 'PARSE_TIMEOUT';
      throw timeoutErr;
    }
    const failure = new Error(`PARSE_FAILED: ${filePath}: ${String(err.stderr || err.message).slice(0, 500)}`);
    failure.code = 'PARSE_FAILED';
    throw failure;
  }
}

/**
 * Extract symbols from a TypeScript file (CLI-facing wrapper: reads the file itself).
 */
function extractSymbols(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return extractSymbolsFromSource(content, filePath);
  } catch (err) {
    console.error(JSON.stringify({
      error: 'Extraction failed',
      file: filePath,
      message: err.message
    }));
    process.exit(1);
  }
}

// Main (CLI entry — only runs when invoked directly, not when imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(JSON.stringify({
      error: 'Usage: ts-ast-extractor.mjs <file_path>'
    }));
    process.exit(1);
  }

  const symbols = extractSymbols(filePath);
  console.log(JSON.stringify(symbols, null, 0));
}
