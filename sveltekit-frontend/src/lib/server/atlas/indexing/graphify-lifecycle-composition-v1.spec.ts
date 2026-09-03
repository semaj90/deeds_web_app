import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRevisionRecordV1, WorkspaceSourceBindingV1 } from '../identity/workspace-source-binding-v1.js';
import { createGraphifyLifecycleWriterDepsV1, runGraphifyLifecycleCompositionV1 } from './graphify-lifecycle-composition-v1.js';

const record = { workspaceRevision: 'sha256:workspace', repositoryId: 'repo' } as WorkspaceRevisionRecordV1;
const bindings = [{ sourceRef: 'src/a.ts', sourceRevision: 'sha256:source' }] as WorkspaceSourceBindingV1[];

describe('runGraphifyLifecycleCompositionV1', () => {
  it('constructs an explicit writer adapter without invoking any owner', () => {
    const client = { query: vi.fn() };
    const fanout = vi.fn();
    const deps = createGraphifyLifecycleWriterDepsV1({
      client,
      workspaceId: '11111111-1111-4111-8111-111111111111',
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
      fanout,
    });

    expect(Object.keys(deps).sort()).toEqual(['close', 'fanout', 'open']);
    expect(typeof deps.open).toBe('function');
    expect(deps.fanout).toBe(fanout);
    expect(typeof deps.close).toBe('function');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('opens, propagates the exact run id through fanout, then closes it', async () => {
    const events: string[] = [];
    const deps = {
      open: vi.fn(async (input: { record: WorkspaceRevisionRecordV1; bindings: readonly WorkspaceSourceBindingV1[] }) => {
        expect(input.record.workspaceRevision).toBe(record.workspaceRevision);
        expect(input.bindings).toEqual(bindings);
        events.push('open');
        return { runId: 'run-1', status: 'RUNNING' };
      }),
      fanout: vi.fn(async ({ runId, record: fanoutRecord }: { runId: string; record: WorkspaceRevisionRecordV1 }) => {
        expect(fanoutRecord).toBe(record);
        events.push(`fanout:${runId}`);
        return { status: 'SUCCEEDED' };
      }),
      close: vi.fn(async ({ runId }: { runId: string }) => { events.push(`close:${runId}`); return { status: 'COMPLETED' }; }),
    };

    const result = await runGraphifyLifecycleCompositionV1({ record, bindings, deps });
    expect(events).toEqual(['open', 'fanout:run-1', 'close:run-1']);
    expect(deps.close).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(result.close).toEqual({ status: 'COMPLETED' });
  });

  it('does not close when fanout fails', async () => {
    const close = vi.fn();
    const deps = {
      open: async () => ({ runId: 'run-2', status: 'RUNNING' }),
      fanout: async () => { throw new Error('FANOUT_FAILED'); },
      close,
    };

    await expect(runGraphifyLifecycleCompositionV1({ record, bindings, deps })).rejects.toThrow('FANOUT_FAILED');
    expect(close).not.toHaveBeenCalled();
  });

  it('fails closed when the opener returns no run id', async () => {
    const fanout = vi.fn();
    const close = vi.fn();
    const deps = {
      open: async () => ({ runId: '', status: 'RUNNING' }),
      fanout,
      close,
    };

    await expect(runGraphifyLifecycleCompositionV1({ record, bindings, deps }))
      .rejects.toThrow('GRAPHIFY_LIFECYCLE_OPEN_MISSING_RUN_ID');
    expect(fanout).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
