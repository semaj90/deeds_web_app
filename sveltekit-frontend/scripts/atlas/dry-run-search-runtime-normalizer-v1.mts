/**
 * FEAT-LIVE-01 live dry run (READ-ONLY): one real SearchRuntime request -> revision-availability report through the candidate normalizer.
 * No Postgres/Qdrant/Valkey writes, no Graphify. Usage (from sveltekit-frontend/): npx tsx scripts/atlas/dry-run-search-runtime-normalizer-v1.mts "query text"
 */
import { createSearchRuntime, initializeSearchRuntime } from '../../src/lib/server/retrieval/search-runtime.js';
import { normalizeSearchRuntimeCandidatesV1 } from '../../src/lib/server/atlas/features/search-runtime-candidate-normalizer-v1.js';

const text = process.argv[2] ?? 'semantic cache invalidation for atlas packets';
await initializeSearchRuntime();
const runtime = createSearchRuntime({ readOnly: true });
const result = await runtime.search({ text, topK: 10 } as never);
const packets = (result.packets ?? []) as unknown as Array<Record<string, unknown>>;
const first = packets[0] ?? {};
// FeatureEnvelope packets use snake_case keys (packet_key, workspace_revision, ...); accept either spelling.
const snake = (k: string): string => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const nested = (p: Record<string, unknown>, k: string): unknown => p[k] ?? p[snake(k)] ?? (p.identity as Record<string, unknown> | undefined)?.[k] ?? (p.revisions as Record<string, unknown> | undefined)?.[k];
const asCandidate = (p: Record<string, unknown>, i: number) => ({
  id: String(nested(p, 'packetKey') ?? nested(p, 'sourceRef') ?? `row-${i}`),
  packetKey: String(nested(p, 'packetKey') ?? ''),
  sourceRef: String(nested(p, 'sourceRef') ?? ''),
  symbolVersionId: (nested(p, 'symbolVersionId') as string | null) ?? null,
  workspaceRevision: (nested(p, 'workspaceRevision') as string | null) ?? null,
  sourceRevision: (nested(p, 'sourceRevision') as string | null) ?? null,
  representationId: (nested(p, 'representationId') as string | null) ?? null,
  representationRevision: (nested(p, 'representationRevision') as number | null) ?? null,
  summary: '', content: '', score: 0, scoreSource: 'qdrant_768',
});
const report = normalizeSearchRuntimeCandidatesV1({
  candidates: packets.map(asCandidate) as never,
  workspaceRevision: `sha256:${'0'.repeat(64)}`,
  candidateSnapshotRevision: `sha256:${'0'.repeat(64)}`,
  producerRevision: 'feat-live-01-dry-run',
});
console.log(JSON.stringify({
  query: text,
  packetCount: packets.length,
  firstPacketTopLevelKeys: Object.keys(first).slice(0, 40),
  firstPacketSample: JSON.stringify(first).slice(0, 700),
  normalization: { ...report, ordinalMap: report.ordinalMap ? { rowCount: report.ordinalMap.rowCount } : null, rejected: report.rejected.slice(0, 3) },
}, null, 2));
process.exit(0);
