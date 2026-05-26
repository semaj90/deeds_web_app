#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVELTEKIT_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SVELTEKIT_DIR, '..');
const OUTPUTS_DIR = path.join(REPO_ROOT, 'memory', 'knowledge');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const SVELTEKIT_URL = process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const COLLECTION = 'document_knowledge_768';
const VECTOR_SIZE = 768;
const BATCH_SIZE = Number(process.env.KNOWLEDGE_EMBED_BATCH ?? 6);

function sha1(value) {
	return createHash('sha1').update(value).digest('hex');
}

async function readJsonl(filePath) {
	const raw = await fs.readFile(filePath, 'utf8');
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function normalizeSummary(card) {
	const title = card.title ?? card.name ?? card.cardId ?? 'untitled';
	const summary = card.summary ?? card.description ?? '';
	const entities = card.entities ?? {};
	const entityBits = [
		...(entities.files ?? []),
		...(entities.routes ?? []),
		...(entities.tables ?? []),
		...(entities.envVars ?? []),
		...(entities.services ?? []),
		...(entities.commands ?? []),
		...(entities.models ?? []),
	];
	return [
		`title: ${title}`,
		`kind: ${card.kind ?? 'json-card'}`,
		`summary: ${summary}`,
		card.topoClass ? `topoClass: ${card.topoClass}` : '',
		card.featureLabels?.length ? `features: ${card.featureLabels.join(', ')}` : '',
		card.clusterTags?.length ? `clusters: ${card.clusterTags.join(', ')}` : '',
		card.sourceRefs?.length ? `sources: ${card.sourceRefs.join(', ')}` : '',
		card.chunkIds?.length ? `chunks: ${card.chunkIds.join(', ')}` : '',
		entityBits.length ? `entities: ${entityBits.join(', ')}` : '',
	].filter(Boolean).join('\n');
}

async function checkSvelteKitEmbed() {
	try {
		const res = await fetch(`${SVELTEKIT_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
		return res.ok;
	} catch {
		return false;
	}
}

async function embedViaSvelteKit(text) {
	const res = await fetch(`${SVELTEKIT_URL}/api/embed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, model: EMBED_MODEL }),
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) throw new Error(`SvelteKit embed ${res.status}`);
	const data = await res.json();
	return data.embedding ?? data.embeddings?.[0] ?? null;
}

async function embedViaOllama(text) {
	const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) throw new Error(`Ollama embed ${res.status}`);
	const data = await res.json();
	return data.embedding ?? null;
}

async function embed(text) {
	if (await checkSvelteKitEmbed()) {
		try {
			return await embedViaSvelteKit(text);
		} catch {
			// fall through to Ollama
		}
	}
	return embedViaOllama(text);
}

async function ensureCollection() {
	const check = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
		signal: AbortSignal.timeout(5000),
	});
	if (check.ok) return;

	const create = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
			hnsw_config: { m: 16, ef_construct: 200 },
			quantization_config: {
				scalar: { type: 'int8', quantile: 0.99, always_ram: false },
			},
			on_disk_payload: true,
		}),
		signal: AbortSignal.timeout(10000),
	});
	if (!create.ok) {
		const body = await create.text();
		throw new Error(`Create collection ${COLLECTION}: ${create.status} ${body.slice(0, 200)}`);
	}
}

async function upsertPoints(points) {
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ points }),
		signal: AbortSignal.timeout(30000),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Qdrant upsert ${res.status}: ${body.slice(0, 200)}`);
	}
}

function pointId(cardId) {
	const hash = createHash('md5').update(cardId).digest();
	const raw = hash.readUInt32BE(0);
	return raw % 2147483648;
}

function normalizePoint(card, vector, embeddedText) {
	const queryHash = sha1(`${card.title ?? ''}\n${card.summary ?? ''}\n${(card.featureLabels ?? []).join('|')}`);
	const payload = {
		cardId: card.cardId,
		kind: card.kind ?? 'json-card',
		title: card.title ?? '',
		summary: card.summary ?? '',
		sourceRefs: card.sourceRefs ?? [],
		chunkIds: card.chunkIds ?? [],
		summaryIds: card.summaryIds ?? [],
		featureLabels: card.featureLabels ?? [],
		clusterTags: card.clusterTags ?? [],
		topoClass: card.topoClass ?? null,
		entities: card.entities ?? {},
		graphLinks: card.graphLinks ?? [],
		lifecycle: card.lifecycle ?? { status: 'active', confidence: 0.5, reason: '' },
		retrieval: {
			redisKey: `knowledge:card:${card.cardId}`,
			qdrantPointId: String(pointId(card.cardId)),
			embeddingModel: EMBED_MODEL,
			embeddingDim: VECTOR_SIZE,
			score: card.retrieval?.score ?? 1,
		},
		queryHash,
		embeddedText,
		commands: card.entities?.commands ?? [],
	};
	return {
		id: pointId(card.cardId),
		vector,
		payload,
	};
}

async function main() {
	const inputPath = path.join(OUTPUTS_DIR, 'document-knowledge-cards.jsonl');
	const manifestPath = path.join(OUTPUTS_DIR, 'document-knowledge-embed-manifest.json');
	if (!existsSync(inputPath)) {
		throw new Error(`Missing cards file: ${inputPath}`);
	}

	const cards = await readJsonl(inputPath);
	if (cards.length === 0) {
		throw new Error(`No cards found in ${inputPath}`);
	}

	const redis = new Redis(REDIS_URL, {
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		connectTimeout: 3000,
	});
	await redis.connect();

	const qdrantReady = await ensureCollection().then(() => true).catch((err) => {
		throw err;
	});
	if (!qdrantReady) {
		throw new Error('Qdrant collection initialization failed');
	}

	const points = [];
	const errors = [];
	let embeddedCount = 0;
	let redisWrites = 0;

	for (let i = 0; i < cards.length; i += BATCH_SIZE) {
		const batch = cards.slice(i, i + BATCH_SIZE);
		for (const card of batch) {
			try {
				const embeddedText = normalizeSummary(card);
				const vector = await embed(embeddedText);
				if (!Array.isArray(vector) || vector.length !== VECTOR_SIZE) {
					throw new Error(`Invalid embedding length: ${vector?.length ?? 'null'}`);
				}

				points.push(normalizePoint(card, vector, embeddedText));
				embeddedCount += 1;

				const cardKey = `knowledge:card:${card.cardId}`;
				const cardValue = {
					cardId: card.cardId,
					kind: card.kind ?? 'json-card',
					title: card.title ?? '',
					summary: card.summary ?? '',
					sourceRefs: card.sourceRefs ?? [],
					featureLabels: card.featureLabels ?? [],
					clusterTags: card.clusterTags ?? [],
					lifecycle: card.lifecycle ?? { status: 'active', confidence: 0.5, reason: '' },
					qdrantPointId: String(pointId(card.cardId)),
					collection: COLLECTION,
					updatedAt: new Date().toISOString(),
				};
				await redis.set(cardKey, JSON.stringify(cardValue));
				redisWrites += 1;

				const queryHash = sha1(`${card.title ?? ''}\n${card.summary ?? ''}\n${(card.featureLabels ?? []).join('|')}`);
				await redis.set(
					`knowledge:query:${queryHash}`,
					JSON.stringify({
						cardId: card.cardId,
						qdrantPointId: String(pointId(card.cardId)),
						redisKey: cardKey,
						title: card.title ?? '',
						summary: card.summary ?? '',
						featureLabels: card.featureLabels ?? [],
					})
				);
				redisWrites += 1;

				for (const label of card.featureLabels ?? []) {
					await redis.sadd(`knowledge:feature:${label}`, card.cardId);
					redisWrites += 1;
				}

				switch (card.lifecycle?.status) {
					case 'candidate_prune':
						await redis.sadd('knowledge:prune:candidates', card.cardId);
						redisWrites += 1;
						break;
					case 'archive_to_deeds_lab':
						await redis.sadd('knowledge:archive:deeds_lab', card.cardId);
						redisWrites += 1;
						break;
					case 'production_ready':
						await redis.sadd('knowledge:production_ready', card.cardId);
						redisWrites += 1;
						break;
				}
			} catch (error) {
				errors.push({ cardId: card.cardId, error: error instanceof Error ? error.message : String(error) });
			}
		}

		if (points.length > 0) {
			await upsertPoints(points.splice(0, points.length));
		}
	}

	const collectionInfo = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(async (res) => {
		if (!res.ok) return null;
		return res.json();
	}).catch(() => null);

	const manifest = {
		generatedAt: new Date().toISOString(),
		collection: COLLECTION,
		model: EMBED_MODEL,
		vectorSize: VECTOR_SIZE,
		inputCards: cards.length,
		embeddedCount,
		redisWrites,
		qdrantPoints: embeddedCount,
		collectionInfo,
		errors,
	};

	await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
	await redis.set('knowledge:document-knowledge:latest', JSON.stringify(manifest));
	await redis.quit();

	console.log(JSON.stringify({
		collection: COLLECTION,
		input_cards: cards.length,
		embedded_count: embeddedCount,
		redis_writes: redisWrites,
		errors: errors.length,
		manifest: manifestPath,
	}, null, 2));

	if (embeddedCount === 0) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error('[knowledge:documents:embed] Fatal:', error);
	process.exitCode = 2;
});
