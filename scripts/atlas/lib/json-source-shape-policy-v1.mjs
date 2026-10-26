/**
 * Bounded structural policy for authored JSON sources. Arrays are data payloads, not lists of
 * synthetic source symbols: the containing property is one observation and array members are
 * opaque. Object keys are observed only through the existing shallow depth-2 contract. The
 * TypeScript JSONC grammar is used because repository configuration files commonly include
 * comments and trailing commas despite their `.json` suffix.
 */
import ts from 'typescript';

export const JSON_SOURCE_SHAPE_POLICY_V1 = Object.freeze({
  revision: 'atlas.json-source-shape-policy.v2',
  maxSourceBytes: 4 * 1024 * 1024,
  maxObservationsPerFile: 2_000,
  maxObjectDepth: 2,
  arrayTreatment: 'OPAQUE_PROPERTY_VALUE',
  rootArrayTreatment: 'VALID_ZERO_OBSERVATIONS',
});

export function inspectJsonSourceShapeV1(content, filePath, {
  maxSourceBytes = JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes,
  maxObservations = JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile,
} = {}) {
  if (typeof content !== 'string') throw new TypeError('JSON_SOURCE_CONTENT_MUST_BE_STRING');
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes) {
    throw new Error('JSON_SOURCE_BYTE_LIMIT_INVALID');
  }
  if (!Number.isSafeInteger(maxObservations) || maxObservations < 1 || maxObservations > JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile) {
    throw new Error('JSON_SOURCE_OBSERVATION_LIMIT_INVALID');
  }

  const sourceBytes = Buffer.byteLength(content, 'utf8');
  if (sourceBytes > maxSourceBytes) {
    throw new Error('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:SOURCE_BYTES_EXCEED_LIMIT');
  }

  const source = ts.parseJsonText(filePath, content);
  const diagnostics = [...source.parseDiagnostics];
  const convert = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const value = {};
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
          throw new Error(`JSON_PARSE_FAILED:${filePath}:JSON_PROPERTY_EXPECTED`);
        }
        Object.defineProperty(value, property.name.text, {
          value: convert(property.initializer), enumerable: true, configurable: true, writable: true,
        });
      }
      return value;
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(convert);
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken
      && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
    throw new Error(`JSON_PARSE_FAILED:${filePath}:JSON_VALUE_EXPECTED`);
  };
  let parsed;
  try {
    const expression = source.statements[0]?.expression;
    parsed = expression ? convert(expression) : {};
    if (diagnostics.length) {
      const message = ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ');
      throw new Error(message);
    }
  } catch (error) {
    throw new Error(`JSON_PARSE_FAILED:${filePath}:${error instanceof Error ? error.message : String(error)}`);
  }

  let potentialObservations = 0;
  function countObjectKeys(node, depth) {
    if (depth > JSON_SOURCE_SHAPE_POLICY_V1.maxObjectDepth || node === null || Array.isArray(node) || typeof node !== 'object') return;
    for (const value of Object.values(node)) {
      potentialObservations += 1;
      if (potentialObservations > maxObservations) {
        throw new Error('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:OBSERVATIONS_EXCEED_LIMIT');
      }
      // Arrays and their members are intentionally opaque. Nested objects remain addressable.
      if (!Array.isArray(value)) countObjectKeys(value, depth + 1);
    }
  }
  countObjectKeys(parsed, 0);

  return {
    policyRevision: JSON_SOURCE_SHAPE_POLICY_V1.revision,
    sourceBytes,
    rootKind: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
    potentialObservations,
    outcome: potentialObservations === 0 ? 'VALID_ZERO_OBSERVATIONS' : 'COMPLETE',
    parsed,
  };
}
