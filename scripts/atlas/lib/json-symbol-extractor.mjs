/**
 * Structural symbol extraction for .json files. JSON has no code AST, but its top-level
 * (and one level of nested) keys are a real, useful structural signal -- the same shape this
 * extraction lane already produces for TS/JS via ts-ast-extractor.mjs, just for a different kind
 * of "symbol": an addressable key path rather than a function/class declaration.
 *
 * Byte offsets are approximate (found via a bounded forward text search for the key's quoted
 * form after the previous match position), not a real JSON-with-locations parse -- acceptable
 * for a v1 structural signal, same tolerance this repo already accepts for TS/JS "byte" offsets
 * (see ts-ast-extractor.mjs's docstring: these are string-index offsets, not raw UTF-8 bytes).
 */
import crypto from 'node:crypto';

const SIGNATURE_TEXT_MAX_CHARS = 400;
const MAX_DEPTH = 2;

function fingerprint(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function extractJsonSymbols(content, filePath) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`JSON_PARSE_FAILED:${filePath}:${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== 'object') return [];

  const symbols = [];
  let searchCursor = 0;

  function locate(key) {
    const needle = JSON.stringify(String(key));
    const idx = content.indexOf(needle, searchCursor);
    if (idx === -1) return null;
    searchCursor = idx + needle.length;
    return idx;
  }

  function visit(node, depth, parentChain) {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
    const entries = Array.isArray(node)
      ? node.map((value, index) => [String(index), value])
      : Object.entries(node);

    for (const [key, value] of entries) {
      const startByte = locate(key);
      if (startByte === null) continue;
      const valueText = JSON.stringify(value ?? null);
      const endByte = startByte + valueText.length;
      const isContainer = value !== null && typeof value === 'object';

      symbols.push({
        kind: isContainer ? 'module' : 'field',
        name: key,
        start_line: 0,
        end_line: 0,
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

  visit(parsed, 0, []);
  return symbols;
}
