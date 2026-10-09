import { describe, expect, it } from 'vitest';
import { evidenceReportToSnapshotV1, targetFingerprintsForFileV1 } from './repair-evidence-adapter-v1.js';
import { verifyRepairEpisodeV1 } from './repair-episode-verifier-v1.js';
// Real parser/report builder (no checker is run; this is text -> report).
// @ts-ignore plain .mjs module; tsc may or may not infer its types depending on checkJs
import { buildEvidenceReport } from '../../../../../../../scripts/atlas/typescript-error-evidence-v1.mjs';

const W = 'sha256:' + 'a'.repeat(64);
const S = 'sha256:' + 'b'.repeat(64);
const line = (ts: number, file: string, l: number, ch: number, code: number, message: string, type = 'ERROR') =>
  `${ts} ${JSON.stringify({ type, filename: file, start: { line: l, character: ch }, end: { line: l, character: ch + 1 }, message, code })}`;
const report = (lines: string[], opts: Record<string, unknown> = { workspaceRevision: W, sourceRevision: S }) =>
  buildEvidenceReport(['1700000000000 START "/repo"', ...lines, '1700000000001 COMPLETED 1 FILES'].join('\n'), opts);

describe('evidenceReportToSnapshotV1 (real parser output)', () => {
  const before = report([
    line(1, 'src/a.ts', 9, 3, 2339, "Property 'x' does not exist on type 'Y'."),
    line(2, 'src/a.ts', 20, 1, 2322, 'Type string is not assignable to number.'),
    line(3, 'src/b.ts', 4, 0, 7006, "Parameter 'p' implicitly has an 'any' type."),
    line(4, 'src/w.ts', 1, 0, 6133, "'z' is declared but never used.", 'WARNING'),
  ]);

  it('produces a snapshot with errors only, bound to the report lineage and artifact checksum', () => {
    const r = evidenceReportToSnapshotV1(before);
    expect(r.snapshot.workspaceRevision).toBe(W);
    expect(r.snapshot.sourceRevision).toBe(S);
    expect(r.errorCount).toBe(3);
    expect(r.artifactChecksum).toMatch(/^sha256:/);
    expect(evidenceReportToSnapshotV1(before, { includeWarnings: true }).errorCount).toBe(4);
  });

  it('a pure line shift in the after-report does not read as a regression', () => {
    const after = report([
      line(1, 'src/a.ts', 29, 3, 2339, "Property 'x' does not exist on type 'Y'."), // shifted 9 -> 29
      line(3, 'src/b.ts', 4, 0, 7006, "Parameter 'p' implicitly has an 'any' type."),
    ]);
    const target = targetFingerprintsForFileV1(before, 'src/a.ts', 'TS2322');
    expect(target).toHaveLength(1);
    const v = verifyRepairEpisodeV1({ before: evidenceReportToSnapshotV1(before).snapshot, after: evidenceReportToSnapshotV1(after).snapshot, targetFingerprints: target });
    expect(v.verdict).toBe('PASS');
    expect(v.newFingerprints).toEqual([]);
  });

  it('a repair that introduces a new error elsewhere is REGRESSED; leaving the target is FAILURE', () => {
    const target = targetFingerprintsForFileV1(before, 'src/a.ts', 'TS2322');
    const regressed = report([
      line(1, 'src/a.ts', 9, 3, 2339, "Property 'x' does not exist on type 'Y'."),
      line(3, 'src/b.ts', 4, 0, 7006, "Parameter 'p' implicitly has an 'any' type."),
      line(5, 'src/c.ts', 2, 0, 2304, "Cannot find name 'q'."),
    ]);
    expect(verifyRepairEpisodeV1({ before: evidenceReportToSnapshotV1(before).snapshot, after: evidenceReportToSnapshotV1(regressed).snapshot, targetFingerprints: target }).verdict).toBe('REGRESSED');
    expect(verifyRepairEpisodeV1({ before: evidenceReportToSnapshotV1(before).snapshot, after: evidenceReportToSnapshotV1(before).snapshot, targetFingerprints: target }).verdict).toBe('FAILURE');
  });

  it('fails closed on missing revisions, truncation and malformed lines', () => {
    const one = [line(1, 'src/a.ts', 1, 0, 2339, 'm')];
    expect(() => evidenceReportToSnapshotV1(report(one, { sourceRevision: S }))).toThrow('REPAIR_EVIDENCE_WORKSPACE_REVISION_MISSING');
    expect(() => evidenceReportToSnapshotV1(report(one, { workspaceRevision: W }))).toThrow('REPAIR_EVIDENCE_SOURCE_REVISION_MISSING');
    expect(() => evidenceReportToSnapshotV1(report([...one, line(2, 'src/a.ts', 2, 0, 2339, 'n')], { workspaceRevision: W, sourceRevision: S, limit: 2 }))).toThrow('REPAIR_EVIDENCE_TRUNCATED');
    expect(() => evidenceReportToSnapshotV1(report([...one, '1700000000002 {not json']))).toThrow('REPAIR_EVIDENCE_HAS_MALFORMED_LINES');
    expect(evidenceReportToSnapshotV1(report([...one, '1700000000002 {not json']), { allowMalformedLines: true }).errorCount).toBe(1);
  });

  it('rejects unsupported schemas and per-error revision drift', () => {
    expect(() => evidenceReportToSnapshotV1({ ...(before as any), schema: 'other' })).toThrow('REPAIR_EVIDENCE_SCHEMA_UNSUPPORTED');
    const drift = JSON.parse(JSON.stringify(before));
    drift.errors[0].sourceRevision = 'sha256:' + 'c'.repeat(64);
    expect(() => evidenceReportToSnapshotV1(drift)).toThrow('REPAIR_EVIDENCE_ERROR_REVISION_MISMATCH');
  });

  it('ignores errors in excluded paths (node_modules) and non-source files', () => {
    const r = report([line(1, 'node_modules/x/y.ts', 1, 0, 2339, 'm'), line(2, 'src/a.ts', 1, 0, 2339, 'm')]);
    expect(evidenceReportToSnapshotV1(r).errorCount).toBe(1);
  });
});
