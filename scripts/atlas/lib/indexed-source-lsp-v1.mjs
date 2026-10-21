import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { positionToByteOffset } from './lsp-jsonrpc-client.mjs';
import { createCompilerSemanticResolver } from './compiler-semantic-resolver-v1.mjs';

const LSP_LANGUAGE_IDS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.js', 'javascript'], ['.jsx', 'javascript'],
  ['.mts', 'typescript'], ['.cts', 'typescript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
]);
const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/;

export function resolveIndexedSourceLspWorkspaceRootV1({ repoRoot, absolutePath }) {
  const boundary = path.resolve(repoRoot);
  let candidate = path.dirname(path.resolve(absolutePath));
  while (true) {
    const relative = path.relative(boundary, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) break;
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (candidate === boundary) break;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return path.dirname(path.resolve(absolutePath));
}

export function buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin = false } = {}) {
  if (typeof enableTypeScriptPlugin !== 'boolean') throw new Error('INDEXED_SOURCE_SVELTE_LSP_TYPESCRIPT_PLUGIN_SETTING_INVALID');
  return { configuration: { svelte: { plugin: { typescript: { enable: enableTypeScriptPlugin } } } } };
}

export function mapSymbolByteSpans(symbols, sourceBytes) {
  const facts = [];
  const visit = (symbol, parentName = null) => {
    const range = symbol.range ?? symbol.location?.range;
    if (range?.start && range?.end) {
      const byteStart = positionToByteOffset(sourceBytes, range.start);
      const byteEnd = positionToByteOffset(sourceBytes, range.end);
      if (byteStart >= byteEnd || byteEnd > sourceBytes.length) throw new Error('LSP_SYMBOL_BYTE_SPAN_INVALID');
      facts.push({ name: String(symbol.name ?? ''), kind: Number.isInteger(symbol.kind) ? symbol.kind : null, parentName, byteStart, byteEnd });
    }
    for (const child of symbol.children ?? []) visit(child, String(symbol.name ?? parentName ?? ''));
  };
  for (const symbol of Array.isArray(symbols) ? symbols : []) visit(symbol);
  return facts;
}

export async function runIndexedSourceLspV1({ repoRoot, sourceRef, absolutePath, sourceText, sourceBytes = Buffer.from(sourceText, 'utf8'), sourceRevision = null, workspaceRevision = null, timeoutMs = 20000, enableSvelteTypeScriptPlugin = false }) {
  const extension = path.extname(sourceRef).toLowerCase();
  const isSvelte = extension === '.svelte';
  const languageId = isSvelte ? 'svelte' : LSP_LANGUAGE_IDS.get(extension);
  if (!languageId) return { status: 'SKIPPED_UNSUPPORTED_LANGUAGE', symbolCount: 0 };
  if (!Buffer.isBuffer(sourceBytes) || typeof sourceText !== 'string' || !SHA256_REVISION.test(sourceRevision ?? '') ||
      !SHA256_REVISION.test(workspaceRevision ?? '')) {
    return { status: 'STALE_SOURCE', symbolCount: 0, error: 'INDEXED_SOURCE_LSP_REVISION_INVALID', sourceRevision, workspaceRevision };
  }
  let decodedSource;
  try { decodedSource = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes); }
  catch { return { status: 'STALE_SOURCE', symbolCount: 0, error: 'INDEXED_SOURCE_LSP_SOURCE_INVALID_UTF8', sourceRevision, workspaceRevision }; }
  const actualSourceRevision = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;
  if (decodedSource !== sourceText || actualSourceRevision !== sourceRevision) {
    return { status: 'STALE_SOURCE', symbolCount: 0, error: 'INDEXED_SOURCE_LSP_SOURCE_REVISION_MISMATCH', sourceRevision, actualSourceRevision, workspaceRevision };
  }
  const workspaceRoot = resolveIndexedSourceLspWorkspaceRootV1({ repoRoot, absolutePath });
  const symbolScope = isSvelte && !enableSvelteTypeScriptPlugin ? 'SVELTE_HOST_ONLY' : isSvelte ? 'SVELTE_AND_TYPESCRIPT_PLUGIN' : 'LANGUAGE_SERVER';
  const svelteLspOptions = isSvelte
    ? { initializationOptions: buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: enableSvelteTypeScriptPlugin }) }
    : {};
  if (isSvelte) {
    const serverBinaryRoot = path.join(repoRoot, 'sveltekit-frontend');
    const resolver = createCompilerSemanticResolver({ workspaceRoot, serverBinaryRoot, ...svelteLspOptions });
    try {
      const receipt = await resolver.documentSymbols({
        workspaceRevision, sourceRef, sourceRevision, sourceAbsolutePath: absolutePath,
        sourceText, sourceBuffer: sourceBytes, language: 'svelte', timeoutMs,
      });
      if (receipt.result.status !== 'OBSERVED') {
        return { status: receipt.result.status, languageId: 'svelte', symbolScope, symbolCount: 0, error: receipt.result.error,
          sourceRevision, workspaceRevision, resolver: receipt.resolver, canonicalAuthority: false, writesPerformed: false };
      }
      const symbolFacts = mapSymbolByteSpans(receipt.result.symbols, sourceBytes);
      return { status: 'OBSERVED', languageId: 'svelte', symbolScope, symbolCount: symbolFacts.length, symbolFacts,
        sourceRevision, workspaceRevision, resolver: receipt.resolver, canonicalAuthority: false, writesPerformed: false };
    } finally {
      await resolver.dispose();
    }
  }
  const resolver = createCompilerSemanticResolver({
    workspaceRoot,
    serverBinaryRoot: path.join(repoRoot, 'sveltekit-frontend'),
  });
  try {
    const receipt = await resolver.documentSymbols({
      workspaceRevision, sourceRef, sourceRevision, sourceAbsolutePath: absolutePath,
      sourceText, sourceBuffer: sourceBytes, language: languageId, timeoutMs,
    });
    if (receipt.result.status !== 'OBSERVED') {
      return { status: receipt.result.status, languageId, symbolCount: 0, error: receipt.result.error,
        sourceRevision, workspaceRevision, resolver: receipt.resolver, canonicalAuthority: false, writesPerformed: false };
    }
    const symbolFacts = mapSymbolByteSpans(receipt.result.symbols, sourceBytes);
    return { status: 'OBSERVED', languageId, symbolCount: symbolFacts.length, symbolFacts,
      sourceRevision, workspaceRevision, resolver: receipt.resolver, canonicalAuthority: false, writesPerformed: false };
  } finally {
    await resolver.dispose();
  }
}
