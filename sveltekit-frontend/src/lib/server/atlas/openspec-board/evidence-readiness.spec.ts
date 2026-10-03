import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEvidenceReadinessChipsV1, toneForReadinessStatus } from './evidence-readiness';

describe('evidence readiness chips', () => {
  it('treats blocked / unproven plan states as neutral blocked, never ok', () => {
    for (const s of [
      'MODEL_ARTIFACT_UNPROVEN',
      'BLOCKED_PROJECTION_PARITY_GATE',
      'RRF_OWNER_CONTRACT_PROVEN_RUNTIME_UNEXECUTED',
      'ORACLE_DESIGNED_UNAPPLIED',
      'BLOCKED_IMPORT_PLAN'
    ]) {
      expect(toneForReadinessStatus(s)).toBe('blocked');
    }
  });

  it('only marks explicit proven/ready states ok', () => {
    expect(toneForReadinessStatus('PROJECTION_PARITY_PROVEN')).toBe('ok');
    expect(toneForReadinessStatus('READY')).toBe('ok');
    expect(toneForReadinessStatus('REPORT_MISSING')).toBe('unknown');
  });

  it('reads status from a report directory and degrades missing/invalid reports without throwing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'evr-'));
    await writeFile(join(dir, 'openspec-evidence-embedding-plan-v1.json'), JSON.stringify({ status: 'MODEL_ARTIFACT_UNPROVEN' }));
    await writeFile(join(dir, 'openspec-evidence-retrieval-plan-v1.json'), '{not json');
    const chips = await readEvidenceReadinessChipsV1(dir);
    expect(chips).toHaveLength(6);
    const by = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(by.embedding.status).toBe('MODEL_ARTIFACT_UNPROVEN');
    expect(by.embedding.tone).toBe('blocked');
    expect(by.pgvector.status).toBe('REPORT_MISSING');
    expect(by.gpuParity.tone).toBe('unknown');
  });

  it('is request-local: two reads over different directories do not share state', async () => {
    const a = await mkdtemp(join(tmpdir(), 'evr-a-'));
    const b = await mkdtemp(join(tmpdir(), 'evr-b-'));
    await writeFile(join(a, 'openspec-evidence-embedding-plan-v1.json'), JSON.stringify({ status: 'READY' }));
    const [ca, cb] = await Promise.all([readEvidenceReadinessChipsV1(a), readEvidenceReadinessChipsV1(b)]);
    expect(ca[0].tone).toBe('ok');
    expect(cb[0].status).toBe('REPORT_MISSING');
  });
});
