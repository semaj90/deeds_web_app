import { describe, expect, it } from 'vitest';
import { createAtlasRuntimeContext } from './atlas-runtime-context.js';
import { buildContextFromGo, retrieveFromGo, validatePacketFromGo } from './go-retrieval-grpc-client.js';

const runtime = createAtlasRuntimeContext({
  runId: 'run',
  threadId: 'thread',
  resourceId: 'resource',
  workspaceId: 'workspace',
  packetKey: 'packet',
});

describe('Go retrieval revision admission', () => {
  it('rejects retrieval before client creation', async () => {
    await expect(retrieveFromGo(runtime, 'query')).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('rejects context assembly before client creation', async () => {
    await expect(buildContextFromGo(runtime, ['packet'])).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('rejects packet validation before client creation', async () => {
    await expect(validatePacketFromGo(runtime, 'packet', {})).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });
});
