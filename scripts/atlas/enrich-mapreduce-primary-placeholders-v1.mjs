#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.find((x) => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourceDir = arg('source-dir');
const auditPath = arg('audit-report');
if (!sourceDir || !auditPath) throw new Error('SOURCE_DIR_AND_AUDIT_REPORT_REQUIRED');
const inputPath = path.resolve(root, sourceDir, 'primary_metadata_corpus-00001.ndjson');
const audit = JSON.parse(await readFile(path.resolve(root, auditPath), 'utf8'));
const manifest = JSON.parse(await readFile(path.resolve(root, sourceDir, 'manifest.json'), 'utf8'));
const bindingAudit = JSON.parse(await readFile(path.resolve(root, audit.sourceReport), 'utf8'));
const bindings = bindingAudit.contentDigestSourceBinding.verifiedBindings;
const packetBySource = new Map();
for (const p of audit.packetEvidence) {
  const key = `${p.sourceRef}\0${p.sourceRevision}`;
  const rows = packetBySource.get(key) ?? [];
  rows.push(p); packetBySource.set(key, rows);
}
const lineageBySource = new Map();
for (const l of audit.lineageEvidence) {
  const key = `${l.sourceRef}\0${l.sourceRevision}`;
  const rows = lineageBySource.get(key) ?? [];
  rows.push(l); lineageBySource.set(key, rows);
}
const byDigest = new Map(bindings.map((b) => [b.contentDigest, b]));
const input = await readFile(inputPath, 'utf8');
const rows = input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
if (rows.length !== manifest.artifacts[0]?.shards?.find((x) => x.path === 'primary_metadata_corpus-00001.ndjson')?.records) throw new Error('INPUT_ROW_COUNT_MISMATCH');
const enriched = rows.map((row) => {
  const b = byDigest.get(row.metadata?.contentHash);
  if (!b) return row;
  const key = `${b.canonicalSourceRef}\0${b.sourceRevision}`;
  const packets = packetBySource.get(key) ?? [];
  const lineages = lineageBySource.get(key) ?? [];
  const identity = { ...row.identity, sourceRef: b.canonicalSourceRef, sourceRevision: b.sourceRevision,
    workspaceRevision: b.workspaceRevision, lineageState: packets.length === 1
      ? 'SOURCE_BINDING_AND_PACKET_SOURCE_REVISION_MATCH_WORKSPACE_MIRROR_UNQUALIFIED'
      : 'CURRENT_SOURCE_BINDING_VERIFIED_PACKET_LINEAGE_UNAVAILABLE' };
  if (packets.length === 1) identity.packetKey = packets[0].packetKey;
  return { ...row, identity, indexedEvidence: {
    schema: 'atlas.mapreduce-indexed-evidence-hint.v1',
    sourceBinding: { status: 'CONTENT_AND_CURRENT_BYTES_VERIFIED', bindingChecksum: b.bindingChecksum,
      contentDigest: b.contentDigest, byteLength: b.byteLength, producerRevision: b.producerRevision },
    packet: { status: packets.length === 1 ? 'SOURCE_REVISION_MATCH_WORKSPACE_MIRROR_UNQUALIFIED' : packets.length ? 'AMBIGUOUS' : 'NOT_FOUND', count: packets.length,
      workspaceRevisions: packets.map((p) => p.packetWorkspaceRevision) },
    lineage: { status: lineages.length ? 'PROVEN_IN_PACKET_LINEAGE_TABLE_CHUNK_ROW_NOT_RESOLVED' : 'NOT_FOUND', count: lineages.length,
      canonicalChunkIds: [...new Set(lineages.map((l) => l.canonicalChunkId))], chunkRowIds: [...new Set(lineages.map((l) => l.chunkRowId))] },
    canonicalAuthority: false,
  } };
});
const enrichedLines = `${enriched.map((r) => JSON.stringify(r)).join('\n')}\n`;
const sha = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const outputRoot = path.join(root, '.tmp/atlas/mapreduce-primary-placeholder-enrichment-v1', new Date().toISOString().replaceAll(':','').replaceAll('-',''));
await mkdir(outputRoot, { recursive: true });
const outName = 'primary_metadata_corpus-enriched-00001.ndjson';
await writeFile(path.join(outputRoot, outName), enrichedLines);
const result = { schema: 'atlas.mapreduce-primary-placeholder-enrichment.v1', generatedAt: new Date().toISOString(),
  input: { path: path.relative(root,inputPath).replaceAll('\\','/'), rows: rows.length, sha256: sha(input) },
  sourceAudit: path.relative(root,path.resolve(root,auditPath)).replaceAll('\\','/'),
  output: { path: path.relative(root,path.join(outputRoot,outName)).replaceAll('\\','/'), rows: enriched.length, sha256: sha(enrichedLines) },
  counts: { rows: rows.length, sourceBindingEnriched: enriched.filter((r)=>r.indexedEvidence).length,
    packetKeyLinkedButWorkspaceMirrorUnqualified: enriched.filter((r)=>r.indexedEvidence?.packet.status==='SOURCE_REVISION_MATCH_WORKSPACE_MIRROR_UNQUALIFIED').length,
    lineageHintRows: enriched.filter((r)=>r.indexedEvidence?.lineage.count>0).length,
    canonicalChunkRowsResolved: 0, unresolvedPlaceholders: enriched.filter((r)=>!r.indexedEvidence).length,
    summaryTextPopulated: enriched.filter((r)=>r.summary?.text!=null).length },
  invariants: { canonicalIdentityMinted: false, canonicalAuthority: false, summaryAdmission: false,
    databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyProductionWiring: false } };
await writeFile(path.join(outputRoot,'manifest.json'),`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify({ outputDir:path.relative(root,outputRoot).replaceAll('\\','/'), ...result.counts, outputSha256:result.output.sha256, writes:0 },null,2));
