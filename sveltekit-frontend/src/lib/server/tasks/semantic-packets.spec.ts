// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: { execute: mockExecute },
  pgRows: (result: unknown) => (Array.isArray((result as { rows?: unknown[] }).rows)
    ? (result as { rows: unknown[] }).rows
    : (Array.isArray(result) ? result : [])),
}));

vi.mock('$lib/server/vector/qdrant-manager', () => ({
  qdrant: { upsert: vi.fn(), collections: { codebase_chunks: 'codebase_chunks' } },
  sha256ToUuid: vi.fn((value: string) => value),
}));

vi.mock('$lib/server/redis', () => ({
  getRedis: vi.fn(),
  getJson: vi.fn(),
  setJsonWithTtl: vi.fn(),
}));

vi.mock('$lib/server/ollama', () => ({ callOllamaChat: vi.fn() }));
vi.mock('$lib/server/grpc/embedding-client', () => ({ generateEmbeddings: vi.fn() }));
vi.mock('$lib/server/observability/langfuse', () => ({ traceSpan: (_name: string, fn: () => unknown) => fn() }));
vi.mock('$lib/server/config/vector-config.js', () => ({ buildVectorPayload: vi.fn() }));
vi.mock('$lib/server/atlas/identity/packet-key-builder.js', () => ({ computePacketKey: vi.fn() }));

// TASK-SEMANTIC-PACKET-COMPATIBILITY-01 step 2 (2026-09-08): the given smoke_command
// (semantic-packet-writer.spec.ts) tests a different, unrelated module
// (persistCanonicalSemanticPacketEmbedding writing to atlas_packets) -- it does not exercise
// assertTaskSemanticPacketSchemaCompatible() at all. This file closes that gap directly.
describe('assertTaskSemanticPacketSchemaCompatible', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  const REQUIRED_COLUMNS = [
    'point_kind', 'qdrant_point_id', 'workspace_id', 'workspace_task_id',
    'feature_id', 'alias_id', 'source_ref', 'file_path', 'semantic_path',
    'related_feature_ids', 'related_task_ids', 'related_file_paths', 'cluster_id',
    'centroid_id', 'parent_centroid_id', 'summary_llm', 'summary_model',
    'next_action', 'summary_hash', 'confidence', 'status', 'agent_pickup_ready',
    'observed_at', 'valid_from', 'valid_to', 'created_at', 'updated_at', 'deleted',
  ];

  it('resolves cleanly when every required column is present live', async () => {
    mockExecute.mockResolvedValue({ rows: REQUIRED_COLUMNS.map((column_name) => ({ column_name })) });
    const { assertTaskSemanticPacketSchemaCompatible } = await import('./semantic-packets.js');
    await expect(assertTaskSemanticPacketSchemaCompatible()).resolves.toBeUndefined();
  });

  it('throws TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE naming every missing column, before any write', async () => {
    // Deliberately uses a minimal legacy-shaped fixture; it must not encode the current
    // production catalog's column count. None of the columns the real INSERT needs are present.
    const liveColumns = [
      'id', 'packet_key', 'source_ref', 'feature_id', 'feature_label', 'alias_id',
      'qdrant_score', 'cluster_score', 'topological_score', 'fusion_score', 'metadata',
      'semantic_vector', 'validation_status', 'error_message', 'created_at', 'updated_at',
    ];
    mockExecute.mockResolvedValue({ rows: liveColumns.map((column_name) => ({ column_name })) });
    const { assertTaskSemanticPacketSchemaCompatible } = await import('./semantic-packets.js');

    await expect(assertTaskSemanticPacketSchemaCompatible()).rejects.toThrow(
      /TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE/,
    );
    await expect(assertTaskSemanticPacketSchemaCompatible()).rejects.toThrow(/point_kind/);
    await expect(assertTaskSemanticPacketSchemaCompatible()).rejects.toThrow(/qdrant_point_id/);
  });

  it('createTaskSemanticPacket rejects before loading the task row when schema is incompatible', async () => {
    mockExecute.mockResolvedValue({ rows: [{ column_name: 'id' }] });
    const { createTaskSemanticPacket } = await import('./semantic-packets.js');

    await expect(createTaskSemanticPacket(1)).rejects.toThrow(/TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE/);
    // Only the schema-compatibility SELECT should have run -- no task-row load, no Qdrant
    // upsert, no INSERT attempt reached.
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe('assertCanonicalSemantic768Vector', () => {
  it('accepts exactly 768 finite values', async () => {
    const { assertCanonicalSemantic768Vector } = await import('./semantic-packets.js');
    expect(() => assertCanonicalSemantic768Vector(new Array(768).fill(0.25))).not.toThrow();
  });

  it('rejects legacy dimensions and non-finite values', async () => {
    const { assertCanonicalSemantic768Vector } = await import('./semantic-packets.js');
    expect(() => assertCanonicalSemantic768Vector(new Array(384).fill(0))).toThrow(/semantic_768/);
    expect(() => assertCanonicalSemantic768Vector([...new Array(767).fill(0), Number.NaN])).toThrow(/semantic_768/);
  });
});
