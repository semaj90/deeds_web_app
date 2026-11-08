import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = { row: null as Record<string, unknown> | null, bytes: null as Uint8Array | null };
  return {
    store,
    put: vi.fn(async ({ bytes }: { bytes: Uint8Array }) => { store.bytes = new Uint8Array(bytes); }),
    head: vi.fn(async () => ({ contentLength: store.bytes?.byteLength ?? 0, contentType: 'model/gltf-binary' })),
    get: vi.fn(async () => new Uint8Array(store.bytes ?? [])),
    assertArtifactBucket: vi.fn(),
    onConflictDoNothing: vi.fn(async () => undefined),
    limit: vi.fn(async () => store.row ? [store.row] : []),
    where: vi.fn(),
    from: vi.fn(),
    values: vi.fn(),
    insert: vi.fn(),
    select: vi.fn()
  };
});

mocks.where.mockReturnValue({ limit: mocks.limit });
mocks.from.mockReturnValue({ where: mocks.where });
mocks.values.mockImplementation((row: Record<string, unknown>) => {
  mocks.store.row = { assetId: '44444444-4444-4444-8444-444444444444', ...row };
  return { onConflictDoNothing: mocks.onConflictDoNothing };
});
mocks.insert.mockReturnValue({ values: mocks.values });
mocks.select.mockReturnValue({ from: mocks.from });

vi.mock('$lib/server/db/client.js', () => ({ db: { insert: mocks.insert, select: mocks.select } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ assertArtifactBucket: mocks.assertArtifactBucket }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ putFileToSeaweed: mocks.put, headFileInSeaweed: mocks.head, getFileFromSeaweed: mocks.get }));

import { storeSceneGlbV1 } from './scene-assets-v1.js';

function glbV2(): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';

describe('scene GLB storage contract with isolated adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.row = null;
    mocks.store.bytes = null;
    mocks.put.mockImplementation(async ({ bytes }: { bytes: Uint8Array }) => { mocks.store.bytes = new Uint8Array(bytes); });
    mocks.get.mockImplementation(async () => new Uint8Array(mocks.store.bytes ?? []));
    mocks.head.mockImplementation(async () => ({ contentLength: mocks.store.bytes?.byteLength ?? 0, contentType: 'model/gltf-binary' }));
    mocks.limit.mockImplementation(async () => mocks.store.row ? [mocks.store.row] : []);
  });

  it('stores under the configured bucket and returns registry data only after exact readback', async () => {
    const bytes = glbV2();
    const result = await storeSceneGlbV1({ caseId, sceneId, actorId: 7, body: new Response(bytes).body, contentLength: String(bytes.byteLength) });
    expect(mocks.assertArtifactBucket).toHaveBeenCalledWith('atlas-artifacts');
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'atlas-artifacts', objectKey: expect.stringMatching(new RegExp(`^scene-assets/${caseId}/${sceneId}/sha256/[a-f0-9]{64}\\.glb$`)), bytes
    }));
    expect(mocks.head).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.timingsMs).toEqual(expect.objectContaining({
      requestReadAndHash: expect.any(Number),
      seaweedPut: expect.any(Number),
      seaweedHead: expect.any(Number),
      seaweedGetAndVerify: expect.any(Number),
      postgresRegisterAndReadback: expect.any(Number)
    }));
  });

  it('rejects a declared-length mismatch before any SeaweedFS or database call', async () => {
    const bytes = glbV2();
    await expect(storeSceneGlbV1({ caseId, sceneId, actorId: 7, body: new Response(bytes).body, contentLength: String(bytes.byteLength + 1) }))
      .rejects.toThrow('SCENE_ASSET_LENGTH_MISMATCH');
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not register data when object readback differs', async () => {
    mocks.get.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    await expect(storeSceneGlbV1({ caseId, sceneId, actorId: 7, body: new Response(glbV2()).body })).rejects.toThrow('SCENE_ASSET_SHA256_READBACK_MISMATCH');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
