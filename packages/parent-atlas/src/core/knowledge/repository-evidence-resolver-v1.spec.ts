import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAtlasEvidenceResourceV1 } from './evidence-resource-v1.js';
import { RepositoryEvidenceResolverV1 } from './repository-evidence-resolver-v1.js';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-knowledge-source-'));
  await mkdir(path.join(root, 'src'));
  const content = 'first\nsecond\nthird\n';
  await writeFile(path.join(root, 'src', 'a.ts'), content, 'utf8');
  const registry = {
    async lookupSource(sourceRef: string) {
      if (sourceRef !== 'src/a.ts') return null;
      return { sourceRef, sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', sourceInventoryRevision: 'inventory:r1', sourceContentChecksum: hash(content) };
    },
  };
  const resolver = new RepositoryEvidenceResolverV1({ repositoryRoot: root, workspaceRevision: 'workspace:r1', resolverRevision: 'knowledge-source-resolver:v1', sourceRegistry: registry });
  return { root, content, resolver };
}

describe('RepositoryEvidenceResolverV1', () => {
  it('binds exact repository bytes to the existing source registry authority', async () => {
    const { root, resolver } = await fixture();
    try {
      const resource = buildAtlasEvidenceResourceV1({ namespace: 'SOURCE', locator: 'src/a.ts', byteRange: null, lineRange: { startLine: 2, endLine: 2 } });
      const result = await resolver.resolve(resource);
      expect(result?.content).toBe('second\n');
      expect(result?.evidence.sourceRevision).toBe('source:r1');
      expect(result?.evidence.authorityRevision).toBe('inventory:r1');
      expect(result?.evidence.resolutionMethod).toBe('EXACT_SOURCE_REVISION');
      expect(result?.evidence.contentChecksum).toBe(hash('second\n'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects traversal and source-registry content drift', async () => {
    const { root, resolver } = await fixture();
    try {
      const traversal = buildAtlasEvidenceResourceV1({ namespace: 'SOURCE', locator: '../secret', byteRange: null, lineRange: null });
      await expect(resolver.resolve(traversal)).rejects.toThrow('SOURCE_REF_TRAVERSAL_REJECTED');
      await writeFile(path.join(root, 'src', 'a.ts'), 'changed\n', 'utf8');
      const resource = buildAtlasEvidenceResourceV1({ namespace: 'SOURCE', locator: 'src/a.ts', byteRange: null, lineRange: null });
      await expect(resolver.resolve(resource)).rejects.toThrow('SOURCE_REGISTRY_CONTENT_MISMATCH');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects symlink evidence when the host permits symlink creation', async () => {
    const { root, resolver } = await fixture();
    try {
      try {
        await symlink(path.join(root, 'src', 'a.ts'), path.join(root, 'src', 'link.ts'));
      } catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
        throw error;
      }
      const linkedRegistry = new RepositoryEvidenceResolverV1({
        repositoryRoot: root,
        workspaceRevision: 'workspace:r1',
        resolverRevision: 'knowledge-source-resolver:v1',
        sourceRegistry: { async lookupSource(sourceRef: string) { return { sourceRef, sourceRevision: 'source:r1', workspaceRevision: 'workspace:r1', sourceInventoryRevision: 'inventory:r1', sourceContentChecksum: hash('first\nsecond\nthird\n') }; } },
      });
      const resource = buildAtlasEvidenceResourceV1({ namespace: 'SOURCE', locator: 'src/link.ts', byteRange: null, lineRange: null });
      await expect(linkedRegistry.resolve(resource)).rejects.toThrow('SOURCE_SYMLINK_REJECTED');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
