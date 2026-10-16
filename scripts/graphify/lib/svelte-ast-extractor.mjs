#!/usr/bin/env node
/**
 * Svelte AST Extractor
 *
 * Extracts structural symbols from .svelte files using:
 *  1. Svelte 5 modern parser for runes, snippets, event handlers, and component references.
 *  2. TypeScript Compiler API for TypeScript/JavaScript code inside <script> blocks.
 *
 * All line numbers (1-indexed) and byte offsets match the exact .svelte file source coordinates.
 *
 * Output: JSON array of symbols matching ts-ast-extractor.mjs format:
 *   [
 *     { "kind": "svelte_rune", "name": "$state(query)", "start_line": 10, "end_line": 10,
 *       "start_byte": 240, "end_byte": 268, "signature_text": "...", "hash": "abc123456789",
 *       "ast_fingerprint": "<64-char sha256>", "parent_chain": [] },
 *     ...
 *   ]
 *
 * Usage: node svelte-ast-extractor.mjs <file_path>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const req = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));

let parse;
try {
  ({ parse } = req('svelte/compiler'));
} catch (err) {
  console.error(JSON.stringify({ error: 'svelte/compiler not available', message: err.message }));
  process.exit(1);
}

// Import ts-ast-extractor reusable core
let extractSymbolsFromSource;
try {
  const tsExtractorPath = path.join(repoRoot, 'scripts', 'graphify', 'lib', 'ts-ast-extractor.mjs');
  const mod = await import(`file://${tsExtractorPath.replace(/\\/g, '/')}`);
  extractSymbolsFromSource = mod.extractSymbolsFromSource;
} catch (err) {
  console.error(JSON.stringify({ error: 'ts-ast-extractor failed to load', message: err.message }));
  process.exit(1);
}

const SIGNATURE_TEXT_MAX_CHARS = 400;
const RE_RUNE = /^\$(props|state|derived|effect|inspect)(\.[a-z]+)?$/;

function byteOffsetFactory(source) {
  const cache = new Map();
  return (charIndex) => {
    if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex > source.length) {
      throw new Error(`character index out of range: ${charIndex}`);
    }
    if (!cache.has(charIndex)) {
      cache.set(charIndex, Buffer.byteLength(source.slice(0, charIndex), 'utf8'));
    }
    return cache.get(charIndex);
  };
}

function lineColFactory(source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  return (charIndex) => {
    let low = 0, high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (lineStarts[mid] <= charIndex) low = mid + 1;
      else high = mid - 1;
    }
    const line = high + 1;
    const col = charIndex - lineStarts[high];
    return { line, col };
  };
}

function patternNames(id) {
  if (!id) return [];
  if (id.type === 'Identifier') return [id.name];
  if (id.type === 'ObjectPattern') {
    return id.properties.flatMap((p) => (p.type === 'RestElement' ? patternNames(p.argument) : patternNames(p.value)));
  }
  if (id.type === 'ArrayPattern') return id.elements.filter(Boolean).flatMap(patternNames);
  if (id.type === 'AssignmentPattern') return patternNames(id.left);
  return [];
}

export function extractSvelteSymbols(content, filePath) {
  const symbols = [];
  const toByte = byteOffsetFactory(content);
  const toLineCol = lineColFactory(content);

  // 1. Process <script> blocks with TypeScript AST extractor
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptRe.exec(content)) !== null) {
    const fullTag = scriptMatch[0];
    const scriptBody = scriptMatch[2];
    const scriptBodyStartChar = scriptMatch.index + scriptMatch[0].indexOf(scriptBody);
    const scriptStartByte = toByte(scriptBodyStartChar);
    const scriptStartLine = toLineCol(scriptBodyStartChar).line;

    try {
      const tsSymbols = extractSymbolsFromSource(scriptBody, filePath);
      for (const sym of tsSymbols) {
        const adjustedStartByte = scriptStartByte + sym.start_byte;
        const adjustedEndByte = scriptStartByte + sym.end_byte;
        const adjustedStartLine = scriptStartLine + sym.start_line - 1;
        const adjustedEndLine = scriptStartLine + sym.end_line - 1;

        symbols.push({
          kind: sym.kind,
          name: sym.name,
          start_line: adjustedStartLine,
          end_line: adjustedEndLine,
          start_byte: adjustedStartByte,
          end_byte: adjustedEndByte,
          signature_text: sym.signature_text,
          hash: sym.hash,
          ast_fingerprint: sym.ast_fingerprint,
          parent_chain: sym.parent_chain ?? [],
        });
      }
    } catch {
      // TypeScript parse failure inside script body: ignore and continue
    }
  }

  // 2. Parse modern Svelte AST
  let ast;
  try {
    ast = parse(content, { modern: true });
  } catch {
    // If modern parse fails, return symbols extracted from scripts
    return symbols;
  }

  function pushSymbol(kind, name, startChar, endChar, parentChain = []) {
    const startByte = toByte(startChar);
    const endByte = toByte(endChar);
    const startLine = toLineCol(startChar).line;
    const endLine = toLineCol(endChar).line;
    const fullText = content.substring(startChar, endChar);
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
      parent_chain: parentChain,
    });
  }

  // Extract runes from ESTree AST in instance & module
  function collectRunes(program) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'VariableDeclarator' && node.init && node.init.type === 'CallExpression') {
        const callee = node.init.callee;
        const calleeName =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.object.type === 'Identifier'
              ? `${callee.object.name}.${callee.property.name}`
              : null;
        if (calleeName && RE_RUNE.test(calleeName)) {
          const names = patternNames(node.id).join(', ');
          pushSymbol('svelte_rune', `${calleeName}(${names})`, node.start, node.end);
        }
      }
      if (node.type === 'ExpressionStatement' && node.expression?.type === 'CallExpression') {
        const c = node.expression.callee;
        const name = c.type === 'Identifier' ? c.name : null;
        if (name && RE_RUNE.test(name)) {
          pushSymbol('svelte_rune', `${name}()`, node.start, node.end);
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'metadata' || key === 'parent') continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') visit(v);
      }
    };
    visit(program);
  }

  if (ast.instance?.content) collectRunes(ast.instance.content);
  if (ast.module?.content) collectRunes(ast.module.content);

  // Extract snippets, handlers, and components from template
  function walkTemplate(node, parentName = null) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'SnippetBlock') {
      const name = node.expression?.name || 'anonymous_snippet';
      pushSymbol('svelte_snippet', name, node.start, node.end, parentName ? [{ kind: 'parent', name: parentName }] : []);
    } else if (node.type === 'Component') {
      const name = node.name || 'AnonymousComponent';
      pushSymbol('svelte_component', name, node.start, node.end, parentName ? [{ kind: 'parent', name: parentName }] : []);
    }

    // Event handlers
    if (node.type === 'OnDirective' || (node.type === 'Attribute' && /^on[a-z]/.test(node.name ?? ''))) {
      const eventName = node.type === 'OnDirective' ? `on:${node.name}` : node.name;
      pushSymbol('svelte_handler', eventName, node.start, node.end, parentName ? [{ kind: 'parent', name: parentName }] : []);
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'metadata') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) walkTemplate(child, node.name ?? parentName);
      } else if (val && typeof val === 'object' && typeof val.type === 'string') {
        walkTemplate(val, node.name ?? parentName);
      }
    }
  }

  if (ast.fragment) {
    walkTemplate(ast.fragment);
  }

  return symbols;
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(JSON.stringify({ error: 'Usage: svelte-ast-extractor.mjs <file_path>' }));
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const symbols = extractSvelteSymbols(content, filePath);
    console.log(JSON.stringify(symbols, null, 0));
  } catch (err) {
    console.error(JSON.stringify({ error: 'Extraction failed', file: filePath, message: err.message }));
    process.exit(1);
  }
}
