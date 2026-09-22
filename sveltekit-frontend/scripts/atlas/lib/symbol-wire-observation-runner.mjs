// Shared observation-building logic for SYMBOL-WIRE-01 (symbol-kind-smoke-fanout-v1.mjs) and
// SYMBOL-WIRE-02 (symbol-wire-02-registry-classification.mjs). Extracted here so the two scripts
// reuse ONE parse+coordinate-ground+project pipeline rather than duplicating it -- per this
// repo's Duplication Prevention rule.
//
// Produces StructuralObservationV1-shaped records with real UTF-8-byte-grounded spans (see
// source-coordinate-map-v1.ts's runtime caveat for why this matters: the installed tree-sitter
// runtime exposes UTF-16 code-unit indices, not bytes, for this path).

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..'); // sveltekit-frontend/

const { normalizeStructuralSymbolKind, projectStructuralObservation, fingerprintStructuralSource } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, 'src', 'lib', 'server', 'atlas', 'indexing', 'structural-observation-v1.ts'),
  ).href
);
const { createSourceOffsetConverter } = await import(
  pathToFileURL(
    path.join(REPO_ROOT, 'src', 'lib', 'server', 'atlas', 'indexing', 'source-coordinate-map-v1.ts'),
  ).href
);

export const TREE_SITTER_VERSION = require('tree-sitter/package.json').version;
export const TREE_SITTER_TYPESCRIPT_VERSION = require('tree-sitter-typescript/package.json').version;

const DECLARATION_NODE_TYPES = new Set([
  'function_declaration',
  'arrow_function',
  'function_expression',
  'method_definition',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'variable_declarator',
  'lexical_declaration',
]);

function walk(node, onNode) {
  if (DECLARATION_NODE_TYPES.has(node.type)) onNode(node);
  for (let i = 0; i < node.childCount; i += 1) {
    walk(node.child(i), onNode);
  }
}

/**
 * Parses one file and returns real, UTF-8-byte-grounded structural observations.
 * Returns { ok: false, error } on parse failure, or:
 * { ok: true, symbols: [...], fingerprintSha256, projectionFailures }
 */
export function buildObservationsForFile(absPath, sourceRef, workspaceRevision) {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const source = readFileSync(absPath, 'utf8');
  let tree;
  try {
    tree = parser.parse(source);
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }

  const converter = createSourceOffsetConverter(source);
  const fingerprint = fingerprintStructuralSource(source);
  const sourceRevision = `sha256:${fingerprint.sha256}`;

  const symbols = [];
  let projectionFailures = 0;

  walk(tree.rootNode, (node) => {
    const rawNodeType = node.type;
    const symbolKind = normalizeStructuralSymbolKind(node.type, node.type);
    // Additive name extraction (2026-09-22, for SYMBOL-PROMOTED-UNKNOWN-01's
    // NAME_OR_SIGNATURE_MISMATCH bucket) -- does not affect any SYMBOL-WIRE-01 field/count.
    const name = node.childForFieldName?.('name')?.text ?? null;

    let utf8StartByte = null;
    let utf8EndByte = null;
    let roundTripMatched = false;
    let negativeLength = false;
    let outOfBounds = false;
    let observation = null;
    let failed = false;

    try {
      utf8StartByte = converter.utf16CodeUnitToUtf8Byte(node.startIndex);
      utf8EndByte = converter.utf16CodeUnitToUtf8Byte(node.endIndex);
      negativeLength = utf8EndByte < utf8StartByte;
      outOfBounds = utf8EndByte > fingerprint.utf8ByteLength;
      roundTripMatched =
        converter.utf8ByteToUtf16CodeUnit(utf8StartByte) === node.startIndex &&
        converter.utf8ByteToUtf16CodeUnit(utf8EndByte) === node.endIndex;

      observation = projectStructuralObservation('node-tree-sitter-smoke-fanout-v1', source, {
        node_type: rawNodeType,
        kind: rawNodeType,
        name,
        parent_route: [],
        parent_context: null,
        start_byte: utf8StartByte,
        end_byte: utf8EndByte,
        start_line: 0,
        start_column: 0,
        end_line: 0,
        end_column: 0,
      });
    } catch {
      failed = true;
      projectionFailures += 1;
    }

    symbols.push({
      rawNodeType,
      rawNodeKind: rawNodeType,
      symbolKind,
      name,
      signature: `${rawNodeType} ${name ?? ""}`.trim(),
      sourceRef,
      sourceRevision,
      workspaceRevision,
      sourceFingerprint: fingerprint,
      sourceChecksum: fingerprint.sha256,
      utf8StartByte,
      utf8EndByte,
      coordinateGrounded: !failed,
      spanValid: observation?.spanValid ?? false,
      roundTripMatched,
      negativeLength,
      outOfBounds,
      projectionFailed: failed,
    });
  });

  return { ok: true, symbols, fingerprintSha256: fingerprint.sha256, projectionFailures };
}

export function sourceRevisionForFile(absPath) {
  const bytes = readFileSync(absPath);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
