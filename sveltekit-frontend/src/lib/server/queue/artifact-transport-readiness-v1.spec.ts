import { describe, expect, it } from 'vitest';

import {
  assertArtifactTransportReady,
  inspectArtifactTransportReadiness,
} from './artifact-transport-readiness-v1.js';

type ExecuteResult = { rows: unknown[] };

type FakeExecutor = {
  execute: (query: unknown) => Promise<ExecuteResult>;
};

function sequenceExecutor(results: ExecuteResult[]): FakeExecutor {
  let index = 0;
  return {
    async execute() {
      const result = results[index++];
      if (!result) throw new Error(`Unexpected execute call ${index}`);
      return result;
    },
  };
}

const readyColumns = [
  ['artifact_id', 'text'],
  ['artifact_hash', 'text'],
  ['schema_id', 'text'],
  ['checksum', 'text'],
  ['revision_set_hash', 'text'],
  ['revisions', 'jsonb'],
  ['payload', 'jsonb'],
  ['payload_byte_length', 'integer'],
  ['created_at', 'timestamp with time zone'],
].map(([column_name, data_type]) => ({ column_name, data_type, is_nullable: 'NO' as const }));

const readyConstraints = [
  { constraint_type: 'PRIMARY KEY' as const, column_name: 'artifact_id' },
  { constraint_type: 'UNIQUE' as const, column_name: 'artifact_hash' },
];

describe('artifact transport readiness', () => {
  it('fails closed when the manual migration table is absent', async () => {
    const executor = sequenceExecutor([{ rows: [{ table_name: null }] }]);

    const readiness = await inspectArtifactTransportReadiness(executor as never);

    expect(readiness.status).toBe('TABLE_MISSING');
    expect(readiness.ready).toBe(false);
    expect(readiness.missingColumns).toContain('artifact_id');
    expect(readiness.primaryKeyProven).toBe(false);
  });

  it('proves readiness only when columns and identity constraints match', async () => {
    const executor = sequenceExecutor([
      { rows: [{ table_name: 'workflow_artifacts' }] },
      { rows: readyColumns },
      { rows: readyConstraints },
    ]);

    const readiness = await inspectArtifactTransportReadiness(executor as never);

    expect(readiness).toMatchObject({
      status: 'READY',
      ready: true,
      missingColumns: [],
      incompatibleColumns: [],
      primaryKeyProven: true,
      artifactHashUniqueProven: true,
    });
  });

  it('rejects a schema that looks present but weakens immutable identity', async () => {
    const executor = sequenceExecutor([
      { rows: [{ table_name: 'workflow_artifacts' }] },
      {
        rows: readyColumns.map((row) =>
          row.column_name === 'artifact_hash' ? { ...row, is_nullable: 'YES' as const } : row,
        ),
      },
      { rows: [{ constraint_type: 'PRIMARY KEY', column_name: 'artifact_id' }] },
    ]);

    const readiness = await inspectArtifactTransportReadiness(executor as never);

    expect(readiness.status).toBe('SCHEMA_MISMATCH');
    expect(readiness.ready).toBe(false);
    expect(readiness.incompatibleColumns[0]).toContain('artifact_hash');
    expect(readiness.artifactHashUniqueProven).toBe(false);
  });

  it('assertion emits an explicit deployment-gate error', async () => {
    const executor = sequenceExecutor([{ rows: [{ table_name: null }] }]);

    await expect(assertArtifactTransportReady(executor as never)).rejects.toThrow(
      /ARTIFACT_TRANSPORT_STORE_NOT_READY:TABLE_MISSING/,
    );
  });
});
