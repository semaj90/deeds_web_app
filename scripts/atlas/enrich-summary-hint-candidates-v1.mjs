#!/usr/bin/env node
/**
 * SUMMARY-NLP-01: bounded, artifact-only local NLP over clean legacy HINT summaries.
 * Uses :8095 /analyze with no grounded/LLM pass; does not promote identity or trust.
 * Usage: node scripts/atlas/enrich-summary-hint-candidates-v1.mjs --dir=<sealed census> --out-dir=<new dir> [--limit=64] [--concurrency=4]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

const root = path.resolve(import.meta.dirname, '../..');
const args = new Map(process.argv.slice(2).map((arg) => { const i = arg.indexOf('='); return i < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, i), arg.slice(i + 1)]; }));
const sha = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const dir = args.get('dir') && path.resolve(root, args.get('dir'));
const outDir = args.get('out-dir') && path.resolve(root, args.get('out-dir'));
const limit = Math.max(1, Math.min(256, Number(args.get('limit') ?? 64)));
const concurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') ?? 4)));
if (!dir || !outDir) throw new Error('SEALED_CENSUS_DIR_AND_NEW_OUTPUT_DIR_REQUIRED');
const tmpRoot = path.resolve(root, '.tmp', 'atlas') + path.sep;
if (!outDir.startsWith(tmpRoot) || fs.existsSync(outDir)) throw new Error('OUTPUT_MUST_BE_NEW_DIRECTORY_UNDER_TMP_ATLAS');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const noWrites = manifest.writes && ['postgres', 'qdrant', 'valkey', 'rabbitmq', 'graphify'].every((key) => manifest.writes[key] === 0);
if (manifest.schema !== 'atlas.summary-search-census-manifest.v1' || manifest.status !== 'SEALED' || manifest.canonicalAuthority !== false || !noWrites) throw new Error('INPUT_CENSUS_NOT_SEALED_READ_ONLY');

const unique = new Map();
for (const shard of manifest.acceptedShards) {
  const file = path.join(dir, shard.path);
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (`sha256:${hash.digest('hex')}` !== shard.sha256) throw new Error(`INPUT_SHARD_CHECKSUM_MISMATCH:${shard.path}`);
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let rows = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows++;
    const row = JSON.parse(line);
    if (row.schema !== 'atlas.summary-search-census-row.v1' || row.canonicalAuthority !== false) throw new Error(`INPUT_ROW_SCHEMA_OR_AUTHORITY_INVALID:${shard.path}:${rows}`);
    if (row.summary?.qualityClean !== true || row.summary?.quarantined !== false || !['LEGACY_HINT_UNQUALIFIED', 'LEGACY_HINT_LINEAGE_BOUND'].includes(row.summary?.state)) continue;
    if (typeof row.summary.text !== 'string' || !row.summary.text.trim() || sha(row.summary.text) !== row.summary.digest) throw new Error(`INPUT_SUMMARY_DIGEST_MISMATCH:${row.identity?.chunkRowId}`);
    if (!unique.has(row.summary.digest)) unique.set(row.summary.digest, row);
  }
  if (rows !== shard.rows) throw new Error(`INPUT_SHARD_ROW_COUNT_MISMATCH:${shard.path}`);
}
if (unique.size < limit) throw new Error(`FILTERED_CANDIDATE_SHORTFALL:${unique.size}/${limit}`);
const selected = [...unique.values()].sort((a, b) => a.summary.digest.localeCompare(b.summary.digest)).slice(0, limit);
const healthResponse = await fetch('http://127.0.0.1:8095/health', { signal: AbortSignal.timeout(5000) });
if (!healthResponse.ok) throw new Error(`NLP_HEALTH_HTTP_${healthResponse.status}`);
const health = await healthResponse.json();
if (health.status !== 'ok') throw new Error('NLP_SIDECAR_NOT_READY');
const startedAt = new Date().toISOString();
const results = new Array(selected.length);
let next = 0;
async function worker() {
  while (next < selected.length) {
    const index = next++;
    const row = selected[index];
    const inputDigest = sha(row.summary.text);
    try {
      const response = await fetch('http://127.0.0.1:8095/analyze', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': `summary-hint-nlp-${index}` },
        body: JSON.stringify({ text: row.summary.text, source_type: 'plain_text', extraction_mode: 'entities', max_chars: 50_000, passes: [], grounded_extraction_required: false }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.entities) || typeof body.provider_revision !== 'string' || !body.provider_revision) throw new Error('RESPONSE_SCHEMA_INVALID');
      const entities = [];
      for (const entity of body.entities) {
        if (!Number.isInteger(entity.start) || !Number.isInteger(entity.end) || entity.start < 0 || entity.end <= entity.start || entity.end > row.summary.text.length || row.summary.text.slice(entity.start, entity.end) !== entity.text) throw new Error('ENTITY_SPAN_NOT_EXACTLY_GROUNDED');
        entities.push({ text: entity.text, label: entity.label, start: entity.start, end: entity.end, confidence: entity.confidence, producer: entity.source });
      }
      results[index] = {
        schema: 'atlas.summary-hint-nlp-proposal.v1', ordinal: row.ordinal, chunkRowId: row.identity.chunkRowId,
        sourceRef: row.identity.sourceRef ?? null, sourceRevision: row.identity.sourceRevision ?? null,
        summaryDigest: row.summary.digest, inputDigest, trustState: row.summary.state, canonicalAuthority: false,
        providerRevision: body.provider_revision, entities,
      };
    } catch (error) {
      results[index] = { schema: 'atlas.summary-hint-nlp-proposal.v1', ordinal: row.ordinal, chunkRowId: row.identity.chunkRowId, summaryDigest: row.summary.digest, inputDigest, trustState: row.summary.state, canonicalAuthority: false, status: 'REJECTED', reason: String(error?.message ?? error).slice(0, 180) };
    }
    console.log(`[${Math.floor((index + 1) * 100 / selected.length)}%] candidate=${index + 1}/${selected.length} status=${results[index].status ?? 'PROPOSED'}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
const proposed = results.filter((result) => result && !result.status).length;
const rejected = results.length - proposed;
fs.mkdirSync(path.dirname(outDir), { recursive: true });
fs.mkdirSync(outDir, { recursive: false });
const proposalPath = path.join(outDir, 'proposals.ndjson');
fs.writeFileSync(proposalPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, { flag: 'wx' });
const proposalSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(proposalPath)).digest('hex')}`;
const receipt = {
  schema: 'atlas.summary-hint-nlp-receipt.v1', status: rejected === 0 && proposed === limit ? 'PROPOSAL_REPLAY_COMPLETE' : 'PROPOSAL_REPLAY_PARTIAL',
  canonicalAuthority: false, promotionAuthorized: false, inputCensusRootChecksum: manifest.acceptedRootChecksum,
  limit, selectedUniqueCleanHintDigests: selected.length, proposed, rejected, concurrency,
  inputTrustStates: Object.fromEntries([...new Set(selected.map((row) => row.summary.state))].sort().map((state) => [state, selected.filter((row) => row.summary.state === state).length])),
  service: { endpoint: '127.0.0.1:8095/analyze', healthStatus: health.status, reportedRuntimeModel: health.model ?? null, groundedPassRequested: false, modelCalls: 0 },
  proposalPath: path.relative(root, proposalPath).replaceAll('\\', '/'), proposalSha256,
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 }, startedAt, completedAt: new Date().toISOString(),
};
const receiptPath = path.join(outDir, 'manifest.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, receiptPath: path.relative(root, receiptPath).replaceAll('\\', '/') }, null, 2));
process.exitCode = rejected === 0 ? 0 : 1;
