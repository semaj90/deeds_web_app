/** Read-only, bounded Python↔Zod parity proof for the existing OKF domain contract.
 * Does not approve ORF, call :8095, index vectors, or admit facts.
 * Usage: npx tsx scripts/atlas/prove-okf-domain-python-zod-parity-v1.mts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DomainClassificationV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.js';

const root = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '../..');
const oracle = path.join(root, 'python/atlas_okf_domain_parity_oracle_v1.py');
const python = process.env.ATLAS_PYTHON ?? (process.platform === 'win32' ? path.join(root, '.venv/Scripts/python.exe') : path.join(root, '.venv/bin/python'));
const valid = {
  schemaVersion: 'atlas.okf.domain-classification.v1',
  classificationId: 'classification:fixture:one',
  subjectRef: 'symbol:fixture:one',
  subjectKind: 'symbol',
  domainId: 'domain:code',
  taxonomyRevision: 'taxonomy:fixture:r1',
  confidence: 0.875,
  evidenceRefs: ['fixture:source-span:1'],
  sourceRevision: 'sha256:' + 'a'.repeat(64),
  producerId: 'fixture-parity-only',
  producerRevision: 'fixture:r1',
  lifecycle: 'OBSERVED',
};
const fixtures: unknown[] = [
  valid,
  { ...valid, evidenceRefs: [] },
  { ...valid, evidenceRefs: [''] },
  { ...valid, confidence: 1.1 },
  { ...valid, confidence: true },
  { ...valid, sourceRevision: '' },
  { ...valid, subjectKind: 'unknown' },
  { ...valid, unexpectedAuthority: true },
  { ...valid, lifecycle: 'PROVEN' },
  { ...valid, classificationId: '' },
];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
function hash(value: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
}
function main() {
  if (!existsSync(oracle)) throw new Error('PYTHON_ORACLE_MISSING');
  if (!existsSync(python)) throw new Error('PYTHON_ENV_UNAVAILABLE: set ATLAS_PYTHON to existing venv interpreter');
  const child = spawnSync(python, [oracle], {
    cwd: root, input: JSON.stringify(fixtures), encoding: 'utf8',
    maxBuffer: 1024 * 1024, timeout: 30000, windowsHide: true,
  });
  if (child.status !== 0) throw new Error('PYTHON_PARITY_UNAVAILABLE:' + (child.stdout || child.stderr || child.error));
  const result = JSON.parse(child.stdout);
  if (result.schema !== 'atlas.okf.python-domain-parity.v1' || result.rows?.length !== fixtures.length)
    throw new Error('PYTHON_PARITY_SCHEMA_MISMATCH');
  const mismatches = fixtures.flatMap((fixture, i) => {
    const parsed = DomainClassificationV1Schema.safeParse(fixture);
    const row = result.rows[i];
    if (row.index !== i || row.valid !== parsed.success) return [{ index: i, type: 'VALIDATION_DISAGREEMENT', python: row.valid, zod: parsed.success }];
    if (parsed.success && row.checksum !== hash(parsed.data)) return [{ index: i, type: 'CANONICAL_CHECKSUM_MISMATCH' }];
    return [];
  });
  const report = {
    schema: 'atlas.okf.domain-python-zod-parity.v1',
    status: mismatches.length ? 'PARITY_FAILED' : 'PARITY_PROVEN_FOR_FIXTURES_ONLY',
    fixtureCount: fixtures.length, rejectedFixtureCount: fixtures.length - result.rows.filter((r: any) => r.valid).length,
    mismatches, canonicalAuthority: false, admissionPerformed: false,
    persistentWritesPerformed: false, sidecarRuntimeVerified: false,
    todo: [
      'TODO OKF-01: map registry YAML owner paths and revisions against live declarations',
      'TODO OKF-03: compare deployed :8095 module digests with checkout before extraction',
      'TODO OKF-04: prove explicit typed relations, never infer from CONCEPT mentions',
      'TODO OKF-05: resolve domainId with approved taxonomy/OaK; retain abstentions',
      'TODO OKF-06: add NumPy vs TS numeric oracle on one immutable vector/feature fixture',
      'TODO OKF-07: require independent task-scoped canonical receipt admission',
      'TODO OKF-08: require accepted ContextManifest checksum before Ornith synthesis',
      'TODO ORF: require independent signed reviewer approval for exact frozen proposal checksum'
    ],
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (mismatches.length) process.exitCode = 1;
}
main();
