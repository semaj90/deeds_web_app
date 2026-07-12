#!/usr/bin/env node

/**
 * TypeScript AST Extractor
 *
 * Extracts symbols from TypeScript/JavaScript files using the TypeScript Compiler API.
 *
 * Output: JSON array of symbols
 *   [
 *     { "kind": "function", "name": "getName", "start_line": 42, "end_line": 50, "hash": "abc123" },
 *     { "kind": "class", "name": "MyClass", "start_line": 52, "end_line": 100, "hash": "def456" },
 *     ...
 *   ]
 *
 * Usage: node ts-ast-extractor.mjs <file_path>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

/**
 * Extract symbols from a TypeScript file
 */
function extractSymbols(filePath) {
  try {
    // Read file
    const content = fs.readFileSync(filePath, 'utf-8');

    // Create source file
    const sourceFile = TypeScript.createSourceFile(
      filePath,
      content,
      TypeScript.ScriptTarget.Latest,
      true
    );

    const symbols = [];

    /**
     * Visit AST nodes recursively
     */
    function visit(node) {
      const kind = TypeScript.SyntaxKind[node.kind];

      // Get line numbers
      const sourceText = sourceFile.text;
      const lineAndChar = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      const endLineAndChar = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const startLine = lineAndChar.line + 1;
      const endLine = endLineAndChar.line + 1;

      // Extract based on node kind
      if (node.kind === TypeScript.SyntaxKind.FunctionDeclaration) {
        const name = node.name?.text || 'anonymous';
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 100);
        symbols.push({
          kind: 'function',
          name,
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.ClassDeclaration) {
        const name = node.name?.text || 'anonymous';
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 100);
        symbols.push({
          kind: 'class',
          name,
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.InterfaceDeclaration) {
        const name = node.name?.text || 'anonymous';
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 100);
        symbols.push({
          kind: 'interface',
          name,
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.ImportDeclaration) {
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 200);
        symbols.push({
          kind: 'import',
          name: text.replace(/\n/g, ' ').slice(0, 60),
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.ExportDeclaration ||
          node.kind === TypeScript.SyntaxKind.ExportAssignment) {
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 200);
        symbols.push({
          kind: 'export',
          name: text.replace(/\n/g, ' ').slice(0, 60),
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.EnumDeclaration) {
        const name = node.name?.text || 'anonymous';
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 100);
        symbols.push({
          kind: 'enum',
          name,
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      if (node.kind === TypeScript.SyntaxKind.TypeAliasDeclaration) {
        const name = node.name?.text || 'anonymous';
        const text = content.substring(node.getStart(), node.getEnd()).slice(0, 100);
        symbols.push({
          kind: 'type_alias',
          name,
          start_line: startLine,
          end_line: endLine,
          hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
        });
      }

      // Recurse
      TypeScript.forEachChild(node, visit);
    }

    // Start traversal
    visit(sourceFile);

    return symbols;
  } catch (err) {
    console.error(JSON.stringify({
      error: 'Extraction failed',
      file: filePath,
      message: err.message
    }));
    process.exit(1);
  }
}

// Main
const filePath = process.argv[2];
if (!filePath) {
  console.error(JSON.stringify({
    error: 'Usage: ts-ast-extractor.mjs <file_path>'
  }));
  process.exit(1);
}

const symbols = extractSymbols(filePath);
console.log(JSON.stringify(symbols, null, 0));
