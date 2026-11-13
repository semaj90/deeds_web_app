// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const EV_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const PARENT = `sha256:${'a'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  getAuthorizedCase: vi.fn(),
  saveRevision: vi.fn(),
  createPorts: vi.fn(async () => ({ ports: true })),
}));

vi.mock('$lib/server/db/client', () => ({ db: {} }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ evidence: {}, evidenceVersions: {} }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), desc: vi.fn(), sql: vi.fn() }));
vi.mock('$lib/server/features/evidence/index.js', () => ({ createEvidenceVersion: vi.fn() }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v) }));
vi.mock('$lib/server/middleware/cache-headers.js', () => ({ cacheControl: vi.fn() }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/features/evidence/evidence-revision-v1.js', async (orig) => {
  const real = await orig<typeof import('$lib/server/features/evidence/evidence-revision-v1.js')>();
  return { ...real, saveEvidenceMarkupRevisionV1: mocks.saveRevision, createDrizzleRevisionPortsV1: mocks.createPorts };
});

import { POST } from './+server.js';
import { EvidenceRevisionErrorV1 } from '$lib/server/features/evidence/evidence-revision-v1.js';

const png = () => new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)])], 'm.png', { type: 'image/png' });
const markupJson = JSON.stringify({ schemaVersion: 'evidence-markup-v1', notes: '', items: [] });

function req(over: { fields?: Record<string, string | File | null>; user?: { id: string } | null; id?: string } = {}) {
  const fd = new FormData();
  const fields: Record<string, string | File | null> = { caseId: CASE_ID, parentSha256: PARENT, markupJson, flattenedImage: png(), ...over.fields };
  for (const [k, v] of Object.entries(fields)) if (v !== null) fd.set(k, v as string | Blob);
  return {
    params: { id: over.id ?? EV_ID },
    locals: { user: over.user === undefined ? { id: '7' } : over.user },
    request: new Request('http://localhost/api/evidence/x/versions', { method: 'POST', body: fd }),
  } as never;
}
const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe('POST /api/evidence/[id]/versions (multipart markup revision)', () => {
  beforeEach(() => {
    mocks.getAuthorizedCase.mockReset().mockResolvedValue({ id: CASE_ID });
    mocks.saveRevision.mockReset().mockResolvedValue({ committed: true, idempotent: false, versionId: 'v1', version: 2, index: { status: 'not_requested' } });
  });

  it('401 without a user or with a non-numeric user id, 400 for a bad evidence id', async () => {
    expect((await POST(req({ user: null }))).status).toBe(401);
    expect((await POST(req({ user: { id: 'abc' } }))).status).toBe(401);
    expect((await POST(req({ id: 'not-a-uuid' }))).status).toBe(400);
    expect(mocks.saveRevision).not.toHaveBeenCalled();
  });

  it('400 for a missing image, a bad case id or invalid markup JSON, before any case lookup', async () => {
    expect((await POST(req({ fields: { flattenedImage: null } }))).status).toBe(400);
    expect((await POST(req({ fields: { caseId: 'nope' } }))).status).toBe(400);
    expect((await POST(req({ fields: { markupJson: '{not json' } }))).status).toBe(400);
    expect(mocks.getAuthorizedCase).not.toHaveBeenCalled();
  });

  it('404 (non-disclosing) when the actor cannot access the case; the service is never called', async () => {
    mocks.getAuthorizedCase.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mocks.getAuthorizedCase).toHaveBeenCalledWith(CASE_ID, 7);
    expect(mocks.saveRevision).not.toHaveBeenCalled();
  });

  it('201 with the receipt on success, passing the actor, case, parent hash and exact bytes; index stays not_requested', async () => {
    const res = await POST(req());
    expect(res.status).toBe(201);
    const b = await body(res);
    expect(b).toMatchObject({ ok: true, committed: true, index: { status: 'not_requested' } });
    const arg = mocks.saveRevision.mock.calls[0]![0] as { caseId: string; evidenceId: string; actorUserId: number; parentSha256: string; declaredMimeType: string; bytes: Uint8Array };
    expect(arg).toMatchObject({ caseId: CASE_ID, evidenceId: EV_ID, actorUserId: 7, parentSha256: PARENT, declaredMimeType: 'image/png' });
    expect(arg.bytes.byteLength).toBe(24);
  });

  it('200 for an idempotent re-save', async () => {
    mocks.saveRevision.mockResolvedValue({ committed: true, idempotent: true, versionId: 'v1', version: 2, index: { status: 'not_requested' } });
    expect((await POST(req())).status).toBe(200);
  });

  it.each([
    ['PARENT_HASH_MISMATCH', 409],
    ['PARENT_HASH_UNAVAILABLE', 422],
    ['IMAGE_TOO_LARGE', 413],
    ['IMAGE_TYPE_UNSUPPORTED', 400],
    ['EVIDENCE_CASE_MISMATCH', 404],
  ] as const)('maps %s to %i with a code and no stack', async (code, status) => {
    mocks.saveRevision.mockRejectedValue(new EvidenceRevisionErrorV1(code, 'x'));
    const res = await POST(req());
    expect(res.status).toBe(status);
    expect(await body(res)).toMatchObject({ ok: false, code });
  });

  it('500 with a generic message for an unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.saveRevision.mockRejectedValue(new Error('secret db detail'));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await body(res))).not.toContain('secret');
  });
});
