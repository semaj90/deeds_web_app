#!/usr/bin/env node
// LAKE_ROUNDTRIP_SMOKE: upload one derived Parquet + a checksummed manifest to a NEW dev bucket on SeaweedFS S3, read both back, compare SHA-256.
// Dry run by default; --apply performs the writes. Never deletes or overwrites; refuses the legal-app evidence bucket; prints no credentials.
// Usage: node scripts/atlas/lake-roundtrip-smoke-v1.mjs --parquet=<file> [--apply]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const apply = process.argv.includes('--apply');
const parquetPath = arg('parquet', null);
const BUCKET = 'atlas-lake-dev';
const DATASET = 'source_file_inventory';
const SCOPE = 'sveltekit-frontend';
if (!parquetPath || !fs.existsSync(parquetPath)) { console.error('PARQUET_REQUIRED'); process.exit(2); }

const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.join(root, 'sveltekit-frontend/.env')), ...process.env };
for (const k of ['SEAWEED_ACCESS_KEY', 'SEAWEED_SECRET_KEY']) if (!env[k]) { console.error(`MISSING_ENV ${k}`); process.exit(2); }
if (BUCKET === env.SEAWEED_S3_BUCKET) { console.error('REFUSED: target bucket equals the configured evidence bucket'); process.exit(2); }
let endpoint = env.SEAWEED_S3_ENDPOINT || env.SEAWEED_ENDPOINT || '127.0.0.1';
if (!/^https?:\/\//.test(endpoint)) endpoint = `http://${endpoint}`;
if (!/:\d+$/.test(endpoint)) endpoint = `${endpoint}:${env.SEAWEED_S3_PORT || '8333'}`;

const body = fs.readFileSync(parquetPath);
const snapshot = new Date().toISOString().replace(/[:.]/g, '-');
const prefix = `v1/${DATASET}/scope=${SCOPE}/snapshot=${snapshot}`;
const dataKey = `${prefix}/part-0000.parquet`;
const manifestKey = `${prefix}/_manifest.json`;
const manifest = {
  schema: 'atlas.lake-manifest.v1', dataset: DATASET, scope: SCOPE, snapshot, format: 'parquet', compression: 'zstd',
  files: [{ key: dataKey, bytes: body.length, sha256: sha(body) }],
  source: 'filesystem inventory of sveltekit-frontend/src (path, extension, byte length, SHA-256 only; no file contents)',
  derived: true, canonicalAuthority: false, writer: 'scripts/atlas/lake-roundtrip-smoke-v1.mjs',
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const plan = { mode: apply ? 'APPLY' : 'DRY_RUN', bucket: BUCKET, dataKey, manifestKey, parquetBytes: body.length, parquetSha256: sha(body), manifestSha256: sha(manifestBytes), endpointHost: new URL(endpoint).host };
console.log(JSON.stringify(plan, null, 1));
if (!apply) process.exit(0);

const { S3Client, HeadBucketCommand, CreateBucketCommand, HeadObjectCommand, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = createRequire(path.join(root, 'sveltekit-frontend/package.json'))('@aws-sdk/client-s3');
const s3 = new S3Client({ endpoint, region: env.SEAWEED_S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: env.SEAWEED_ACCESS_KEY, secretAccessKey: env.SEAWEED_SECRET_KEY } });
const exists = async (cmd) => { try { await s3.send(cmd); return true; } catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey') return false; throw e; } };
const readBack = async (Key) => { const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key })); return Buffer.from(await r.Body.transformToByteArray()); };

const result = { bucketCreated: false };
if (!(await exists(new HeadBucketCommand({ Bucket: BUCKET })))) { await s3.send(new CreateBucketCommand({ Bucket: BUCKET })); result.bucketCreated = true; }
for (const [Key, Body, ContentType] of [[dataKey, body, 'application/vnd.apache.parquet'], [manifestKey, manifestBytes, 'application/json']]) {
  if (await exists(new HeadObjectCommand({ Bucket: BUCKET, Key }))) { console.error(`REFUSED: object already exists, not overwriting: ${Key}`); process.exit(3); }
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType }));
}
const backData = await readBack(dataKey); const backManifest = await readBack(manifestKey);
const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
console.log(JSON.stringify({ ...result, readback: { parquetSha256Equal: sha(backData) === plan.parquetSha256, manifestSha256Equal: sha(backManifest) === plan.manifestSha256, parquetBytes: backData.length }, listedKeys: (listed.Contents ?? []).map((o) => `${o.Key} (${o.Size})`), canonicalAuthority: false }, null, 1));
