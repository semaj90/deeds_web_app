#!/usr/bin/env node
/**
 * RUNTIME-ERR-SIMD-01 (offline, no DB/model/network): pushes a Downloads "runtime-errors-top100" export
 * (schema atlas.runtime-error-priority-batch-export.v1) through the EXISTING simdjson typed-evidence bridge
 * (parseNdjsonTypedEvidence -> Zod -> TypedEvidenceEnvelopeV1). Reuses the owner; adds only the record Zod schema,
 * file checksum and receipt. Every envelope is canonicalAuthority:false evidence.
 *
 * NOT a DSPy repair request: records carry no sourceRevision, workspaceRevision, findingId or evidenceRefs, so they cannot
 * satisfy validate_dspy_repair_request_v1 (see work-state "Feed agentic error-fixing report into the DSPy lane").
 *
 * Run from sveltekit-frontend (so $lib and @deeds/parent-atlas resolve):
 *   npx tsx ../scripts/atlas/typed-runtime-error-export-v1.mts --file=<path to runtime-errors-top100-*.json>
 * Writes (gitignored): .tmp/atlas/runtime-error-top100-typed-evidence-v1.json (receipt) and
 *   .tmp/atlas/runtime-error-top100-typed-v1.jsonl (accepted typed rows, one per line).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { parseNdjsonTypedEvidence } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts';
import { fastJsonParseWithBackend } from '../../sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
// Use the app's zod (root node_modules/zod is empty). Same instance the typed-evidence bridge validates with.
const { z } = createRequire(path.join(REPO_ROOT, 'sveltekit-frontend/package.json'))('zod') as typeof import('zod');
const args = new Map(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return (i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]) as [string, string];
  }),
);
const fileArg = args.get('file');
if (!fileArg) { console.error('--file=<runtime-errors-top100-*.json> required'); process.exit(2); }
const file = path.resolve(fileArg);
const outDir = path.resolve(REPO_ROOT, args.get('out-dir') ?? '.tmp/atlas');
const EXPORT_SCHEMA = 'atlas.runtime-error-priority-batch-export.v1';
const NL = String.fromCharCode(10);

const RecordV1 = z.object({
  rank: z.number().int().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  source: z.enum(['error_events', 'error_logs']),
  routePath: z.string().min(1),
  kind: z.string().min(1),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  occurrences: z.number().int().min(1),
  lastSeen: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'lastSeen must be an ISO timestamp'),
  priorityScore: z.number().finite(),
  firstAppFrame: z.string().nullable(),
}).strict();

const EnvelopeV1 = z.object({
  schema: z.literal(EXPORT_SCHEMA),
  exportedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  metadata: z.object({
    status: z.string(),
    windowDays: z.number().int(),
    limit: z.number().int(),
    totalRankedGroups: z.number().int(),
    exportedGroups: z.number().int(),
    sourceTables: z.array(z.string()),
    ordering: z.array(z.string()),
    scoring: z.string(),
    fullStackTracesIncluded: z.boolean(),
    applicationFramesIncluded: z.boolean(),
    refreshedAt: z.string(),
  }).passthrough(),
  records: z.array(z.unknown()),
}).strict();

const bytes = fs.readFileSync(file);
const fileSha = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const text = bytes.toString('utf8');
const top = fastJsonParseWithBackend<unknown>(text);
const env = EnvelopeV1.safeParse(top.value);
const problems: string[] = [];
if (!env.success) problems.push(`ENVELOPE_INVALID:${env.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);

let report: ReturnType<typeof parseNdjsonTypedEvidence<z.infer<typeof RecordV1>>> | null = null;
let orderingOk = false, ranksOk = false, fingerprintsUnique = false, countOk = false;
if (env.success) {
  const records = env.data.records;
  countOk = records.length === env.data.metadata.exportedGroups && records.length <= env.data.metadata.limit;
  if (!countOk) problems.push(`COUNT_MISMATCH:records=${records.length},exportedGroups=${env.data.metadata.exportedGroups},limit=${env.data.metadata.limit}`);
  report = parseNdjsonTypedEvidence({
    artifactRef: `runtime-error-export:${path.basename(file)}`,
    artifactRevision: fileSha,
    ndjson: records.map((r) => JSON.stringify(r)).join(NL),
    payloadSchema: RecordV1,
    payloadSchemaId: 'atlas.runtime-error-priority-record.v1',
  });
  const rows = report.accepted.map((a) => a.payload);
  ranksOk = rows.length > 0 && rows.every((r, i) => r.rank === i + 1);
  fingerprintsUnique = new Set(rows.map((r) => r.fingerprint)).size === rows.length;
  // ordering claim in metadata: priorityScore DESC (the first key); verify it rather than trust it.
  orderingOk = rows.every((r, i) => i === 0 || rows[i - 1]!.priorityScore >= r.priorityScore);
  if (!ranksOk) problems.push('RANKS_NOT_SEQUENTIAL');
  if (!fingerprintsUnique) problems.push('FINGERPRINT_DUPLICATE');
  if (!orderingOk) problems.push('PRIORITY_SCORE_NOT_DESCENDING');
}

const rows = report?.accepted.map((a) => a.payload) ?? [];
const tally = (key: 'kind' | 'severity' | 'source') => rows.reduce<Record<string, number>>((m, r) => { m[r[key]] = (m[r[key]] ?? 0) + 1; return m; }, {});
const pass = !!report && report.rejected.length === 0 && problems.length === 0;
const receipt = {
  schema: 'atlas.runtime-error-export-typed-evidence-receipt.v1',
  status: pass ? 'TYPED_EVIDENCE_PROVEN' : 'NOT_PROVEN',
  canonicalAuthority: false,
  evidenceOnly: true,
  dspyRepairEligible: false,
  dspyRepairBlockedBy: 'records have no sourceRevision, workspaceRevision, findingId or evidenceRefs',
  file: { name: path.basename(file), bytes: bytes.byteLength, sha256: fileSha },
  exportMeta: env.success ? { exportedAt: env.data.exportedAt, ...env.data.metadata } : null,
  topLevelParse: { backend: top.backend, simdjsonNativeEligible: bytes.byteLength >= 1024 },
  perLineParse: report ? { ...report.parserExecution, simdjsonUsed: report.simdjsonUsed, note: 'lines under 1 KB take V8 by design (MIN_NATIVE_BYTES)' } : null,
  totalLines: report?.totalLines ?? 0,
  accepted: report?.accepted.length ?? 0,
  rejected: report?.rejected.length ?? 0,
  rejectedDetail: report?.rejected.slice(0, 10) ?? [],
  checks: { countOk, ranksOk, fingerprintsUnique, priorityScoreDescending: orderingOk },
  problems,
  occurrencesTotal: rows.reduce((n, r) => n + r.occurrences, 0),
  byKind: tally('kind'), bySeverity: tally('severity'), bySource: tally('source'),
  top10: rows.slice(0, 10).map((r) => ({ rank: r.rank, routePath: r.routePath, kind: r.kind, occurrences: r.occurrences, lastSeen: r.lastSeen, message: r.message.slice(0, 140) })),
  typedRootChecksum: report ? `sha256:${crypto.createHash('sha256').update(report.accepted.map((a) => a.envelope.typedEvidenceChecksum).join(NL)).digest('hex')}` : null,
  databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, networkCalls: 0,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(outDir, { recursive: true });
const receiptPath = path.join(outDir, 'runtime-error-top100-typed-evidence-v1.json');
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + NL);
if (report) {
  const jsonl = report.accepted.map((a) => JSON.stringify({ envelope: a.envelope, payload: a.payload })).join(NL) + NL;
  fs.writeFileSync(path.join(outDir, 'runtime-error-top100-typed-v1.jsonl'), jsonl);
}
console.log(JSON.stringify({ ...receipt, top10: undefined, rejectedDetail: undefined }, null, 1));
process.exit(pass ? 0 : 1);
