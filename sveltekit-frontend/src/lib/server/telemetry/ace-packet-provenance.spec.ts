import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query, legacyRecord } = vi.hoisted(() => ({ query: vi.fn(), legacyRecord: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('./retrieval-recorder.js', () => ({ recordRetrievalTelemetry: legacyRecord }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { NODE_ENV: 'test' } }));
import { extractPacketAndFeatureIds, recordACERetrievalTelemetry } from './ace-telemetry-emitter.js';
import { buildPacketCentricEvent } from './packet-centric-telemetry.js';

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  legacyRecord.mockReset().mockResolvedValue(undefined);
});

describe('ACE selection through existing packet telemetry writer', () => {
  it('keeps source, feature and SOM bound to the selected packet rather than other ranked rows', async () => {
    const candidates = [
      { feature_id: 'unkeyed-feature', som_cell: '9,9', source_ref: 'src/unkeyed.ts' },
      { packet_key: 'packet:first', source_ref: 'src/first.ts' },
      { packet_key: 'packet:second', feature_id: 'second-feature', som_cluster: '2,3', source_ref: 'src/second.ts' },
    ];
    const selected = extractPacketAndFeatureIds(candidates);
    const direct = buildPacketCentricEvent(candidates, 2, 'fusion');
    expect(selected.packetContext).toEqual(direct.packet_context);
    expect(selected.selectedFeatureId).toBeNull();
    expect(selected.packetContext).toMatchObject({ packet_id: 'packet:first', source_ref: 'src/first.ts', som_cell: null });
    await recordACERetrievalTelemetry({ query: 'fixture', latencyMs: 2, retrievalStrategy: 'fusion', ...selected });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(query.mock.calls[0][1][13]);
    expect(payload.packet_context).toMatchObject({ packet_id: 'packet:first', source_ref: 'src/first.ts', feature_id: null, som_cell: null });
    expect(payload.selected_packet_keys).toEqual(['packet:first', 'packet:second']);
    expect(legacyRecord.mock.calls[0][0].selectedPacketKeys).toEqual(['packet:first', 'packet:second']);
  });

  it('preserves selected-row SOM coordinates and does not enrich it from duplicate or later rows', async () => {
    const selected = extractPacketAndFeatureIds([
      { packet_key: 'packet:first', feature_id: 'feature:first', source_ref: 'src/first.ts', som_cell: '1,2', som_cluster: '8,8' },
      { packet_key: 'packet:first', source_ref: 'src/other.ts', som_cell: '7,7' },
      { packet_key: 'packet:second', feature_id: 'feature:second', som_cell: '3,4' },
    ]);
    expect(selected.selectedPacketKeys).toEqual(['packet:first', 'packet:second']);
    await recordACERetrievalTelemetry({ query: 'fixture', latencyMs: 2, retrievalStrategy: 'fusion', ...selected });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(JSON.parse(query.mock.calls[0][1][13]).packet_context).toMatchObject({
      packet_id: 'packet:first', feature_id: 'feature:first', source_ref: 'src/first.ts', som_cell: '1,2',
      embedding_version: null, gpu_kernel_version: null, rpc_transport: null,
    });
  });

  it('does not manufacture packet identity from feature-only or empty cohorts', () => {
    for (const candidates of [[], [{ feature_id: 'feature:only', som_cell: '1,1' }]]) {
      const selected = extractPacketAndFeatureIds(candidates);
      expect(selected.selectedPacketKey).toBeNull();
      expect(selected.selectedFeatureId).toBeNull();
      expect(selected.packetContext).toMatchObject({ packet_id: null, feature_id: null, som_cell: null, source_ref: null });
    }
  });
});
