// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSync, mockReadFileSync, mockReaddirSync, mockTracedQuery } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockTracedQuery: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('$lib/server/db/client.js', () => ({
  tracedQuery: mockTracedQuery,
}));

describe('getFeatureDocumentEvidence', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockExistsSync.mockImplementation((candidate: string) => {
      const normalized = candidate.replace(/\\/g, '/');
      return [
        '/docs/features/feature_example.md',
        '/docs/feature_example',
        '/docs/feature_example/manifest.json',
      ].some((suffix) => normalized.endsWith(suffix));
    });

    mockReadFileSync.mockImplementation((candidate: string) => {
      const normalized = candidate.replace(/\\/g, '/');
      if (normalized.endsWith('/docs/feature_example/manifest.json')) {
        return JSON.stringify({
          schemaVersion: 'feature-document-manifest.v2',
          featureId: 'feature.example',
          title: 'Feature Example',
          officialDocs: [
            {
              title: 'SvelteKit Load',
              url: 'https://kit.svelte.dev/docs/load',
              sourceType: 'official_docs',
              screenshotPaths: ['docs/feature_example/screenshot-1.png'],
              filePaths: ['docs/feature_example/reference.md'],
            },
          ],
          sources: [
            {
              sourceRef: 'src/routes/+page.svelte',
              sourceType: 'first_party_repository',
              authorityClass: 'first_party',
              localPath: 'src/routes/+page.svelte',
              title: 'Example implementation',
            },
          ],
        });
      }
      throw new Error(`Unexpected read: ${candidate}`);
    });

    mockReaddirSync.mockReturnValue([
      { name: 'screenshot-1.png', isFile: () => true },
      { name: 'reference.md', isFile: () => true },
      { name: 'manifest.json', isFile: () => true },
    ]);

    mockTracedQuery.mockImplementation(async (op: string) => {
      if (op.includes('parent_atlas_documents')) {
        return { rows: [{ count: 3 }] };
      }
      if (op.includes('atlas_feature_map')) {
        return { rows: [{ count: 2 }] };
      }
      return { rows: [{ count: 0 }] };
    });
  });

  it('builds an Atlas-linked evidence bundle from a valid feature docs manifest', async () => {
    const mod = await import('../../../src/lib/server/atlas/feature-document-evidence.js');
    const evidence = await mod.getFeatureDocumentEvidence('feature.example');

    expect(evidence.status).toBe('ATLAS_LINKED');
    expect(evidence.manifestValid).toBe(true);
    expect(evidence.counts.officialDocs).toBe(1);
    expect(evidence.counts.firstPartySources).toBe(1);
    expect(evidence.counts.screenshots).toBeGreaterThanOrEqual(1);
    expect(evidence.counts.files).toBeGreaterThanOrEqual(1);
    expect(evidence.counts.parentAtlasDocuments).toBe(3);
    expect(evidence.storage.qdrant.collection).toBe('documents');
    expect(evidence.warnings).not.toContain('official_docs_missing');
  });

  it('reports missing docs and spine rows when no feature bundle exists', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
    mockTracedQuery.mockResolvedValue({ rows: [{ count: 0 }] });

    const mod = await import('../../../src/lib/server/atlas/feature-document-evidence.js');
    const evidence = await mod.getFeatureDocumentEvidence('feature.missing');

    expect(evidence.status).toBe('DOCS_PENDING');
    expect(evidence.manifestPath).toBeNull();
    expect(evidence.counts.parentAtlasDocuments).toBe(0);
    expect(evidence.warnings).toContain('feature_note_missing');
    expect(evidence.warnings).toContain('official_docs_missing');
    expect(evidence.warnings).toContain('authoritative_sources_missing');
    expect(evidence.nextActions).toContain('add manifest sources for first-party repository evidence or official documentation URLs');
  });

  it('degrades cleanly when atlas_feature_map is missing at runtime', async () => {
    mockTracedQuery.mockImplementation(async (op: string) => {
      if (op.includes('parent_atlas_documents')) {
        return { rows: [{ count: 1 }] };
      }
      if (op.includes('atlas_feature_map')) {
        throw new Error('relation "atlas_feature_map" does not exist');
      }
      return { rows: [{ count: 0 }] };
    });

    const mod = await import('../../../src/lib/server/atlas/feature-document-evidence.js');
    const evidence = await mod.getFeatureDocumentEvidence('feature.example');

    expect(evidence.status).toBe('ATLAS_LINKED');
    expect(evidence.counts.parentAtlasDocuments).toBe(1);
    expect(evidence.counts.atlasFeatureMapRows).toBe(0);
    expect(evidence.warnings).toContain('atlas_feature_map_missing');
  });
});
