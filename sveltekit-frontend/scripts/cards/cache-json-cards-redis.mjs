#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { stableHash } from '../index/shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const TTL_SECONDS = Number(process.env.CARDS_REDIS_TTL_SECONDS ?? 60 * 60 * 6);

function rel(file) {
  return path.join(ROOT, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(rel(file), 'utf8'));
}

function readCardBundle() {
  const selectedPath = rel('memory/cards/selected-cards.json');
  if (!fs.existsSync(selectedPath)) {
    throw new Error('missing memory/cards/selected-cards.json; run cards:build first');
  }
  return readJson('memory/cards/selected-cards.json');
}

function cardScore(card) {
  const scores = card?.scores ?? {};
  return Number(scores.rank ?? scores.memberCount ?? scores.authority ?? scores.directFanOut ?? 0);
}

function redisCardKey(card) {
  const suffix = String(card?.id ?? '').replace(new RegExp(`^${String(card?.kind ?? '')}:`), '');
  return `card:${card.kind}:${suffix || stableHash(JSON.stringify(card ?? {}))}`;
}

const bundle = readCardBundle();
const cards = Array.isArray(bundle.cards) ? bundle.cards : [];
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  enableReadyCheck: false,
});

try {
  await redis.ping();
  const pipeline = redis.pipeline();
  const hotIndex = [];

  for (const card of cards) {
    const key = redisCardKey(card);
    const summary = String(card.summary ?? '').slice(0, 500);
    const json = JSON.stringify(card);
    const score = cardScore(card);

    pipeline.set(key, summary, 'EX', TTL_SECONDS);
    pipeline.set(`${key}:json`, json, 'EX', TTL_SECONDS);
    pipeline.set(`${key}:hash`, card.hash ?? stableHash(json), 'EX', TTL_SECONDS);
    pipeline.zadd(`card:index:${card.kind}`, score, key);
    hotIndex.push({ key, kind: card.kind, score });

    if (card.kind === 'memory') {
      pipeline.zadd('card:memory:recent', score || Date.now(), key);
    }
  }

  pipeline.set('card:bundle:summary', JSON.stringify({
    generatedAt: bundle.generatedAt,
    count: cards.length,
    sourceSummary: bundle.sourceSummary ?? {},
  }), 'EX', TTL_SECONDS);

  await pipeline.exec();
  console.log(JSON.stringify({
    ok: true,
    redis: REDIS_URL,
    ttlSeconds: TTL_SECONDS,
    cards: cards.length,
    keys: hotIndex.slice(0, 8),
  }, null, 2));
} finally {
  await redis.quit().catch(() => {});
}
