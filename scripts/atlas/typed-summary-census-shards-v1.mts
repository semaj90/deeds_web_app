#!/usr/bin/env node
/**
 * SUMMARY-SIMD-01 (offline, no DB/model/network): streams sealed legacy-summary census shards through the EXISTING
 * simdjson typed-evidence bridge (parseNdjsonTypedEvidence -> Zod -> TypedEvidenceEnvelopeV1). Reuses the owner; adds only
 * the census row Zod schema and shard verification. canonicalAuthority is false on every envelope.
 * Run from sveltekit-frontend (so $lib resolves): npx tsx ../scripts/atlas/typed-summary-census-shards-v1.mts --dir=<shard dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { parseNdjsonTypedEvidence } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return (i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]) as [string, string]; }));
const dirArg = args.get('dir');
if (!dirArg) { console.error('--dir required'); process.exit(2); }
const dir = path.resolve(REPO_ROOT, dirArg);
const sha = (s: string) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;

const CensusRowV1 = z.object({
  schema: z.literal('atlas.legacy-summary-census-row.v1'),
  chunkRowId: z.string().uuid(),
  chunkId: z.string().nullable(),
  summaryDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  class: z.enum(['LEGACY_QUARANTINED', 'LEGACY_CONTAMINATED', 'LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED']),
  quarantined: z.boolean(), detectorClean: z.boolean(), lineageExact: z.boolean(),
}).strict();

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const perShard: Record<string, unknown>[] = [];
const byClass: Record<string, number> = {};
let accepted = 0, rejected = 0, shardChecksumMismatch = 0, simdUsedAll = true;
const envelopeChecksums: string[] = [];
const rejectCodes: Record<string, number> = {};
for (const s of manifest.shards as { path: string; rows: number; sha256: string }[]) {
  const text = fs.readFileSync(path.join(dir, s.path), 'utf8');
  const digest = sha(text);
  const checksumOk = digest === s.sha256;
  if (!checksumOk) shardChecksumMismatch++;
  const rep = parseNdjsonTypedEvidence({
    artifactRef: `${manifest.schema}:${s.path}`, artifactRevision: digest, sourceRef: `census-shard:${s.path}`, sourceRevision: digest,
    ndjson: text, payloadSchema: CensusRowV1, payloadSchemaId: 'atlas.legacy-summary-census-row.v1',
  } as never) as { simdjsonUsed: boolean; totalLines: number; accepted: { envelope: { typedEvidenceChecksum: string }; payload: { class: string } }[]; rejected: { code: string }[] };
  simdUsedAll &&= rep.simdjsonUsed;
  accepted += rep.accepted.length; rejected += rep.rejected.length;
  for (const a of rep.accepted) { byClass[a.payload.class] = (byClass[a.payload.class] ?? 0) + 1; envelopeChecksums.push(a.envelope.typedEvidenceChecksum); }
  for (const r of rep.rejected) rejectCodes[r.code] = (rejectCodes[r.code] ?? 0) + 1;
  perShard.push({ path: s.path, checksumOk, lines: rep.totalLines, accepted: rep.accepted.length, rejected: rep.rejected.length, simdjsonUsed: rep.simdjsonUsed });
}
const expected = manifest.totalRows as number;
const pass = accepted === expected && rejected === 0 && shardChecksumMismatch === 0;
const receipt = {
  schema: 'atlas.summary-census-typed-evidence-receipt.v1', status: pass ? 'TYPED_EVIDENCE_PROVEN' : 'NOT_PROVEN', canonicalAuthority: false,
  shardSet: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), rootChecksum: manifest.rootChecksum, expectedRows: expected, accepted, rejected, rejectCodes, shardChecksumMismatch,
  simdjsonUsedAllShards: simdUsedAll, byClass, typedRootChecksum: sha(envelopeChecksums.join(String.fromCharCode(10))), perShard,
  databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, generatedAt: new Date().toISOString(),
};
const out = path.join(REPO_ROOT, 'docs/reports/summary-census-typed-evidence-v1.json');
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + String.fromCharCode(10));
console.log(JSON.stringify({ ...receipt, perShard: undefined }, null, 1));
