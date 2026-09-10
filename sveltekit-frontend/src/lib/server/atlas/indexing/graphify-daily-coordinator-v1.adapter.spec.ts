import { describe, expect, it } from 'vitest';
import {
  adaptWorkspaceBindingsToSourceSelectionV1,
  recordRepositoryQualifiedSourceMembershipV2,
  recordInventoryStage,
  recordStructuralStage,
  recordDownstreamStage,
} from './graphify-daily-coordinator-v1.js';

const revision = `sha256:${'a'.repeat(64)}`;
const content = `sha256:${'b'.repeat(64)}`;
const manifestChecksum = `sha256:${'c'.repeat(64)}`;

function binding(sourceRef: string, sourceRevision = content) {
  return {
    schema: 'atlas.workspace-source-binding.v1' as const,
    workspaceRevision: revision,
    sourceRef,
    sourceRevision,
    contentDigest: sourceRevision.slice('sha256:'.length),
    byteLength: 12,
    gitObjectFormat: 'sha1' as const,
    baseCommitOid: '1'.repeat(40),
    gitBlobOid: null,
    trackedAtBaseCommit: true,
    dirtyRelativeToBaseCommit: false,
    sourceManifestOrdinal: 0,
    readOnlyObservation: true as const,
    producerRevision: 'fixture-v1',
    canonicalAuthority: false as const,
    checksum: manifestChecksum.slice('sha256:'.length),
  };
}

describe('adaptWorkspaceBindingsToSourceSelectionV1', () => {
  it('writes repository-qualified membership through the v2 owner only', async () => {
    const queries: string[] = [];
    const client = { query: async (text: string) => { queries.push(text); return { rowCount: 1, rows: [] }; } };
    const receipt = await recordRepositoryQualifiedSourceMembershipV2(
      client,
      '00000000-0000-4000-8000-000000000001',
      revision,
      [{
        repositoryId: 'repo:turbovec',
        repositoryRelativePath: 'src/index.ts',
        sourceRef: 'src/index.ts',
        codeSourceRevision: content,
        contentHash: content.slice('sha256:'.length),
        byteLength: 12,
      }],
    );
    expect(receipt.sourceCount).toBe(1);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('graphify_execution_file_membership_v2');
    expect(queries[0]).not.toContain('graphify_execution_files');
  });

  it('maps exact workspace bindings without adding legacy identity', () => {
    expect(adaptWorkspaceBindingsToSourceSelectionV1(revision, [binding('src/a.ts')])).toEqual([
      {
        sourceRef: 'src/a.ts',
        codeSourceRevision: content,
        contentHash: content.slice('sha256:'.length),
        byteLength: 12,
      },
    ]);
  });

  it('rejects a binding from another workspace revision', () => {
    expect(() =>
      adaptWorkspaceBindingsToSourceSelectionV1(revision, [
        { ...binding('src/a.ts'), workspaceRevision: `sha256:${'d'.repeat(64)}` },
      ]),
    ).toThrow('GRAPHIFY_COORDINATOR_ADAPTER_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects duplicate source references before database insertion', () => {
    expect(() =>
      adaptWorkspaceBindingsToSourceSelectionV1(revision, [binding('src/a.ts'), binding('src/a.ts')]),
    ).toThrow('GRAPHIFY_COORDINATOR_ADAPTER_DUPLICATE_SOURCE_REF');
  });

  it('records inventory checksums without issuing a legacy graphify_files query', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        return { rowCount: text.startsWith('UPDATE') ? 1 : 0, rows: [] };
      },
    };
    const receipt = await recordInventoryStage(client, '00000000-0000-4000-8000-000000000001', {
      inputChecksum: revision,
      outputChecksum: content,
      receiptRef: 'docs/reports/inventory-v1.json',
    });
    expect(receipt.outputChecksum).toBe(content);
    expect(queries).toHaveLength(2);
    expect(queries.join('\n')).not.toContain('graphify_files');
  });

  it('allow-lists structural stages and chains their receipt checksums', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        return { rowCount: text.startsWith('UPDATE') ? 1 : 0, rows: [] };
      },
    };
    const receipt = await recordStructuralStage(
      client,
      '00000000-0000-4000-8000-000000000001',
      'STRUCTURAL_EXTRACT',
      { inputChecksum: revision, outputChecksum: content },
    );
    expect(receipt.inputChecksum).toBe(revision);
    expect(queries).toHaveLength(2);
    expect(queries.join('\n')).not.toContain('graphify_files');
    await expect(recordStructuralStage(
      client,
      '00000000-0000-4000-8000-000000000001',
      'GRAPH_BUILD' as never,
      { inputChecksum: revision, outputChecksum: content },
    )).rejects.toThrow();
  });

  it('allow-lists the four downstream stages and chains their receipt checksums (seam only -- no owner bound)', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        return { rowCount: text.startsWith('UPDATE') ? 1 : 0, rows: [] };
      },
    };
    for (const stage of ['SEMANTIC_ENRICH', 'GRAPH_BUILD', 'PROJECT', 'VALIDATE'] as const) {
      queries.length = 0;
      const receipt = await recordDownstreamStage(
        client,
        '00000000-0000-4000-8000-000000000001',
        stage,
        { inputChecksum: revision, outputChecksum: content },
      );
      expect(receipt.inputChecksum).toBe(revision);
      expect(queries).toHaveLength(2);
      expect(queries.join('\n')).not.toContain('graphify_files');
    }
    await expect(recordDownstreamStage(
      client,
      '00000000-0000-4000-8000-000000000001',
      'AST_PARSE' as never,
      { inputChecksum: revision, outputChecksum: content },
    )).rejects.toThrow();
    await expect(recordDownstreamStage(
      client,
      '00000000-0000-4000-8000-000000000001',
      'INVENTORY' as never,
      { inputChecksum: revision, outputChecksum: content },
    )).rejects.toThrow();
  });

  it('rejects a downstream-stage readback that finds no matching RUNNING row', async () => {
    const client = {
      query: async (text: string) => ({ rowCount: text.startsWith('UPDATE') ? 0 : 1, rows: [] }),
    };
    await expect(recordDownstreamStage(
      client,
      '00000000-0000-4000-8000-000000000001',
      'VALIDATE',
      { inputChecksum: revision, outputChecksum: content },
    )).rejects.toThrow('GRAPHIFY_COORDINATOR_VALIDATE_STAGE_READBACK_FAILED');
  });
});
