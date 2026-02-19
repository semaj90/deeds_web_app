#!/usr/bin/env node
/**
 * Minimal integration test for MinIO and Redis for the dev stack.
 * Uses ESM imports because the project package.json sets "type": "module".
 */
import { Client as MinioClient } from 'minio';
import { createClient as createRedisClient } from 'redis';
import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

function getEnv(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function testMinio() {
  const endpoint = getEnv('MINIO_ENDPOINT', 'localhost');
  const port = parseInt(process.env.MINIO_PORT || '9000', 10);
  // prefer container root creds if provided
  const access = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const secret = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin';
  const bucket = process.env.MINIO_BUCKET || 'evidence';

  const client = new MinioClient({
    endPoint: endpoint,
    port,
    useSSL: process.env.MINIO_USE_SSL === 'true' || false,
    accessKey: access,
    secretKey: secret,
  });

  console.log('MinIO: checking bucket', bucket);
  try {
    let exists = false;
    try {
      exists = await client.bucketExists(bucket);
    } catch (err) {
      // some MinIO versions throw on bucketExists when auth is wrong; rethrow with hint
      throw new Error(
        `bucketExists failed: ${err.message}. Hint: check MINIO_ROOT_USER / MINIO_ROOT_PASSWORD match the running container`
      );
    }
    if (!exists) {
      console.log('Bucket does not exist, creating:', bucket);
      await client.makeBucket(bucket);
    } else {
      console.log('Bucket exists');
    }

    const testKey = `test-upload-${Date.now()}.txt`;
    const body = 'hello from integration test';
    await client.putObject(bucket, testKey, body);
    console.log('MinIO: uploaded', testKey);

    const stream = await client.getObject(bucket, testKey);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const downloaded = Buffer.concat(chunks).toString('utf8');
    console.log('MinIO: downloaded content:', downloaded.slice(0, 200));

    // cleanup
    await client.removeObject(bucket, testKey);
    console.log('MinIO: removed test object');
    return true;
  } catch (err) {
    console.error('MinIO test failed:', err.message || err);
    return false;
  }
}

async function testRedis() {
  const url = getEnv('REDIS_URL', 'redis://localhost:6379');
  console.log('Redis: connecting to', url);
  const client = createRedisClient({ url });
  client.on('error', (e) => console.error('Redis client error', e.message || e));
  await client.connect();
  try {
    const pong = await client.ping();
    console.log('Redis PING ->', pong);
    await client.set('test:minio:redis', 'ok', { EX: 10 });
    const v = await client.get('test:minio:redis');
    console.log('Redis GET ->', v);
    await client.del('test:minio:redis');
    await client.quit();
    return true;
  } catch (err) {
    console.error('Redis test failed:', err.message || err);
    try {
      await client.quit();
    } catch (e) {}
    return false;
  }
}

async function testPostgres() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.log('POSTGRES_URL not set; skipping Postgres check');
    return true;
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name = 'documents' ORDER BY column_name;`
    );
    console.log('Postgres documents table rows:', res.rowCount);
    if (res.rowCount) console.table(res.rows.slice(0, 50));
    await client.end();
    return true;
  } catch (err) {
    console.error('Postgres check failed:', err.message || err);
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

(async function main() {
  try {
    const m = await testMinio();
    const r = await testRedis();
    const p = await testPostgres();
    const ok = m && r && p;
    console.log('\nRESULTS: MinIO=', m, ' Redis=', r, ' Postgres=', p);
    process.exit(ok ? 0 : 2);
  } catch (err) {
    console.error(err);
    process.exit(3);
  }
})();
