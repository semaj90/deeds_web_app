import { readFile, writeFile } from 'node:fs/promises';
import { planWorkspaceBindingCasBatchV1 } from '../../sveltekit-frontend/src/lib/server/atlas/workspace/workspace-binding-cas-v1.js';

type Source = { sourceIdentityKey?: string; repositoryId?: string; repositoryRelativePath?: string; sourceRevision?: string | null; contentDigest?: string | null };
type Snapshot = { snapshotRevision?: string; sources?: Source[] };
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const beforePath = arg('--before');
const afterPath = arg('--after');
if (!beforePath || !afterPath) throw new Error('USAGE: npx tsx scripts/atlas/plan-workspace-binding-cas-v1.mts --before <snapshot.json> --after <snapshot.json> [--out <report.json>]');
const [before, after] = await Promise.all([
  readFile(beforePath, 'utf8').then((text) => JSON.parse(text) as Snapshot),
  readFile(afterPath, 'utf8').then((text) => JSON.parse(text) as Snapshot),
]);
const key = (source: Source) => source.sourceIdentityKey ?? `${source.repositoryId ?? 'repo:root'}:${source.repositoryRelativePath ?? ''}`;
const digest = (source: Source) => source.contentDigest ? (source.contentDigest.startsWith('sha256:') ? source.contentDigest : `sha256:${source.contentDigest}`) : null;
const state = (source: Source) => ({ sourceRef: key(source), sourceRevision: source.sourceRevision ?? null, contentDigest: digest(source) });
const beforeMap = new Map((before.sources ?? []).map((source) => [key(source), source]));
const afterMap = new Map((after.sources ?? []).map((source) => [key(source), source]));
const sourceRefs = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
const batch = planWorkspaceBindingCasBatchV1(sourceRefs.map((sourceRef) => ({
  expected: beforeMap.has(sourceRef) ? state(beforeMap.get(sourceRef)!) : null,
  current: beforeMap.has(sourceRef) ? state(beforeMap.get(sourceRef)!) : null,
  observed: afterMap.has(sourceRef) ? state(afterMap.get(sourceRef)!) : null,
})));
const report = {
  schema: 'atlas.workspace-binding-cas-plan-report.v1',
  status: 'READ_ONLY_CAS_PLAN',
  beforeSnapshotRevision: before.snapshotRevision ?? null,
  afterSnapshotRevision: after.snapshotRevision ?? null,
  batch,
  promotionEligible: false,
  canonicalAuthority: false,
  writesPerformed: false,
  note: 'Current bindings are represented by the before checkpoint for planning only; no Postgres source-binding row was read or changed.',
};
const out = arg('--out') ?? 'docs/reports/workspace-binding-cas-plan-v1.json';
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts: batch.counts, writesPerformed: false, reportPath: out }, null, 2));
