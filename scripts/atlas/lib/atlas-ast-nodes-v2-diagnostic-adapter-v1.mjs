import { createHash } from 'node:crypto';
import { buildAtlasAstNodesV2ProposalV1 } from './atlas-ast-nodes-v2-proposal-contract-v1.mjs';

const LSP_KIND = new Map([[2, 'module'], [5, 'class'], [6, 'method'], [8, 'field'], [9, 'constructor'], [11, 'interface'], [12, 'function'], [23, 'class']]);
const SVELTE_KIND = new Map([
  ['FunctionDeclaration', 'function'], ['ClassDeclaration', 'class'], ['InterfaceDeclaration', 'interface'],
  ['TypeAliasDeclaration', 'type'], ['ImportDeclaration', 'import'], ['ExportDeclaration', 'export'],
]);

function coordinateAt(bytes, offset) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)); }
  catch { throw new Error('AST_V2_DIAGNOSTIC_SPAN_SPLITS_UTF8'); }
  return { utf16: text.length, line: 1 + (text.match(/\n/g) ?? []).length };
}

function requireProviderComplete(provider, name) {
  if (provider?.status !== 'COMPLETED') {
    throw new Error(`AST_V2_DIAGNOSTIC_PROVIDER_NOT_OBSERVED:${name}`);
  }
}

function requireStructuralComplete(provider, name) {
  requireProviderComplete(provider, name);
  if (provider.result?.status === 'OBSERVED') return;
  if (Array.isArray(provider.result?.stageStatus) && provider.result.stageStatus.length > 0 &&
      provider.result.stageStatus.every(stage => typeof stage === 'string' && stage.endsWith(':OK'))) return;
  throw new Error(`AST_V2_DIAGNOSTIC_PROVIDER_NOT_OBSERVED:${name}`);
}

export function buildAtlasAstNodesV2ProposalFromDiagnosticV1(input) {
  const receipt = input?.diagnosticReceipt;
  const source = receipt?.source;
  const bytes = input?.sourceBytes;
  if (receipt?.schema !== 'atlas.indexed-source-provider-diagnostic.v1' ||
      receipt.status !== 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED' ||
      receipt.indexingOutcome !== 'DRY_RUN_VALIDATED_NOT_INDEXED' ||
      !Buffer.isBuffer(bytes) || !source || source.byteLength !== bytes.length ||
      source.exactByteSha256 !== source.sourceRevision ||
      `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== source.sourceRevision) {
    throw new Error('AST_V2_DIAGNOSTIC_SOURCE_BINDING_INVALID');
  }
  if (receipt.canonicalAuthority !== false || receipt.canonicalWritesAttempted !== false ||
      receipt.canonicalWritesCommitted !== 0) throw new Error('AST_V2_DIAGNOSTIC_RECEIPT_AUTHORITY_INVALID');

  const isSvelte = source.sourceRef?.toLowerCase().endsWith('.svelte');
  const structuralName = isSvelte ? 'svelteCompilerAndEmbeddedTypeScript' : 'treeSitterAndAstGrep';
  const structural = receipt.providers?.[structuralName];
  const lsp = receipt.providers?.lsp;
  requireStructuralComplete(structural, structuralName);
  requireProviderComplete(lsp, 'lsp');
  if (lsp.result?.status !== 'OBSERVED') throw new Error('AST_V2_DIAGNOSTIC_PROVIDER_NOT_OBSERVED:lsp');
  for (const [name, provider] of Object.entries(receipt.providers ?? {})) requireProviderComplete(provider, name);

  const facts = [];
  if (isSvelte) {
    for (const fact of structural.result.symbolFacts ?? []) {
      const nodeKind = SVELTE_KIND.get(fact.kind);
      if (nodeKind) facts.push({ nodeKind, qualifiedSymbol: `${fact.scriptContext ?? 'instance'}:${fact.symbol}`, startByte: fact.byteStart, endByte: fact.byteEnd });
    }
  }
  for (const fact of lsp.result.symbolFacts ?? []) {
    const nodeKind = LSP_KIND.get(fact.kind);
    if (!nodeKind || !fact.name) continue;
    const qualifiedSymbol = fact.parentName ? `${fact.parentName}.${fact.name}` : fact.name;
    facts.push({ nodeKind, qualifiedSymbol, startByte: fact.byteStart, endByte: fact.byteEnd });
  }

  const orderedFacts = [...new Map(facts.map(fact => [JSON.stringify(fact), fact])).values()]
    .sort((left, right) => left.startByte - right.startByte || right.endByte - left.endByte ||
      left.nodeKind.localeCompare(right.nodeKind) || left.qualifiedSymbol.localeCompare(right.qualifiedSymbol));

  const occurrences = new Map();
  const nodes = [{ nodeKind: 'file', qualifiedSymbol: source.sourceRef, occurrence: 0, parentIndex: null,
    startByte: 0, endByte: bytes.length, startUtf16: 0, endUtf16: new TextDecoder('utf-8', { fatal: true }).decode(bytes).length,
    lineStart: 1, lineEnd: 1 + (new TextDecoder('utf-8', { fatal: true }).decode(bytes).match(/\n/g) ?? []).length }];
  for (const fact of orderedFacts) {
    if (!Number.isSafeInteger(fact.startByte) || !Number.isSafeInteger(fact.endByte) ||
        fact.startByte < 0 || fact.endByte > bytes.length || fact.startByte >= fact.endByte) continue;
    const key = JSON.stringify([fact.nodeKind, fact.qualifiedSymbol]);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const start = coordinateAt(bytes, fact.startByte);
    const end = coordinateAt(bytes, fact.endByte);
    nodes.push({ ...fact, occurrence, parentIndex: 0, startUtf16: start.utf16, endUtf16: end.utf16,
      lineStart: start.line, lineEnd: end.line });
  }

  return buildAtlasAstNodesV2ProposalV1({ ...input, sourceBytes: bytes,
    sourceRevision: source.sourceRevision, workspaceRevision: source.workspaceRevision,
    pathNamespace: input.pathNamespace, relativePath: input.relativePath, nodes });
}
