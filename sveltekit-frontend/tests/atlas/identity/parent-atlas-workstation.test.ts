// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTracedQuery, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockTracedQuery: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('$lib/server/db/client.js', () => ({
  tracedQuery: mockTracedQuery,
}));

describe('getParentAtlasWorkstationSnapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);

    const tableCounts: Record<string, number> = {
      atlas_packets: 120,
      atlas_packet_registry: 120,
      atlas_summary_layers: 80,
      parent_atlas_documents: 300,
      atlas_feature_envelopes: 40,
    };

    mockTracedQuery.mockImplementation(async (_op: string, sqlText: string, params: unknown[]) => {
      if (sqlText.includes('to_regclass')) {
        return { rows: [{ exists: true }] };
      }
      if (sqlText.includes('count(*)::bigint AS count')) {
        const match = sqlText.match(/FROM\s+([a-z_]+)/i);
        return { rows: [{ count: tableCounts[match?.[1] ?? 'atlas_packets'] ?? 0 }] };
      }
      if (sqlText.includes('WHERE summary IS NOT NULL')) {
        return { rows: [{ value: 110 }] };
      }
      if (sqlText.includes('COALESCE(summary, summary_text')) {
        return { rows: [{ value: 75 }] };
      }
      if (sqlText.includes('LEFT JOIN atlas_packet_registry')) {
        return { rows: [{ value: 0 }] };
      }
      return { rows: [] };
    });
  });

  it('reports a ready canonical spine and mirror refresh next commands', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        cuda: { simdjsonVendorExists: true, nodeAddonExists: true },
        seeds: { exists: true, stale: false },
      })
    );

    const mod = await import('../../../src/lib/server/atlas/parent-atlas-workstation.js');
    const snapshot = await mod.getParentAtlasWorkstationSnapshot();

    expect(snapshot.status.canonicalSpine).toBe('READY');
    expect(snapshot.status.summaries).toBe('STARTED');
    expect(snapshot.status.mirrors).toBe('READY_FOR_MIRROR_REFRESH');
    expect(snapshot.laneHealth.simdjsonVendorExists).toBe(true);
    expect(snapshot.nextCommands).toContain('npm run atlas:qdrant:parity');
  });
});
