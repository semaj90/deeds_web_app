/**
 * Structural symbol extraction for .json files. JSON has no code AST, but its top-level
 * (and one level of nested) keys are a real, useful structural signal -- the same shape this
 * extraction lane already produces for TS/JS via ts-ast-extractor.mjs, just for a different kind
 * of "symbol": an addressable key path rather than a function/class declaration.
 *
 * Strict JSON validation precedes location extraction through the existing TypeScript compiler.
 * Offsets are decoded UTF-16 string indices; the source envelope maps these to raw bytes at the
 * writer boundary. The observation limit is checked before constructing the location tree.
 */
import crypto from 'node:crypto';
import ts from 'typescript';
import { inspectJsonSourceShapeV1, JSON_SOURCE_SHAPE_POLICY_V1 } from './json-source-shape-policy-v1.mjs';

const MAX_DEPTH = JSON_SOURCE_SHAPE_POLICY_V1.maxObjectDepth;
const SIGNATURE_TEXT_MAX_CHARS = 400;

function fingerprint(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function extractJsonSymbols(content, filePath, { maxSymbols = JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile, maxSourceBytes } = {}) {
  const shape = inspectJsonSourceShapeV1(content, filePath, { maxObservations: maxSymbols,
    ...(maxSourceBytes === undefined ? {} : { maxSourceBytes }) });
  const parsed = shape.parsed;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const source = ts.parseJsonText(filePath, content);
  if (source.parseDiagnostics.length) throw new Error(`JSON_LOCATION_PARSE_FAILED:${filePath}`);
  const symbols = [];
  function visit(node, depth, parentChain) {
    if (depth > MAX_DEPTH || !node) return;
    const entries = ts.isObjectLiteralExpression(node)
      ? node.properties.map(property => ({ key: property.name.text, value: property.initializer, location: property }))
      : [];
    for (const { key, value, location } of entries) {
      if (symbols.length >= maxSymbols) throw new Error('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:OBSERVATIONS_EXCEED_LIMIT');
      const startByte = location.getStart(source);
      const endByte = value.getEnd();
      const valueText = content.slice(value.getStart(source), endByte);
      const isContainer = ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value);

      symbols.push({
        kind: isContainer ? 'module' : 'field',
        name: key,
        start_line: source.getLineAndCharacterOfPosition(startByte).line + 1,
        end_line: source.getLineAndCharacterOfPosition(endByte).line + 1,
        start_byte: startByte,
        end_byte: Math.max(endByte, startByte),
        signature_text: valueText.slice(0, SIGNATURE_TEXT_MAX_CHARS),
        hash: fingerprint(valueText).slice(0, 12),
        ast_fingerprint: fingerprint(valueText),
        parent_chain: parentChain,
      });

      if (isContainer && depth < MAX_DEPTH) {
        visit(value, depth + 1, [...parentChain, { kind: 'module', name: key }]);
      }
    }
  }

  visit(source.statements[0]?.expression, 0, []);
  return symbols;
}
