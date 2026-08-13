import { describe, expect, it } from 'vitest';
import { buildSummarySection, composeCard } from './section-builders.js';
import type { RegenContext } from './loaders/types.js';

function makeContext(overrides: Partial<RegenContext> = {}): RegenContext {
  const emptyMap = new Map<string, never>();
  return {
    runStartedAt: '2026-08-13T00:00:00.000Z',
    graph: {
      createdAt: '2026-08-13T00:00:00.000Z',
      repoRoot: 'C:/repo',
      files: new Map(),
      directories: new Map(),
      fileCount: 0,
      dirCount: 0,
    },
    karpathy: { scores: new Map(), loadedAt: '2026-08-13T00:00:00.000Z', entryCount: 0, source: 'test' },
    clusters: { summaries: new Map(), loadedAt: '2026-08-13T00:00:00.000Z', entryCount: 0, source: 'test' },
    clusterPackets: { packets: new Map(), loadedAt: '2026-08-13T00:00:00.000Z', entryCount: 0, source: 'test' },
    features: { features: [], byDir: new Map(), loadedAt: '2026-08-13T00:00:00.000Z', source: 'test' },
    activity: { byDir: new Map(), loadedAt: '2026-08-13T00:00:00.000Z', rowsScanned: 0, source: 'test' },
    pathAliases: { aliases: new Map([['$lib', 'src/lib']]), loadedAt: '2026-08-13T00:00:00.000Z', source: 'test' },
    diagnostics: {
      loaderResults: {
        graph: { ok: true, durationMs: 0 },
        karpathyScores: { ok: true, durationMs: 0 },
        clusterSummaries: { ok: true, durationMs: 0 },
        clusterPackets: { ok: true, durationMs: 0 },
        features: { ok: true, durationMs: 0 },
        activity: { ok: true, durationMs: 0 },
        pathAliases: { ok: true, durationMs: 0 },
      },
      totalDurationMs: 0,
      warnings: [],
    },
    ...overrides,
  };
}

describe('buildSummarySection', () => {
  it('prefers canonical cluster packet summary over prose cluster summary', () => {
    const ctx = makeContext({
      graph: {
        createdAt: '2026-08-13T00:00:00.000Z',
        repoRoot: 'C:/repo',
        files: new Map(),
        directories: new Map([
          ['src/app', { rel: 'src/app', fileCount: 2, clusterKey: '0' } as never],
        ]),
        fileCount: 0,
        dirCount: 0,
      },
      clusters: {
        summaries: new Map([['0', 'legacy prose summary']]),
        loadedAt: '2026-08-13T00:00:00.000Z',
        entryCount: 1,
        source: 'test',
      },
      clusterPackets: {
        packets: new Map([
          ['0', {
            clusterSummaryKey: '0',
            packetKey: 'sha256:abc',
            packetId: 'sha256:abc',
            clusterId: 0,
            summary: 'canonical packet summary',
            topFiles: ['src/a.ts'],
            pageRankTop5: [],
            authorityScore: null,
            workspaceRevision: 1,
            sourceRevision: 'src-rev',
            graphRevision: 'graph-rev',
            representationId: 'semantic_768',
            representationRevision: 1,
            centroidKey: 'gpu:autoencoder:centroids_64',
            canonicalHash: 'hash',
            createdAt: '2026-08-13T00:00:00.000Z',
            source: 'postgres',
          }],
        ]),
        loadedAt: '2026-08-13T00:00:00.000Z',
        entryCount: 1,
        source: 'test',
      },
    });

    expect(buildSummarySection('src/app', ctx)).toEqual({
      summary: 'canonical packet summary',
    });
  });

  it('surfaces cluster packet metadata on the composed card', () => {
    const ctx = makeContext({
      graph: {
        createdAt: '2026-08-13T00:00:00.000Z',
        repoRoot: 'C:/repo',
        files: new Map(),
        directories: new Map([
          ['src/app', { rel: 'src/app', fileCount: 2, clusterKey: '0' } as never],
        ]),
        fileCount: 0,
        dirCount: 0,
      },
      clusterPackets: {
        packets: new Map([
          ['0', {
            clusterSummaryKey: 'cluster:summary:0',
            packetKey: 'sha256:abc',
            packetId: 'sha256:abc',
            clusterId: 0,
            summary: 'canonical packet summary',
            topFiles: ['src/a.ts', 'src/b.ts'],
            pageRankTop5: [
              { filePath: 'src/a.ts', pageRank: 0.9, karpathyBlend: 0.7 },
            ],
            authorityScore: 0.91,
            workspaceRevision: 1,
            sourceRevision: 'src-rev',
            graphRevision: 'graph-rev',
            representationId: 'semantic_768',
            representationRevision: 1,
            centroidKey: 'gpu:autoencoder:centroids_64',
            canonicalHash: 'hash',
            createdAt: '2026-08-13T00:00:00.000Z',
            source: 'postgres',
          }],
        ]),
        loadedAt: '2026-08-13T00:00:00.000Z',
        entryCount: 1,
        source: 'test',
      },
    });

    const { card } = composeCard('src/app', ctx);

    expect(card.clusterPacket).toEqual({
      packetKey: 'sha256:abc',
      clusterSummaryKey: 'cluster:summary:0',
      summary: 'canonical packet summary',
      topFiles: ['src/a.ts', 'src/b.ts'],
      authorityScore: 0.91,
      pageRankTop5: [
        { filePath: 'src/a.ts', pageRank: 0.9, karpathyBlend: 0.7 },
      ],
      representationId: 'semantic_768',
      representationRevision: 1,
      centroidKey: 'gpu:autoencoder:centroids_64',
      graphRevision: 'graph-rev',
    });
  });
});
