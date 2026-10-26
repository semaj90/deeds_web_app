import { describe, expect, it } from 'vitest';
import type { SqlClientV1 } from './topk-execution-receipt-v1.js';
import {
  PATCH_CHECK_SCHEMA,
  buildCheckReceiptV1,
  checkCommandIdentityV1,
  editsDigestV1,
  fileDigestV1,
  observedFromReplayV1,
  persistCheckReceiptV1,
  persistVerifierResultV1,
  verifyCheckReceiptV1,
  type CheckKindV1,
  type PatchEditV1,
  type ReplayResultV1,
} from './patch-check-receipt-v1.js';

const BASE = 'export const a = 1;\nexport const b = 2;\n';
const EDITS: PatchEditV1[] = [{ find: 'a = 1', replace: 'a = 10' }];
const FINAL = BASE.replace('a = 1', 'a = 10');
const TARGET = 'sveltekit-frontend/src/lib/utils/file-uploader.ts';
const goodReplay: ReplayResultV1 = { applyOk: true, applyReason: null, finalFileDigest: fileDigestV1(FINAL), tscErrors: [], changedFiles: ['file-uploader.ts'], changedLines: 2 };

function receiptFor(kind: CheckKindV1, replay: ReplayResultV1) {
  return buildCheckReceiptV1({
    preimage: {
      schema: PATCH_CHECK_SCHEMA, kind, candidateId: 'c1', runId: 'run-1', targetPath: TARGET, baseFileDigest: fileDigestV1(BASE),
      editsDigest: editsDigestV1(EDITS), finalFileDigest: replay.finalFileDigest, commandIdentity: checkCommandIdentityV1(`cmd-${kind}`),
      observed: observedFromReplayV1(kind, replay, 'file-uploader.ts'),
    },
    durationMs: 12, observedAtMs: 1,
  });
}
const verify = (r: ReturnType<typeof receiptFor>, replay: ReplayResultV1, over: Partial<{ baseText: string; edits: PatchEditV1[]; preimage: unknown }> = {}) =>
  verifyCheckReceiptV1({ row: r.row, preimage: over.preimage ?? r.preimage, baseText: over.baseText ?? BASE, edits: over.edits ?? EDITS, replay: () => replay });

describe('patch check receipts', () => {
  it('derives status, failure messages and a deterministic id from the preimage', () => {
    const pass = receiptFor('tsc', goodReplay);
    expect(pass.row.status).toBe('passed');
    expect(pass.row.failure_messages).toEqual([]);
    expect(pass.row.framework).toBe('patch-check/tsc');
    expect(pass.row.execution_receipt_id).toMatch(/^[a-f0-9]{32}$/);
    expect(receiptFor('tsc', goodReplay).row).toEqual(pass.row);
    const fail = receiptFor('tsc', { ...goodReplay, tscErrors: ['f.ts(1,1): error TS1: bad'] });
    expect(fail.row.status).toBe('failed');
    expect(fail.row.failure_messages).toEqual(['f.ts(1,1): error TS1: bad']);
    expect(fail.row.execution_receipt_id).not.toBe(pass.row.execution_receipt_id);
  });

  it('applies the scope rule: exactly the target file, 1..40 changed lines', () => {
    expect(observedFromReplayV1('scope', goodReplay, 'file-uploader.ts').passed).toBe(true);
    expect(observedFromReplayV1('scope', { ...goodReplay, changedFiles: ['file-uploader.ts', 'other.ts'] }, 'file-uploader.ts').passed).toBe(false);
    expect(observedFromReplayV1('scope', { ...goodReplay, changedLines: 0 }, 'file-uploader.ts').passed).toBe(false);
    expect(observedFromReplayV1('scope', { ...goodReplay, changedLines: 41 }, 'file-uploader.ts').passed).toBe(false);
    expect(observedFromReplayV1('tsc', { ...goodReplay, applyOk: false, applyReason: 'EDIT_0_FIND_MATCHES_0' }, 'file-uploader.ts')).toEqual({ passed: false, details: ['NOT_RUN_APPLY_FAILED'] });
  });

  it('VERIFIED_PASS when an independent replay reproduces exactly what the receipt commits to, with the digest the resolver needs', async () => {
    for (const kind of ['apply', 'tsc', 'scope'] as const) {
      const r = receiptFor(kind, goodReplay);
      const { result, reasons } = await verify(r, goodReplay);
      expect(result.verification_status).toBe('VERIFIED_PASS');
      expect(result.evidence_resolved).toBe(true);
      expect(result.computed_digest).toBe(`sha256:${r.row.report_checksum}`);
      expect(result.canonical).toBe(false);
      expect(reasons).toEqual([]);
    }
  });

  it('FABRICATED when the receipt claims a pass but the replay finds compiler errors', async () => {
    const claimed = receiptFor('tsc', goodReplay);
    const { result, reasons } = await verify(claimed, { ...goodReplay, tscErrors: ['f.ts(2,3): error TS2322: nope'] });
    expect(result.verification_status).toBe('FABRICATED');
    expect(reasons).toContain('REPLAY_CONTRADICTS_RECORDED_OUTCOME');
    expect(result.computed_digest).not.toBe(`sha256:${claimed.row.report_checksum}`);
  });

  it('VERIFIED_FAIL when the pass/fail agrees but the recorded details differ', async () => {
    const failed = receiptFor('tsc', { ...goodReplay, tscErrors: ['f.ts(1,1): error TS1: bad'] });
    const { result, reasons } = await verify(failed, { ...goodReplay, tscErrors: ['f.ts(9,9): error TS9: other'] });
    expect(result.verification_status).toBe('VERIFIED_FAIL');
    expect(reasons).toContain('REPLAY_DETAILS_DIFFER');
  });

  it('UNVERIFIED (nothing replayed) when the supplied base text, edits or preimage do not bind to the receipt', async () => {
    const r = receiptFor('tsc', goodReplay);
    let called = 0;
    const counting = (replay: ReplayResultV1) => () => { called += 1; return replay; };
    const wrongBase = await verifyCheckReceiptV1({ row: r.row, preimage: r.preimage, baseText: BASE + '\n', edits: EDITS, replay: counting(goodReplay) });
    const wrongEdits = await verifyCheckReceiptV1({ row: r.row, preimage: r.preimage, baseText: BASE, edits: [{ find: 'b = 2', replace: 'b = 3' }], replay: counting(goodReplay) });
    const tampered = await verifyCheckReceiptV1({ row: r.row, preimage: { ...r.preimage, observed: { passed: true, details: ['x'] } }, baseText: BASE, edits: EDITS, replay: counting(goodReplay) });
    const junk = await verifyCheckReceiptV1({ row: r.row, preimage: { nope: true }, baseText: BASE, edits: EDITS, replay: counting(goodReplay) });
    expect([wrongBase, wrongEdits, tampered, junk].map((x) => x.result.verification_status)).toEqual(['UNVERIFIED', 'UNVERIFIED', 'UNVERIFIED', 'UNVERIFIED']);
    expect([wrongBase, wrongEdits, tampered, junk].every((x) => x.result.evidence_resolved === false)).toBe(true);
    expect(called).toBe(0);
  });

  it('persists receipts and verifier results idempotently and refuses a divergent body under the same key', async () => {
    const receipts = new Map<string, string>();
    const verdicts = new Map<string, { status: string; digest: string }>();
    const client: SqlClientV1 = {
      async query(text, values = []) {
        if (/^INSERT INTO atlas_test_execution_receipts/.test(text)) {
          const id = String(values[0]); if (receipts.has(id)) return { rows: [] };
          receipts.set(id, String(values[10])); return { rows: [{ execution_receipt_id: id }] };
        }
        if (/^SELECT report_checksum/.test(text)) { const v = receipts.get(String(values[0])); return { rows: v ? [{ report_checksum: v }] : [] }; }
        if (/^INSERT INTO atlas_receipt_verifier_results_v1/.test(text)) {
          const k = `${values[0]}|${values[1]}|${values[2]}`; if (verdicts.has(k)) return { rows: [] };
          verdicts.set(k, { status: String(values[3]), digest: String(values[5]) }); return { rows: [{ verification_uuid: 'u' }] };
        }
        if (/^SELECT verification_status/.test(text)) { const e = verdicts.get(`${values[0]}|${values[1]}|${values[2]}`); return { rows: e ? [{ verification_status: e.status, computed_digest: e.digest }] : [] }; }
        throw new Error(`unexpected: ${text.slice(0, 40)}`);
      },
    };
    const r = receiptFor('tsc', goodReplay);
    const v = (await verify(r, goodReplay)).result;
    expect(await persistCheckReceiptV1(client, r.row)).toBe('INSERTED');
    expect(await persistCheckReceiptV1(client, r.row)).toBe('IDEMPOTENT');
    expect(await persistVerifierResultV1(client, v)).toBe('INSERTED');
    expect(await persistVerifierResultV1(client, v)).toBe('IDEMPOTENT');
    await expect(persistCheckReceiptV1(client, { ...r.row, report_checksum: 'f'.repeat(64) })).rejects.toThrow('CHECK_RECEIPT_CONFLICT');
    await expect(persistVerifierResultV1(client, { ...v, verification_status: 'FABRICATED' })).rejects.toThrow('CHECK_VERIFIER_CONFLICT');
  });
});
