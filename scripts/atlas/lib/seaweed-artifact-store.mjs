#!/usr/bin/env node
/**
 * seaweed-artifact-store.mjs
 *
 * Minimal, reusable SeaweedFS S3 backup helper for standalone Node scripts
 * (export/audit/training scripts under scripts/atlas/), which run outside
 * SvelteKit's env loading and can't import env.server.ts directly.
 *
 * Wraps the same live SeaweedFS S3 gateway the canonical app-side client
 * (sveltekit-frontend/src/lib/server/storage/seaweed.ts) talks to — same
 * protocol (AWS S3 SDK, path-style), same credentials, same gateway. This is
 * NOT a second S3 client implementation to maintain in parallel: it exists
 * only because scripts/atlas/*.mjs scripts have no access to SvelteKit's
 * private env module. If a future refactor exposes env.server.ts's resolved
 * config to standalone scripts, this file's config loading (not its S3 calls)
 * is what should be replaced.
 *
 * Built 2026-09-09 after docs/reports/xgboost-features.csv (101,708 rows) was
 * destroyed by an --apply re-run with no backup and no way to recover it —
 * see openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md for the
 * incident record. Bucket: atlas-artifacts (created live via the filer this
 * same session; distinct from "legal-evidence" case-evidence storage and the
 * pre-existing, unwired "atlas-web-sources" bucket).
 *
 * Usage (as a library):
 *   import { backupArtifact, restoreArtifact } from './lib/seaweed-artifact-store.mjs';
 *   await backupArtifact('docs/reports/xgboost-features.csv', 'xgboost/xgboost-features.csv');
 *
 * Usage (CLI):
 *   node scripts/atlas/lib/seaweed-artifact-store.mjs backup <localPath> [<remoteKey>]
 *   node scripts/atlas/lib/seaweed-artifact-store.mjs restore <remoteKey> <localPath>
 *   node scripts/atlas/lib/seaweed-artifact-store.mjs list [<prefix>]
 */
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { loadRepoEnv, REPO_ROOT } from '../connection-config.mjs';

const env = loadRepoEnv(process.env);
const BUCKET = env.SEAWEED_S3_BUCKET || 'atlas-artifacts';
const ENDPOINT = env.SEAWEED_S3_ENDPOINT || `http://${env.SEAWEED_ENDPOINT || 'localhost'}:${env.SEAWEED_S3_PORT || '8333'}`;

const client = new S3Client({
  region: env.SEAWEED_S3_REGION || 'us-east-1',
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.SEAWEED_ACCESS_KEY || 'minio',
    secretAccessKey: env.SEAWEED_SECRET_KEY || 'minio123',
  },
});

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Uploads a local file to atlas-artifacts, keyed by remoteKey (defaults to the
 * basename). Returns the SHA-256 of the uploaded bytes and the S3 ETag, so a
 * caller can independently verify the round-trip rather than trusting success.
 */
export async function backupArtifact(localPath, remoteKey, { bucket = BUCKET, metadata = {} } = {}) {
  const absPath = resolve(REPO_ROOT, localPath);
  const bytes = readFileSync(absPath);
  const key = remoteKey || basename(absPath);
  const sha256 = sha256Hex(bytes);
  const result = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bytes,
    Metadata: { ...metadata, 'sha256': sha256, 'backed-up-at': new Date().toISOString() },
  }));
  return { bucket, key, bytes: bytes.length, sha256, etag: result.ETag ?? null };
}

/** Downloads an object from atlas-artifacts to a local path. Verifies SHA-256 if metadata carries one. */
export async function restoreArtifact(remoteKey, localPath, { bucket = BUCKET } = {}) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: remoteKey }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const claimedSha256 = response.Metadata?.sha256;
  const actualSha256 = sha256Hex(bytes);
  const shaVerified = claimedSha256 ? claimedSha256 === actualSha256 : null;
  const absPath = resolve(REPO_ROOT, localPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, bytes);
  return { bucket, key: remoteKey, bytes: bytes.length, sha256: actualSha256, shaVerified };
}

export async function listArtifacts(prefix = '', { bucket = BUCKET } = {}) {
  const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (response.Contents ?? []).map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified }));
}

export async function headArtifact(remoteKey, { bucket = BUCKET } = {}) {
  const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: remoteKey }));
  return { contentLength: response.ContentLength ?? 0, metadata: response.Metadata ?? {}, etag: response.ETag ?? null };
}

async function main() {
  const [cmd, a1, a2] = process.argv.slice(2);
  if (cmd === 'backup') {
    const result = await backupArtifact(a1, a2);
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'restore') {
    const result = await restoreArtifact(a1, a2);
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'list') {
    const result = await listArtifacts(a1 ?? '');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('Usage: seaweed-artifact-store.mjs <backup|restore|list> ...');
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('seaweed-artifact-store.mjs')) {
  main();
}
