// @vitest-environment node
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  EVIDENCE_REVISION_SCHEMA_V1,
  EvidenceRevisionErrorV1,
  MAX_REVISION_IMAGE_BYTES,
  normalizeSha256,
  saveEvidenceMarkupRevisionV1,
  sniffImage,
  type EvidenceRevisionPortsV1,
} from './evidence-revision-v1.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const EV_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_HEX = 'a'.repeat(64);
const PARENT = `sha256:${PARENT_HEX}`;
const png = (extra = 32) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 7)]);
const markup = { schemaVersion: 'evidence-markup-v1', notes: 'n', items: [{ id: 'p1', kind: 'pin', x: 0.2, y: 0.4, label: 'footprint' }] };

function fakePorts(over: Partial<EvidenceRevisionPortsV1> = {}) {
  const log = { put: [] as unknown[], del: [] as unknown[], insert: [] as Record<string, unknown>[] };
  let version = 0;
  const rows = new Map<string, { id: string; version: number }>();
  const ports: EvidenceRevisionPortsV1 = {
    artifactBucket: 'atlas-artifacts',
    loadEvidence: async () => ({ id: EV_ID, caseId: CASE_ID, hash: PARENT }),
    findRevisionBySha256: async (_e, sha) => rows.get(sha) ?? null,
    putObject: async (a) => { log.put.push(a); },
    deleteObject: async (b, k) => { log.del.push([b, k]); },
    insertRevision: async (a) => {
      const dup = rows.get(a.sha256);
      if (dup) return { ...dup, created: false };
      const row = { id: `ver-${++version}`, version };
      rows.set(a.sha256, row);
      log.insert.push(a as unknown as Record<string, unknown>);
      return { ...row, created: true };
    },
    ...over,
  };
  return { ports, log };
}
const base = () => ({ caseId: CASE_ID, evidenceId: EV_ID, actorUserId: 7, parentSha256: PARENT, bytes: png(), markup });
const code = async (p: Promise<unknown>) => { try { await p; return 'NO_ERROR'; } catch (e) { return e instanceof EvidenceRevisionErrorV1 ? e.code : `OTHER:${(e as Error).message}`; } };

describe('evidence-revision-v1', () => {
  it('normalizes sha256 and sniffs image bytes', () => {
    expect(normalizeSha256(PARENT_HEX.toUpperCase())).toBe(PARENT);
    expect(normalizeSha256('sha256:xyz')).toBeNull();
    expect(sniffImage(png())?.mimeType).toBe('image/png');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))?.mimeType).toBe('image/webp');
    expect(sniffImage(Buffer.from('GIF89a......'))).toBeNull();
  });

  it('stores the exact bytes as a derived artifact and commits a row without claiming any indexing', async () => {
    const { ports, log } = fakePorts();
    const input = base();
    const r = await saveEvidenceMarkupRevisionV1(input, ports);
    const hex = crypto.createHash('sha256').update(input.bytes).digest('hex');
    expect(r).toMatchObject({ schema: EVIDENCE_REVISION_SCHEMA_V1, committed: true, idempotent: false, version: 1, sha256: `sha256:${hex}`, parentSha256: PARENT, byteSize: input.bytes.length, mimeType: 'image/png', bucket: 'atlas-artifacts', index: { status: 'not_requested' } });
    expect(r.objectKey).toBe(`evidence-revisions/${CASE_ID}/${EV_ID}/${hex}.png`);
    const put = log.put[0] as { bytes: Uint8Array; bucket: string };
    expect(Buffer.from(put.bytes).equals(input.bytes)).toBe(true); // no padding: object bytes === hashed bytes
    expect(put.bucket).toBe('atlas-artifacts');
    const meta = log.insert[0]!.metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ schema: EVIDENCE_REVISION_SCHEMA_V1, parentSha256: PARENT, actorUserId: 7, canonicalAuthority: false });
    expect(meta).not.toHaveProperty('changedBy');
  });

  it('is idempotent for identical bytes: no second upload, same version', async () => {
    const { ports, log } = fakePorts();
    const a = await saveEvidenceMarkupRevisionV1(base(), ports);
    const b = await saveEvidenceMarkupRevisionV1(base(), ports);
    expect(b).toMatchObject({ idempotent: true, versionId: a.versionId, version: a.version });
    expect(log.put).toHaveLength(1);
  });

  it('fails closed on a wrong, missing or malformed parent hash and on a case mismatch', async () => {
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), parentSha256: 'sha256:' + 'b'.repeat(64) }, fakePorts().ports))).toBe('PARENT_HASH_MISMATCH');
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), parentSha256: 'nope' }, fakePorts().ports))).toBe('INVALID_PARENT_SHA256');
    expect(await code(saveEvidenceMarkupRevisionV1(base(), fakePorts({ loadEvidence: async () => ({ id: EV_ID, caseId: CASE_ID, hash: null }) }).ports))).toBe('PARENT_HASH_UNAVAILABLE');
    expect(await code(saveEvidenceMarkupRevisionV1(base(), fakePorts({ loadEvidence: async () => ({ id: EV_ID, caseId: '33333333-3333-4333-8333-333333333333', hash: PARENT }) }).ports))).toBe('EVIDENCE_CASE_MISMATCH');
    expect(await code(saveEvidenceMarkupRevisionV1(base(), fakePorts({ loadEvidence: async () => null }).ports))).toBe('EVIDENCE_NOT_FOUND');
  });

  it('rejects empty, oversized, non-image and mis-declared images before any storage call', async () => {
    const { ports, log } = fakePorts();
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), bytes: new Uint8Array(0) }, ports))).toBe('IMAGE_EMPTY');
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), bytes: new Uint8Array(MAX_REVISION_IMAGE_BYTES + 1) }, ports))).toBe('IMAGE_TOO_LARGE');
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), bytes: Buffer.from('%PDF-1.7 not an image') }, ports))).toBe('IMAGE_TYPE_UNSUPPORTED');
    expect(await code(saveEvidenceMarkupRevisionV1({ ...base(), declaredMimeType: 'image/webp' }, ports))).toBe('IMAGE_TYPE_MISMATCH');
    expect(log.put).toHaveLength(0);
  });

  it('validates the markup document (range, kinds, strictness, item cap)', async () => {
    const { ports, log } = fakePorts();
    const bad = (m: unknown) => code(saveEvidenceMarkupRevisionV1({ ...base(), markup: m }, ports));
    expect(await bad({ ...markup, items: [{ id: 'p', kind: 'pin', x: 1.2, y: 0, label: 'x' }] })).toBe('INVALID_MARKUP');
    expect(await bad({ ...markup, items: [{ id: 'p', kind: 'circle', x: 0, y: 0 }] })).toBe('INVALID_MARKUP');
    expect(await bad({ ...markup, extra: true })).toBe('INVALID_MARKUP');
    expect(await bad({ ...markup, items: Array.from({ length: 101 }, (_, i) => ({ id: `p${i}`, kind: 'pin', x: 0, y: 0, label: 'x' })) })).toBe('INVALID_MARKUP');
    expect(await bad({ ...markup, items: [{ id: 'a', kind: 'arrow', x1: 0, y1: 0, x2: 1, y2: 1 }, { id: 't', kind: 'text', x: 0.5, y: 0.5, text: 'hi' }, { id: 'r', kind: 'rectangle', x: 0, y: 0, width: 0.5, height: 0.5 }] })).toBe('NO_ERROR');
    expect(log.put).toHaveLength(1);
  });

  it('does not insert when the upload fails, and deletes the uploaded object when the insert fails', async () => {
    const up = fakePorts({ putObject: async () => { throw new Error('S3_DOWN'); } });
    expect(await code(saveEvidenceMarkupRevisionV1(base(), up.ports))).toBe('OTHER:S3_DOWN');
    expect(up.log.insert).toHaveLength(0);

    const db = fakePorts({ insertRevision: async () => { throw new Error('DB_DOWN'); } });
    expect(await code(saveEvidenceMarkupRevisionV1(base(), db.ports))).toBe('OTHER:DB_DOWN');
    expect(db.log.put).toHaveLength(1);
    expect(db.log.del).toHaveLength(1);
    expect((db.log.del[0] as string[])[1]).toBe((db.log.put[0] as { objectKey: string }).objectKey);
  });
});
