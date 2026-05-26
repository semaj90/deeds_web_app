#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVELTEKIT_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SVELTEKIT_DIR, '..');
const OUTPUTS_DIR = path.join(REPO_ROOT, 'memory', 'knowledge');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function readJson(p) {
	const raw = await fs.readFile(p, 'utf8');
	return JSON.parse(raw);
}

async function main() {
	const manifestPath = path.join(OUTPUTS_DIR, 'document-knowledge-embed-manifest.json');
	const cardsPath = path.join(OUTPUTS_DIR, 'document-knowledge-cards.jsonl');

	if (!existsSync(manifestPath)) {
		throw new Error(`Missing embed manifest: ${manifestPath}`);
	}

	const manifest = await readJson(manifestPath);
	const cards = existsSync(cardsPath)
		? (await fs.readFile(cardsPath, 'utf8')).split(/\r?\n/).filter(Boolean)
		: [];

	const redis = new Redis(REDIS_URL, {
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		connectTimeout: 3000,
	});
	await redis.connect();

	const firstCard = cards.length > 0 ? JSON.parse(cards[0]) : null;
	const redisKey = firstCard ? `knowledge:card:${firstCard.cardId}` : null;
	const redisValue = redisKey ? await redis.get(redisKey) : null;
	const qdrantRes = await fetch(`${QDRANT_URL}/collections/document_knowledge_768`, {
		signal: AbortSignal.timeout(5000),
	});
	const qdrantInfo = qdrantRes.ok ? await qdrantRes.json() : null;
	await redis.quit();

	const output = {
		ok: Boolean(manifest?.embeddedCount > 0 && qdrantInfo?.result),
		manifest,
		first_card_key: redisKey,
		first_card_cached: Boolean(redisValue),
		qdrant_collection: qdrantInfo?.result?.status ?? null,
		qdrant_points: qdrantInfo?.result?.points_count ?? null,
		qdrant_vectors: qdrantInfo?.result?.config?.params?.vectors ? 'present' : null,
	};

	console.log(JSON.stringify(output, null, 2));
	if (!output.ok) process.exitCode = 1;
}

main().catch((error) => {
	console.error('[knowledge:documents:embed:smoke] Fatal:', error);
	process.exitCode = 2;
});
