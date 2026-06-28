#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { loadAtlasEnvFiles, getRedisPassword } from '../../scripts/atlas/lib/redis-valkey.mjs';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

function sha1(value) {
  return createHash('sha1').update(value).digest('hex');
}

function uniq(values) {
  return [...new Set(values.filter((v) => typeof v === 'string' && v.trim().length > 0))];
}

function readJsonlSyncSafe(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const cardsPath = path.join(knowledgeDir, 'document-knowledge-cards.langext.jsonl');
const edgesPath = path.join(knowledgeDir, 'document-knowledge-edges.jsonl');
const reportPath = path.join(knowledgeDir, 'document-knowledge-report.json');
const packetsPath = path.join(knowledgeDir, 'document-knowledge-packets.jsonl');
const manifestPath = path.join(knowledgeDir, 'document-knowledge-synthesis-manifest.json');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function main() {
  if (!existsSync(cardsPath)) {
    throw new Error(`Missing enriched cards file: ${cardsPath}`);
  }

  const mergedEnv = await loadAtlasEnvFiles(cwd, ['.env', '.env.local']);
  const redisPassword = getRedisPassword({ ...mergedEnv, ...process.env });
  const cards = readJsonlSyncSafe(await fs.readFile(cardsPath, 'utf8'));
  const edges = existsSync(edgesPath) ? readJsonlSyncSafe(await fs.readFile(edgesPath, 'utf8')) : [];
  const report = existsSync(reportPath) ? JSON.parse(await fs.readFile(reportPath, 'utf8')) : null;

  const cardById = new Map(cards.map((card) => [card.cardId, card]));
  const adjacency = new Map();
  for (const edge of edges) {
    const left = cardById.get(edge.sourceId);
    const right = cardById.get(edge.targetId);
    if (!left || !right) continue;
    const leftList = adjacency.get(left.cardId) ?? [];
    const rightList = adjacency.get(right.cardId) ?? [];
    leftList.push({ cardId: right.cardId, relation: edge.relation, reason: edge.reason });
    rightList.push({ cardId: left.cardId, relation: edge.relation, reason: edge.reason });
    adjacency.set(left.cardId, leftList);
    adjacency.set(right.cardId, rightList);
  }

  const packets = cards.map((card) => {
    const lifecycle = card.lifecycle ?? { status: 'active', confidence: 0.5, reason: '' };
    const neighbors = (adjacency.get(card.cardId) ?? []).slice(0, 5);
    const summary = [
      `${card.title ?? 'untitled'} (${card.kind ?? 'json-card'})`,
      card.summary ?? '',
      card.featureLabels?.length ? `features: ${card.featureLabels.join(', ')}` : '',
      card.clusterTags?.length ? `clusters: ${card.clusterTags.join(', ')}` : '',
      neighbors.length
        ? `neighbors: ${neighbors.map((n) => `${n.relation}:${n.cardId}`).join(', ')}`
        : '',
      `status: ${lifecycle.status}`,
      lifecycle.reason ? `reason: ${lifecycle.reason}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const nextAction =
      lifecycle.status === 'candidate_prune'
        ? 'review for deletion or replacement'
        : lifecycle.status === 'archive_to_deeds_lab'
          ? 'move to deeds_lab if needed as a reference artifact'
          : lifecycle.status === 'production_ready'
            ? 'keep in active atlas exports and startup smokes'
            : 'keep in active review';

    return {
      packetId: sha1(`${card.cardId}:${lifecycle.status}:${summary}`),
      cardId: card.cardId,
      kind: card.kind ?? 'json-card',
      title: card.title ?? 'untitled',
      summary: card.summary ?? '',
      aceSummary: summary,
      sourceRefs: uniq(card.sourceRefs ?? []),
      chunkIds: uniq(card.chunkIds ?? []),
      summaryIds: uniq(card.summaryIds ?? []),
      featureLabels: uniq(card.featureLabels ?? []),
      clusterTags: uniq(card.clusterTags ?? []),
      graphNeighbors: neighbors,
      retrieval: {
        ...(card.retrieval ?? {}),
        redisKey: `knowledge:card:${card.cardId}`,
        qdrantPointId: String(card.retrieval?.qdrantPointId ?? sha1(card.cardId).slice(0, 12)),
      },
      lifecycle,
      nextAction,
      llmSynthesis: {
        promptCartridge: summary,
        agenticThinking: nextAction,
      },
      createdAt: new Date().toISOString(),
    };
  });

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.writeFile(packetsPath, packets.map((packet) => JSON.stringify(packet)).join('\n') + '\n', 'utf8');

  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    ...(redisPassword ? { password: redisPassword } : {}),
  });
  await redis.connect();
  await redis.set(
    'knowledge:document-knowledge:latest',
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      packets: packets.length,
      reportCards: report?.counts?.cards ?? cards.length,
      report,
    })
  );
  await redis.set(
    'knowledge:document-knowledge:packets:latest',
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      packets: packets.length,
      packetIds: packets.slice(0, 20).map((packet) => packet.packetId),
    })
  );
  for (const packet of packets) {
    await redis.set(`knowledge:packet:${packet.cardId}`, JSON.stringify(packet));
  }
  await redis.quit();

  const manifest = {
    generatedAt: new Date().toISOString(),
    cards: cards.length,
    edges: edges.length,
    packets: packets.length,
    report: report ? { cards: report.counts?.cards ?? cards.length } : null,
    packetIds: packets.map((packet) => packet.packetId),
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        packets_built: packets.length,
        redis_keys: ['knowledge:document-knowledge:latest', 'knowledge:document-knowledge:packets:latest'],
        output: packetsPath,
        manifest: manifestPath,
        next_exact_command: '/knowledge-consolidate build Document Knowledge Layer from parent atlas cards, sidecar audit, Redis/NES cards, and produce prune/archive recommendations',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[knowledge:documents:synthesize] Fatal:', error);
  process.exitCode = 2;
});
