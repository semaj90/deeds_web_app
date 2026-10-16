import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFunctionRegistrySidecarAstProviderV1,
  createFunctionRegistryPostgresReadPortsV1,
  queryCallableSearchProjectionInReadOnlyTransactionV1,
  readFunctionRegistrySourceBytesV1,
} from './function-registry-postgres-snapshot-loader-v1.js';

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-function-registry-'));
  roots.push(root);
  return root;
}

function revision(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PostgreSQL snapshot source read boundary', () => {
  it('uses the configured native AST provider without falling back to stale AST rows', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const astObservationProvider = vi.fn(async () => []);
    const ports = createFunctionRegistryPostgresReadPortsV1(
      { query, release: () => undefined } as unknown as Parameters<typeof createFunctionRegistryPostgresReadPortsV1>[0],
      '/repo',
      { astObservationProvider },
    );
    const symbol: Parameters<typeof ports.getAstCandidates>[0] = {
      symbolVersionId: 'symbol-version-1', stableSymbolId: 'symbol-1',
      sourceRef: 'src/resolve.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
      qualifiedName: 'resolve', signatureNormalized: null, producerRevision: 'test',
      packetKey: 'packet:1', byteStart: 0, byteEnd: 1, upstreamNodeId: 'upstream-node-1',
    };
    const binding: Parameters<typeof ports.getAstCandidates>[1] = {
      repoId: 'deeds-web-app', astRepoId: 'repo-uuid', canonicalSourceRef: symbol.sourceRef,
      sourceRevision: symbol.sourceRevision, workspaceRevision: symbol.workspaceRevision, contentDigest: symbol.sourceRevision,
    };

    await expect(ports.getAstCandidates(symbol, binding, Buffer.from('x'))).resolves.toEqual([]);

    expect(astObservationProvider).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it('maps only exact, revision-correlated 8095 AST evidence to registry observations', async () => {
    const sourceBytes = Buffer.from('export function resolve() { return true; }', 'utf8');
    const sourceRevision = revision(sourceBytes);
    const symbol = {
      symbolVersionId: 'symbol-version-1',
      stableSymbolId: 'symbol-1',
      sourceRef: 'src/Resolve.ts',
      sourceRevision,
      workspaceRevision: 'sha256:workspace',
      qualifiedName: 'resolve',
      signatureNormalized: 'export function resolve() ',
      producerRevision: 'test',
      packetKey: 'packet:1',
      byteStart: 0,
      byteEnd: sourceBytes.byteLength,
      upstreamNodeId: 'native-node-1',
    };
    const binding = {
      repoId: 'deeds-web-app',
      astRepoId: 'repo-uuid',
      canonicalSourceRef: symbol.sourceRef,
      sourceRevision,
      workspaceRevision: symbol.workspaceRevision,
      contentDigest: sourceRevision,
    };
    const astChunk = vi.fn(async () => ({
      schema: 'atlas.ast.evidence.v1' as const,
      engine: 'tree-sitter',
      engine_version: '1',
      language: 'typescript',
      file_path: symbol.sourceRef,
      source_revision: sourceRevision,
      chunks: [{
        upstream_node_id: 'native-node-1',
        node_type: 'function_declaration',
        kind: 'function',
        name: 'resolve',
        start_byte: 0,
        end_byte: sourceBytes.byteLength,
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: sourceBytes.byteLength,
        calls: [], imports: [], exports: [],
        signature_text: 'export function resolve() ',
        syntax_ancestry: [{ node_type: 'export_statement', start_byte: 0, end_byte: sourceBytes.byteLength }],
      }],
      edges: [],
      diagnostics: [],
      syntax_status: 'CLEAN' as const,
    }));
    const provider = createFunctionRegistrySidecarAstProviderV1({ astChunk });

    const rows = await provider({ symbol, binding, sourceBytes });

    expect(astChunk).toHaveBeenCalledWith({
      source: sourceBytes.toString('utf8'),
      language: 'typescript',
      filePath: symbol.sourceRef,
      sourceRevision,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.node).toMatchObject({
      treeNodeId: 'native-node-1',
      relativePath: 'src/resolve.ts',
      repoId: 'repo-uuid',
      sourceRevision,
      sourceContentHash: sourceRevision.slice('sha256:'.length),
      startByte: 0,
      endByte: sourceBytes.byteLength,
    });
    expect(rows[0]?.declarationText).toBe(sourceBytes.toString('utf8'));
    expect(rows[0]?.astPath).toBe('export_statement/function_declaration:resolve');
  });

  it('rejects stale, ambiguous, or signature-mismatched 8095 evidence', async () => {
    const sourceBytes = Buffer.from('function resolve() {}', 'utf8');
    const sourceRevision = revision(sourceBytes);
    const symbol = {
      symbolVersionId: 'symbol-version-1', stableSymbolId: 'symbol-1',
      sourceRef: 'src/resolve.ts', sourceRevision, workspaceRevision: 'sha256:workspace',
      qualifiedName: 'resolve', signatureNormalized: 'function resolve()', producerRevision: 'test',
      packetKey: 'packet:1', byteStart: 0, byteEnd: sourceBytes.byteLength, upstreamNodeId: 'native-node-1',
    };
    const binding = {
      repoId: 'deeds-web-app', astRepoId: 'repo-uuid', canonicalSourceRef: symbol.sourceRef,
      sourceRevision, workspaceRevision: symbol.workspaceRevision, contentDigest: sourceRevision,
    };
    const evidence = {
      schema: 'atlas.ast.evidence.v1' as const, engine: 'tree-sitter', engine_version: '1',
      language: 'typescript', file_path: symbol.sourceRef, source_revision: sourceRevision,
      chunks: [{ upstream_node_id: 'native-node-1', node_type: 'function_declaration', kind: 'function',
        name: 'resolve', start_byte: 0, end_byte: sourceBytes.byteLength, start_line: 1,
        start_column: 0, end_line: 1, end_column: sourceBytes.byteLength, calls: [], imports: [], exports: [],
        signature_text: 'function resolve() ', syntax_ancestry: [{ node_type: 'program', start_byte: 0, end_byte: sourceBytes.byteLength }] }],
      edges: [], diagnostics: [], syntax_status: 'CLEAN' as const,
    };
    const provider = createFunctionRegistrySidecarAstProviderV1({ astChunk: async () => evidence });
    expect(await provider({ symbol, binding, sourceBytes })).toHaveLength(1);
    expect(await provider({ symbol, binding, sourceBytes, })).toHaveLength(1);
    const staleProvider = createFunctionRegistrySidecarAstProviderV1({
      astChunk: async () => ({ ...evidence, source_revision: 'sha256:stale' }),
    });
    await expect(staleProvider({ symbol, binding, sourceBytes })).rejects.toThrow(/not clean or revision\/path correlated/);
    const mismatchedProvider = createFunctionRegistrySidecarAstProviderV1({
      astChunk: async () => ({ ...evidence, chunks: evidence.chunks.map((chunk) => ({ ...chunk, signature_text: 'function other() ' })) }),
    });
    expect(await mismatchedProvider({ symbol, binding, sourceBytes })).toHaveLength(0);
    const ambiguousProvider = createFunctionRegistrySidecarAstProviderV1({
      astChunk: async () => ({ ...evidence, chunks: [...evidence.chunks, { ...evidence.chunks[0] }] }),
    });
    expect(await ambiguousProvider({ symbol, binding, sourceBytes })).toHaveLength(2);
  });

  it('matches revision-qualified names using the parser ancestry route', async () => {
    const sourceBytes = Buffer.from('export function resolve() {}', 'utf8');
    const sourceRevision = revision(sourceBytes);
    const symbol = {
      symbolVersionId: 'symbol-version-ancestry', stableSymbolId: 'symbol-ancestry',
      sourceRef: 'src/resolve.ts', sourceRevision, workspaceRevision: 'sha256:workspace',
      qualifiedName: 'export_statement::function_declaration::resolve',
      signatureNormalized: null, producerRevision: 'test', packetKey: 'packet:ancestry',
      byteStart: 0, byteEnd: sourceBytes.byteLength, upstreamNodeId: 'native-node-ancestry',
    };
    const binding = {
      repoId: 'deeds-web-app', astRepoId: 'repo-uuid', canonicalSourceRef: symbol.sourceRef,
      sourceRevision, workspaceRevision: symbol.workspaceRevision, contentDigest: sourceRevision,
    };
    const evidence = {
      schema: 'atlas.ast.evidence.v1' as const, engine: 'treesitter-chunker', engine_version: '4.0.0',
      language: 'typescript', file_path: symbol.sourceRef, source_revision: sourceRevision,
      chunks: [{ upstream_node_id: 'native-node-ancestry', node_type: 'function_declaration', kind: 'function',
        name: 'resolve', parent_route: ['export_statement', 'function_declaration'],
        start_byte: 0, end_byte: sourceBytes.byteLength, start_line: 1, start_column: 0,
        end_line: 1, end_column: sourceBytes.byteLength, calls: [], imports: [], exports: [],
        signature_text: 'export function resolve() ',
        syntax_ancestry: [{ node_type: 'program', start_byte: 0, end_byte: sourceBytes.byteLength }] }],
      edges: [], diagnostics: [], syntax_status: 'CLEAN' as const,
    };
    const provider = createFunctionRegistrySidecarAstProviderV1({ astChunk: async () => evidence });

    const rows = await provider({ symbol, binding, sourceBytes });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.node.qualifiedSymbol).toBe(symbol.qualifiedName);
    expect(rows[0]?.astPath).toBe('program/function_declaration:resolve');
  });

  it('resolves source repository labels through the canonical repository identity owner', async () => {
    const query = vi.fn(async () => ({ rows: [{
      repo_id: 'deeds-web-app',
      ast_repo_id: 'repo-uuid',
      canonical_source_ref: 'src/resolve.ts',
      source_revision: 'sha256:source',
      workspace_revision: 'sha256:workspace',
      content_digest: 'sha256:source',
    }] }));
    const ports = createFunctionRegistryPostgresReadPortsV1(
      { query, release: () => undefined } as unknown as Parameters<typeof createFunctionRegistryPostgresReadPortsV1>[0],
      '/repo',
    );

    const bindings = await ports.getWorkspaceSourceBindings(
      'src/resolve.ts',
      'sha256:source',
      'sha256:workspace',
    );

    expect(bindings).toEqual([{
      repoId: 'deeds-web-app',
      astRepoId: 'repo-uuid',
      canonicalSourceRef: 'src/resolve.ts',
      sourceRevision: 'sha256:source',
      workspaceRevision: 'sha256:workspace',
      contentDigest: 'sha256:source',
    }]);
    expect(query.mock.calls[0]?.[0]).toContain('LEFT JOIN public.atlas_repository_identity ri');
    expect(query.mock.calls[0]?.[0]).toContain('ri.source_authority_repo_id = b.repo_id');
    expect(query.mock.calls[0]?.[1]).toEqual(['src/resolve.ts', 'sha256:source', 'sha256:workspace']);
  });

  it('resolves native AST identity by exact source tuple rather than upstream ID equality', async () => {
    const sourceBytes = Buffer.from('export function resolve() { return true; }', 'utf8');
    const sourceRevision = revision(sourceBytes);
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [{
        tree_node_id: 'native-tree-node-1',
        relative_path: 'src/resolve.ts',
        node_kind: 'function',
        qualified_symbol: 'resolve',
        parser_language: 'typescript',
        normalized_signature: 'resolve(): boolean',
        start_byte: 0,
        end_byte: sourceBytes.byteLength,
        source_content_hash: sourceRevision,
        source_revision: sourceRevision,
        repo_id: 'repo-uuid',
        parser_name: 'tree-sitter',
        parser_version: '1',
        grammar_version: '1',
        ast_path: ['program', 'function:resolve'],
      }] };
    });
    const ports = createFunctionRegistryPostgresReadPortsV1(
      { query, release: () => undefined } as unknown as Parameters<typeof createFunctionRegistryPostgresReadPortsV1>[0],
      '/repo',
    );
    const symbol: Parameters<typeof ports.getAstCandidates>[0] = {
      symbolVersionId: 'symbol-version-1',
      stableSymbolId: 'symbol-1',
      sourceRef: 'src/resolve.ts',
      sourceRevision,
      workspaceRevision: 'sha256:workspace',
      qualifiedName: 'resolve',
      upstreamNodeId: 'graphify-upstream-node-1',
      signatureNormalized: 'resolve(): boolean',
      producerRevision: 'test',
      packetKey: 'packet:1',
      byteStart: 0,
      byteEnd: sourceBytes.byteLength,
    };
    const binding: Parameters<typeof ports.getAstCandidates>[1] = {
      repoId: 'deeds-web-app',
      astRepoId: 'repo-uuid',
      canonicalSourceRef: symbol.sourceRef,
      sourceRevision,
      workspaceRevision: symbol.workspaceRevision,
      contentDigest: sourceRevision,
    };

    const result = await ports.getAstCandidates(symbol, binding, sourceBytes);

    expect(result).toHaveLength(1);
    expect(result[0]?.node.treeNodeId).toBe('native-tree-node-1');
    expect(calls[0]?.values).toEqual([
      'repo-uuid', 'src/resolve.ts', sourceRevision, sourceRevision, sourceRevision.slice('sha256:'.length),
      'resolve', 0, sourceBytes.byteLength,
      'deeds-web-app', symbol.workspaceRevision, symbol.sourceRef,
    ]);
    expect(calls[0]?.sql).toContain('n.qualified_symbol = $6');
    expect(calls[0]?.sql).toContain('n.start_byte = $7 AND n.end_byte = $8');
    expect(calls[0]?.sql).toContain('WHERE n.repo_id = $1');
    expect(calls[0]?.sql).not.toContain('JOIN public.code_repos cr ON cr.repo_id = n.repo_id');
    expect(calls[0]?.sql).toContain('JOIN path_rows p ON p.candidate_tree_node_id = c.tree_node_id');
    expect(calls[0]?.sql).not.toContain('n.tree_node_id = $1');
    expect(calls[0]?.sql).toContain('b.repo_id = $9 AND b.workspace_revision = $10');
    expect(calls[0]?.sql).toContain('AND (SELECT count(*) FROM source_paths) = 1');
    expect(calls[0]?.sql).toContain('AND EXISTS (SELECT 1 FROM source_paths WHERE canonical_source_ref = $11)');
    expect(result[0]?.pathBinding).toEqual({
      policy: 'ATLAS_AST_NODES_REPO_RELATIVE_LOWERCASE_V1',
      canonicalSourceRef: symbol.sourceRef,
      storedRelativePath: 'src/resolve.ts',
    });
  });

  it('reads only in-repository bytes matching the requested source digest', async () => {
    const root = await makeRoot();
    const source = Buffer.from('export function example() {}', 'utf8');
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'example.ts'), source);

    await expect(readFunctionRegistrySourceBytesV1(root, 'src/example.ts', revision(source)))
      .resolves.toEqual(source);
    await expect(readFunctionRegistrySourceBytesV1(root, '../outside.ts', revision(source)))
      .resolves.toBeNull();
    await expect(readFunctionRegistrySourceBytesV1(root, 'src/example.ts', `sha256:${'0'.repeat(64)}`))
      .resolves.toBeNull();
  });

  it('resolves callable-search hints through active canonical versions with exact workspace scope', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [
        { symbol_version_id: 'symbol-v1', source_revision: 'sha256:canonical-source', projection_source_revision: 'sha256:stale-source' },
        { symbol_version_id: '', source_revision: 'ignored' },
        { symbol_version_id: 'missing-revision', source_revision: null },
      ] };
    });
    const client = { query } as unknown as Parameters<typeof queryCallableSearchProjectionInReadOnlyTransactionV1>[0];

    await expect(queryCallableSearchProjectionInReadOnlyTransactionV1(client, {
      query: '  find parser  ',
      workspaceRevision: 'sha256:workspace',
      limit: 12,
    })).resolves.toEqual([{ symbolVersionId: 'symbol-v1', sourceRevision: 'sha256:canonical-source' }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(calls[0]?.values).toEqual(['find parser', 'sha256:workspace', 12]);
    expect(calls[0]?.sql).toContain('sv.workspace_revision = $2');
    expect(calls[0]?.sql).toContain('sv.symbol_version_id = c.symbol_version_id');
    expect(calls[0]?.sql).toContain("registry.status = 'active'");
    expect(calls[0]?.sql).toContain('SELECT sv.symbol_version_id, sv.source_revision');
    expect(calls[0]?.sql).not.toContain('WHERE c.workspace_revision = $2');
    expect(calls[0]?.sql).toContain('c.search_vector @@ q.tsquery');

    query.mockClear();
    await expect(queryCallableSearchProjectionInReadOnlyTransactionV1(client, {
      query: 'x', workspaceRevision: 'sha256:workspace', limit: 65,
    })).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects symlink escapes and oversized source files', async () => {
    const root = await makeRoot();
    const outside = await makeRoot();
    await writeFile(path.join(outside, 'outside.ts'), 'outside');
    await mkdir(path.join(root, 'src'));
    const link = path.join(root, 'src', 'linked.ts');
    let symlinkCreated = false;
    try {
      await symlink(path.join(outside, 'outside.ts'), link);
      symlinkCreated = true;
    } catch {
      symlinkCreated = false;
    }
    if (symlinkCreated) {
      const outsideBytes = Buffer.from('outside');
      await expect(readFunctionRegistrySourceBytesV1(root, 'src/linked.ts', revision(outsideBytes)))
        .resolves.toBeNull();
    }

    const largeBytes = Buffer.alloc(16 * 1024 * 1024 + 1, 1);
    await writeFile(path.join(root, 'src', 'large.ts'), largeBytes);
    await expect(readFunctionRegistrySourceBytesV1(root, 'src/large.ts', revision(largeBytes)))
      .resolves.toBeNull();
  });
});
