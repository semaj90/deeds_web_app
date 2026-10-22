/**
 * Deep-audit telemetry writer (M10 owner of the receipt).
 *
 * Counts distinct identifiers per gate kind with AtlasHllTelemetryClient, using an in-memory exact-set
 * adapter (EXACT_SET_ADAPTER). No Valkey, PostgreSQL, Qdrant or Neo4j writes. Creates exactly one
 * receipt file (exclusive create) and then validates it with the shared consumer. If validation fails,
 * the process exits 1 with TELEMETRY_RECEIPT_INVALID. A failed receipt is never replaced.
 *
 * usage: npx tsx scripts/atlas/deep-audit-hll-telemetry-v1.mts --graph=<graph json>
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AtlasHllTelemetryClient,
  buildDailyHllWindowId,
  type HllRedisAdapter,
} from '../../sveltekit-frontend/src/lib/server/atlas/telemetry/atlas-hll-telemetry.ts';
import {
  TELEMETRY_RECEIPT_SCHEMA,
  TelemetryReceiptSchema,
  isValidWindowId,
  runTelemetryConsumer,
  type TelemetryReceipt,
} from './lib/deep-audit-telemetry-receipt-v1.mts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NAMESPACE = 'deep-audit';
const NAMESPACE_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Exact distinct-count adapter. Same contract as HllRedisAdapter, no network, no persistence. */
export class ExactSetAdapter implements HllRedisAdapter {
  private readonly sets = new Map<string, Set<string>>();
  async pfadd(key: string, ...elements: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    this.sets.set(key, set);
    const before = set.size;
    for (const element of elements) set.add(element);
    return set.size - before;
  }
  async pfcount(...keys: string[]): Promise<number> {
    const union = new Set<string>();
    for (const key of keys) for (const el of this.sets.get(key) ?? []) union.add(el);
    return union.size;
  }
}

interface GraphFile { rel: string; isRoute?: boolean; hasAuth?: boolean; hasPairedTest?: boolean; hasZod?: boolean; parsesBody?: boolean; }

/** Build the batch of distinct identifiers from a graph. Pure: no I/O. */
export function buildBatch(graph: { files: GraphFile[] }) {
  const src = graph.files.filter((f) => f.rel.startsWith('sveltekit-frontend/src/'));
  const servers = src.filter((f) => /\/\+(page\.)?server\.ts$/.test(f.rel));
  return {
    files_scanned: src.map((f) => f.rel),
    server_routes: servers.map((f) => f.rel),
    routes_without_auth: servers.filter((f) => f.hasAuth === false).map((f) => f.rel),
    routes_without_test: servers.filter((f) => !f.hasPairedTest).map((f) => f.rel),
    body_parsers_without_zod: servers.filter((f) => f.hasZod === false && f.parsesBody).map((f) => f.rel),
  };
}

export async function buildReceipt(graphRaw: string, graphArg: string, windowId: string): Promise<{ receipt: TelemetryReceipt; fileName: string }> {
  if (!NAMESPACE_PATTERN.test(NAMESPACE) || !isValidWindowId(windowId)) {
    throw new Error(`invalid namespace or window: ${NAMESPACE} ${windowId}`);
  }
  const graph = JSON.parse(graphRaw) as { files: GraphFile[] };
  const batch = buildBatch(graph);
  const adapter = new ExactSetAdapter();
  const client = new AtlasHllTelemetryClient(adapter);
  const result = await client.recordEntityBatch(NAMESPACE, windowId, batch);
  const counts: Record<string, number> = {};
  for (const kind of Object.keys(batch)) counts[kind] = await adapter.pfcount(result.keys[kind]);

  const graphSha256 = createHash('sha256').update(graphRaw).digest('hex');
  const fileName = `telemetry-${windowId}-${graphSha256.slice(0, 10)}.json`;
  const receipt = TelemetryReceiptSchema.parse({
    schema: TELEMETRY_RECEIPT_SCHEMA,
    adapter: 'EXACT_SET_ADAPTER (in-memory, not HLL, not persisted)',
    namespace: NAMESPACE,
    windowId,
    graphFile: graphArg,
    graphSha256,
    distinctCounts: counts,
    writesPerformed: { valkey: false, postgres: false, qdrant: false, neo4j: false },
    receiptFilesCreated: [fileName],
    canonicalAuthority: false,
  });
  return { receipt, fileName };
}

async function main(): Promise<void> {
  const graphArg = process.argv.find((a) => a.startsWith('--graph='))?.split('=')[1];
  if (!graphArg) throw new Error('usage: --graph=<graph json path>');
  const graphRaw = readFileSync(graphArg, 'utf8');
  const windowId = buildDailyHllWindowId(new Date());
  const { receipt, fileName } = await buildReceipt(graphRaw, graphArg, windowId);

  const outDir = path.join(REPO_ROOT, 'reports', 'deep-audit', 'telemetry');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, fileName);
  writeFileSync(outFile, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });

  // The writer does not trust its own output: the shared consumer validates the file it just wrote.
  const validation = runTelemetryConsumer([outFile]);
  if (validation.exitCode !== 0) {
    const reason = validation.receipts[0].result.ok ? 'UNKNOWN' : validation.receipts[0].result.reason;
    console.error(JSON.stringify({ status: 'BLOCKED', reason: 'TELEMETRY_RECEIPT_INVALID', detail: reason, receiptPath: path.relative(REPO_ROOT, outFile) }));
    process.exit(1);
  }
  const ok = validation.receipts[0].result;
  console.log(JSON.stringify({
    status: 'VALIDATED',
    receiptPath: path.relative(REPO_ROOT, outFile),
    receiptSha256: ok.ok ? ok.sha256 : null,
    validatorVersion: ok.validatorVersion,
    distinctCounts: receipt.distinctCounts,
  }, null, 2));
}

// Run only when executed directly, not when imported by tests (CLAUDE.md Windows entry-point rule).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
