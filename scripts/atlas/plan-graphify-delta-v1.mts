import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildGraphifyDeltaBatchV1,
  classifyGraphifySourceDeltaV1,
  type GraphifySourceState,
} from '../../sveltekit-frontend/src/lib/server/atlas/workspace/graphify-delta-v1.js';

type SnapshotSource = {
  sourceIdentityKey?: string;
  sourceRef?: string;
  repositoryId?: string;
  repositoryRelativePath?: string;
  sourceRevision?: string | null;
  contentDigest?: string | null;
};

type Snapshot = {
  workspaceId?: string;
  snapshotRevision?: string;
  sources?: SnapshotSource[];
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): never {
  throw new Error('USAGE: npx tsx scripts/atlas/plan-graphify-delta-v1.mts --before <snapshot.json> --after <snapshot.json> [--out <report.json>]');
}

function normalizeDigest(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function sourceKey(source: SnapshotSource): string {
  return source.sourceIdentityKey
    ?? `${source.repositoryId ?? 'repo:root'}:${source.repositoryRelativePath ?? source.sourceRef ?? ''}`;
}

function sourceState(source: SnapshotSource, key: string): GraphifySourceState {
  return {
    sourceRef: key,
    sourceRevision: source.sourceRevision ?? null,
    contentDigest: normalizeDigest(source.contentDigest),
  };
}

function deterministicBatchId(beforeRevision: string, afterRevision: string): string {
  const bytes = createHash('sha256').update(`atlas.graphify-delta-batch.v1\0${beforeRevision}\0${afterRevision}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readSnapshot(path: string): Promise<Snapshot> {
  const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
  if (!Array.isArray(snapshot.sources) || !snapshot.snapshotRevision) throw new Error(`INVALID_SNAPSHOT:${path}`);
  return snapshot;
}

const beforePath = arg('--before');
const afterPath = arg('--after');
if (!beforePath || !afterPath) usage();

const [before, after] = await Promise.all([readSnapshot(beforePath), readSnapshot(afterPath)]);
const beforeMap = new Map((before.sources ?? []).map((source) => [sourceKey(source), source]));
const afterMap = new Map((after.sources ?? []).map((source) => [sourceKey(source), source]));
const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
const deltas = keys.map((key) => classifyGraphifySourceDeltaV1(
  beforeMap.has(key) ? sourceState(beforeMap.get(key)!, key) : null,
  afterMap.has(key) ? sourceState(afterMap.get(key)!, key) : null,
));

const batch = buildGraphifyDeltaBatchV1({
  batchId: arg('--batch-id') ?? deterministicBatchId(before.snapshotRevision!, after.snapshotRevision!),
  workspaceId: after.workspaceId ?? before.workspaceId ?? 'UNRESOLVED_WORKSPACE',
  baseSnapshotRevision: before.snapshotRevision!,
  previousHeadRevision: before.snapshotRevision!,
  deltas,
});
const report = {
  schema: 'atlas.graphify-delta-plan-report.v1',
  status: 'READ_ONLY_DELTA_PLAN',
  beforeSnapshotRevision: before.snapshotRevision,
  afterSnapshotRevision: after.snapshotRevision,
  batch,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionEligible: false,
  note: 'The planner compares checkpoint artifacts only. It does not admit a workspace head, select a Graphify owner, or apply source bindings.',
};
const out = arg('--out') ?? 'docs/reports/graphify-delta-plan-v1.json';
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  beforeSnapshotRevision: report.beforeSnapshotRevision,
  afterSnapshotRevision: report.afterSnapshotRevision,
  total: deltas.length,
  added: batch.addedCount,
  changed: batch.changedCount,
  deleted: batch.deletedCount,
  unchanged: batch.unchangedCount,
  writesPerformed: false,
  reportPath: out,
}, null, 2));
