/** Derived, read-only capability outcome per source identity. Not an identity owner. */
export const CAPABILITY_OUTCOMES_V1 = Object.freeze([
  'NOT_AST_ELIGIBLE',
  'ELIGIBLE_PARSER_UNAVAILABLE',
  'ELIGIBLE_NOT_TRAVERSED',
  'TRAVERSED_PARSE_FAILED',
  'LEGACY_PRODUCER_ROWS_UNQUALIFIED',
  'PARSED_NOT_REVISION_QUALIFIED',
  'REVISION_QUALIFIED_AST',
  'SYMBOL_RESOLVED',
]);

// Mirrors NODE_TREE_SITTER_PROVIDER_LANGUAGES_V1 (typescript, tsx, javascript, jsx).
const PROVIDER_EXT = new Map([
  ['ts', 'typescript'], ['mts', 'typescript'], ['cts', 'typescript'], ['tsx', 'tsx'],
  ['js', 'javascript'], ['mjs', 'javascript'], ['cjs', 'javascript'], ['jsx', 'jsx'],
]);
// Code languages a grammar could parse, but no provider is wired for.
const UNWIRED_CODE_EXT = new Set(['svelte', 'py', 'rs', 'go', 'cu', 'cuh', 'c', 'cc', 'cpp', 'h', 'hpp', 'sql', 'sh', 'ps1', 'proto', 'wgsl', 'java', 'cs']);

export function extensionOf(sourceRef) {
  const base = String(sourceRef).split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

/** lineageClass comes from classifyCurrentAstSourceV1. Symbol resolution and parse-failure ledgers are not measured here. */
export function classifyFileCapabilityV1({ sourceRef, lineageClass }) {
  const ext = extensionOf(sourceRef);
  const language = PROVIDER_EXT.get(ext) ?? null;
  if (!language) {
    if (UNWIRED_CODE_EXT.has(ext)) {
      return lineageClass && lineageClass !== 'AST_EVIDENCE_ABSENT'
        ? { outcome: 'LEGACY_PRODUCER_ROWS_UNQUALIFIED', reason: `LEGACY_ROWS_${lineageClass}_NO_WIRED_PROVIDER_${ext}`, language: null }
        : { outcome: 'ELIGIBLE_PARSER_UNAVAILABLE', reason: `NO_PROVIDER_FOR_${ext}`, language: null };
    }
    return { outcome: 'NOT_AST_ELIGIBLE', reason: ext ? `NON_CODE_EXTENSION_${ext}` : 'NO_EXTENSION', language: null };
  }
  if (lineageClass === 'AST_EVIDENCE_ABSENT') return { outcome: 'ELIGIBLE_NOT_TRAVERSED', reason: 'NO_AST_ROWS', language };
  if (lineageClass === 'AST_REVISION_QUALIFIED') return { outcome: 'REVISION_QUALIFIED_AST', reason: null, language };
  return { outcome: 'PARSED_NOT_REVISION_QUALIFIED', reason: lineageClass, language };
}
