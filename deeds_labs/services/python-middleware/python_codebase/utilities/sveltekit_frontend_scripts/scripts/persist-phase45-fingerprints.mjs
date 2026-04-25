#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import Redis from 'ioredis';

const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function ensureQdrantCollection(baseUrl, coll, dim) {
  const base = baseUrl.replace(/\/+$/, '');
  const target = `${base}/collections/${coll}`;
  const createPayload = { vectors: { size: dim, distance: 'Cosine' } };

  const putResp = await fetch(target, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload)
  });

  if (putResp.ok || putResp.status === 409) {
    return true;
  }

  const altResp = await fetch(`${base}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: coll, ...createPayload })
  });

  return altResp.ok || altResp.status === 409;
}

async function main() {
  const p = path.resolve('logs','phase45-points.json');
  if (!fs.existsSync(p)) {
    console.error('No fingerprints file found at', p);
    process.exit(1);
  }
  const points = JSON.parse(fs.readFileSync(p,'utf8'));
  if (!points.length) { console.log('No points to persist'); return; }

  // Qdrant upsert
  try {
    const coll = 'phase44_fingerprints';
    await ensureQdrantCollection(qdrantUrl, coll, points[0].vector.length);
    const up = await fetch(`${qdrantUrl}/collections/${coll}/points?wait=true`, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ points })
    });
    if (up.ok) console.log('Upserted', points.length, 'points to Qdrant at', qdrantUrl);
    else console.error('Qdrant upsert failed', await up.text());
  } catch(e) { console.error('Qdrant error', e.message); }

  // Redis store (key: phase45:fp:{id}) store payload and thumbnail vector as base64
  try {
    const redis = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD || undefined
    });
    for (const pnt of points) {
      const key = `phase45:fp:${pnt.id}`;
      const file = pnt.payload?.file || '';
      const issuesFixed = String(pnt.payload?.issuesFixed || 0);
      const payload = JSON.stringify(pnt.payload || {});

      await redis.call('HSET', key, 'file', file, 'issuesFixed', issuesFixed, 'payload', payload);
      // store vector as JSON string
      await redis.set(`${key}:vector`, JSON.stringify(pnt.vector));
    }
    console.log('Saved', points.length, 'fingerprints to Redis at', redisUrl);
    await redis.quit();
  } catch(e) { console.error('Redis error', e.message); }
}

main().catch(err=>{ console.error(err); process.exit(1); });
