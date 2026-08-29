/**
 * Atlas-facing compiler-semantic symbol resolver (CSGR-1).
 *
 * Sits on top of `lsp-jsonrpc-client.mjs` (pure transport/protocol lifecycle) and adds the
 * Atlas-specific concerns: persistent one-server-per-language reuse across many resolve calls
 * (never spawn-per-edge — see openspec/changes/parent-atlas-compiler-semantic-graph-resolution
 * proposal.md), byte-offset → LSP-position conversion (tree-sitter evidence is UTF-8 byte
 * offsets; LSP positions are UTF-16 code-unit line/character), and CompilerSemanticResolutionV1
 * receipt shaping.
 *
 * This module produces OBSERVATIONS ONLY. `canonicalAuthority` and `writesPerformed` are always
 * false. It does not derive stableSymbolId, symbolVersionId, GraphNodeKey, or CandidateOrdinal —
 * those remain owned by Atlas's existing identity resolvers and are computed from this receipt's
 * output afterward, never inside it.
 */

import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnLspServer, byteOffsetToPosition } from './lsp-jsonrpc-client.mjs';

export const RESOLVER_REVISION = 'atlas.compiler-semantic-resolver.2026-08-29.v1';

const SERVER_CONFIG = {
  typescript: {
    id: 'typescript-language-server',
    version: '5.3.0',
    commandRelative: 'node_modules/.bin/typescript-language-server.cmd',
    args: ['--stdio'],
    useShellWrapper: process.platform === 'win32',
    languageId: 'typescript',
  },
  javascript: {
    id: 'typescript-language-server',
    version: '5.3.0',
    commandRelative: 'node_modules/.bin/typescript-language-server.cmd',
    args: ['--stdio'],
    useShellWrapper: process.platform === 'win32',
    languageId: 'javascript',
  },
  svelte: {
    id: 'svelte-language-server',
    version: '0.18.3',
    commandRelative: 'node_modules/.bin/svelteserver.cmd',
    // Preserved from the pre-extraction proof script: always cmd.exe-wrapped, not platform-gated.
    // Not silently "fixed" here — flagged as a known latent cross-platform gap, unchanged.
    useShellWrapper: true,
    args: ['--stdio'],
    languageId: 'svelte',
  },
};

/**
 * `workspaceRoot` is the LSP rootUri for every server spawned by this resolver instance — one
 * resolver per workspace, one server per language within it, reused across every resolveDefinition
 * call until dispose(). Never construct a new resolver (and thus a new server) per edge.
 *
 * `serverBinaryRoot` (optional, defaults to `workspaceRoot`) is where `config.commandRelative`
 * (`node_modules/.bin/typescript-language-server.cmd`) is resolved FROM — decoupled from
 * `workspaceRoot` because not every directory this resolver might be rooted at has its own
 * `node_modules` install. Found live 2026-08-29: pointing `workspaceRoot` at the repo root (to
 * resolve edges under `scripts/**`, which has no `node_modules` of its own) resolved the binary
 * path to a nonexistent file; on Windows, `useShellWrapper` spawns a shell around that missing
 * path rather than failing fast, so the failure surfaced as a 60s `initialize` timeout, not a
 * clear ENOENT — worth knowing if this pattern recurs elsewhere. Pass `serverBinaryRoot:
 * '<dir-with-a-real-node_modules>'` (e.g. `sveltekit-frontend/`) while still rooting the actual
 * LSP session (`rootUri`) at `workspaceRoot`.
 */
export function createCompilerSemanticResolver({ workspaceRoot, serverBinaryRoot = workspaceRoot, clientName = 'parent-atlas-compiler-semantic-resolver', clientVersion = '1' }) {
  const servers = new Map();
  const workspaceUri = pathToFileURL(workspaceRoot).href;

  async function getServer(language) {
    const config = SERVER_CONFIG[language];
    if (!config) throw new Error(`COMPILER_SEMANTIC_RESOLVER_UNSUPPORTED_LANGUAGE:${language}`);
    const command = resolve(serverBinaryRoot, config.commandRelative);
    // Cache by resolved command path, not the requested `language` — 'typescript' and
    // 'javascript' both map to the identical typescript-language-server binary/args (see
    // SERVER_CONFIG above), so caching by language spawned two separate OS processes for what
    // is functionally one server. Found live 2026-08-29: a resolver instance handling both
    // .ts and .mjs files was observed spawning 2 typescript-language-server child processes
    // where 1 would do — real, measurable memory waste, not theoretical (confirmed via
    // `wmic process where "name='node.exe'"` during a live CSGR-2 full-corpus run).
    if (servers.has(command)) return servers.get(command);
    if (!existsSync(command)) {
      throw new Error(`COMPILER_SEMANTIC_RESOLVER_BINARY_NOT_FOUND:${command} (serverBinaryRoot=${serverBinaryRoot}) — the LSP binary must actually exist at this path; a missing binary spawned via the Windows shell wrapper silently hangs to an initialize timeout instead of failing fast, which is exactly the failure mode this check exists to prevent.`);
    }
    const lsp = spawnLspServer({ command, args: config.args, cwd: workspaceRoot, useShellWrapper: config.useShellWrapper });
    const initializeResult = await lsp.initialize({
      processId: process.pid,
      rootUri: workspaceUri,
      workspaceFolders: [{ uri: workspaceUri, name: 'workspace' }],
      // V1 performs UTF-8-byte to UTF-16-code-unit conversion. Advertise only
      // the encoding this resolver actually implements; do not negotiate an
      // encoding that would make byteOffsetToPosition() semantically wrong.
      capabilities: { general: { positionEncodings: ['utf-16'] } },
      clientInfo: { name: clientName, version: clientVersion },
    }, 60000);
    const entry = { lsp, config, initializeResult, openedUris: new Set(), languagesServed: new Set() };
    servers.set(command, entry);
    return entry;
  }

  // languageId is passed per-open (not baked into the cached server entry) because one shared
  // typescript-language-server process now serves both 'typescript' and 'javascript' documents —
  // each open must declare its own real languageId, not whichever config first spawned the server.
  function ensureOpen(entry, { sourceAbsolutePath, sourceText, languageId }) {
    const uri = pathToFileURL(sourceAbsolutePath).href;
    if (!entry.openedUris.has(uri)) {
      entry.lsp.didOpen({ uri, languageId, text: sourceText });
      entry.openedUris.add(uri);
    }
    return uri;
  }

  /**
   * Resolve one occurrence position to its definition. `sourceBuffer` should be the exact bytes
   * bound to `sourceRevision` (not re-read from disk at call time) — a mismatch between the
   * bytes used for byte-offset math and the bytes actually open in the server is exactly the
   * class of bug this contract exists to prevent.
   */
  async function resolveDefinition({
    requestId = null,
    workspaceRevision = null,
    sourceRef,
    sourceRevision,
    sourceAbsolutePath,
    sourceText,
    sourceBuffer,
    byteOffset,
    // Alternative to byteOffset: a caller that already has a 0-indexed LSP position (e.g. the
    // 8095 sidecar's own evidence_start_line/column, converted by the caller) can pass it
    // directly and skip byte->position conversion entirely. Exactly one of byteOffset/position
    // must be supplied.
    position: precomputedPosition = null,
    edgeType = null,
    sourceEvidenceRef = null,
    language,
    timeoutMs = 15000,
  }) {
    const base = {
      schema: 'atlas.compiler-semantic-resolution.v1',
      requestId, workspaceRevision, sourceRef, sourceRevision, edgeType, sourceEvidenceRef, language,
      canonicalAuthority: false,
      writesPerformed: false,
    };

    let position;
    let sourcePosition;
    if (precomputedPosition) {
      position = precomputedPosition;
      sourcePosition = { byteOffset: null, ...position };
    } else {
      const buffer = sourceBuffer ?? Buffer.from(sourceText, 'utf8');
      try {
        position = byteOffsetToPosition(buffer, byteOffset);
      } catch (error) {
        return { ...base, sourcePosition: null, resolver: null, result: { status: 'STALE_SOURCE', targets: [], error: error instanceof Error ? error.message : String(error) } };
      }
      sourcePosition = { byteOffset, ...position };
    }

    // ensureOpen()'s didOpen() requires real text — a missing value here is silently dropped by
    // JSON.stringify from the wire message, and the server then falls back to reading the file
    // live from disk instead of the exact bytes bound to sourceRevision (found live 2026-08-29 in
    // CSGR-2's first caller). Fail loudly instead of sending a malformed didOpen.
    const resolvedSourceText = sourceText ?? (sourceBuffer ? sourceBuffer.toString('utf8') : null);
    if (!resolvedSourceText) {
      return { ...base, sourcePosition, resolver: null, result: { status: 'SERVER_ERROR', targets: [], error: 'COMPILER_SEMANTIC_RESOLVER_MISSING_SOURCE_TEXT: neither sourceText nor sourceBuffer was provided' } };
    }

    let entry;
    try {
      entry = await getServer(language);
    } catch (error) {
      return { ...base, sourcePosition, resolver: null, result: { status: 'SERVER_ERROR', targets: [], error: error instanceof Error ? error.message : String(error) } };
    }

    const resolverMeta = {
      server: entry.config.id,
      serverRevision: entry.config.version,
      resolverRevision: RESOLVER_REVISION,
      negotiatedPositionEncoding: entry.initializeResult?.result?.capabilities?.positionEncoding ?? 'utf-16-default',
    };

    entry.languagesServed.add(language);
    const uri = ensureOpen(entry, { sourceAbsolutePath, sourceText: resolvedSourceText, languageId: SERVER_CONFIG[language].languageId });
    let definitionResult;
    try {
      definitionResult = await entry.lsp.request('textDocument/definition', { textDocument: { uri }, position }, timeoutMs);
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.startsWith('LSP_TIMEOUT');
      return { ...base, sourcePosition, resolver: resolverMeta, result: { status: isTimeout ? 'TIMEOUT' : 'SERVER_ERROR', targets: [], error: error instanceof Error ? error.message : String(error) } };
    }
    if (definitionResult.error) {
      return { ...base, sourcePosition, resolver: resolverMeta, result: { status: 'SERVER_ERROR', targets: [], error: JSON.stringify(definitionResult.error) } };
    }

    const raw = definitionResult.result;
    const locations = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (locations.length === 0) {
      return { ...base, sourcePosition, resolver: resolverMeta, result: { status: 'UNRESOLVED', targets: [], error: null } };
    }
    const targets = locations.map((loc) => ({
      targetUri: loc.uri ?? loc.targetUri ?? null,
      targetRange: loc.range ?? loc.targetRange ?? null,
    }));
    return {
      ...base,
      sourcePosition,
      resolver: resolverMeta,
      result: { status: targets.length > 1 ? 'AMBIGUOUS' : 'RESOLVED_IN_REPO', targets, error: null },
    };
  }

  async function dispose() {
    for (const entry of servers.values()) await entry.lsp.dispose();
    servers.clear();
  }

  return {
    resolveDefinition,
    dispose,
    // Distinct languages actually served across every spawned server process — NOT the same as
    // "one entry per language" any more, since typescript/javascript now share one process. Kept
    // as a diagnostic helper (zero callers currently) rather than removed outright.
    getOpenServerLanguages: () => [...new Set(Array.from(servers.values()).flatMap((entry) => [...entry.languagesServed]))],
  };
}

/**
 * Classifies an unresolved `syntax_only` import specifier WITHOUT spawning any LSP server. A
 * `node:*` builtin or a declared package.json dependency is a correct terminal state
 * (EXTERNAL_MODULE), not a gap — callers should run this before deciding whether an edge needs
 * resolveDefinition() at all.
 */
export function classifyModuleSpecifier(specifier, { packageJsonDependencies = new Set() } = {}) {
  const trimmed = String(specifier ?? '').trim();
  if (!trimmed) return 'UNKNOWN_SPECIFIER';
  const builtinNames = new Set(builtinModules);
  const builtinName = trimmed.startsWith('node:') ? trimmed.slice(5) : trimmed;
  if (builtinNames.has(builtinName)) return 'NODE_BUILTIN';
  if (/^(?:https?:|data:|file:)/i.test(trimmed)) return 'EXTERNAL_RESOURCE';
  if (trimmed.startsWith('.') || trimmed.startsWith('/')) return 'REPO_RESOLVABLE';
  const packageName = trimmed.startsWith('@') ? trimmed.split('/').slice(0, 2).join('/') : trimmed.split('/')[0];
  if (packageJsonDependencies.has(packageName)) return 'EXTERNAL_MODULE';
  return 'UNKNOWN_SPECIFIER';
}
