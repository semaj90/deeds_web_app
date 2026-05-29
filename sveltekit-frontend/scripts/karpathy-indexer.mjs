/**
 * Karpathy Indexer Orchestrator
 *
 * Scans the codebase, groups files by directory, and runs the Karpathy Hook
 * to populate durable memory across Qdrant, Neo4j, Postgres, and CouchDB.
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { processKarpathyHook } from '../src/lib/server/indexer/karpathy-hook.js';
import { persistKarpathyHook } from '../src/lib/server/indexer/karpathy-persistence.js';
import { getOllamaEmbedding } from '../src/lib/server/ollama.js';
import { qdrant } from '../src/lib/server/vector/qdrant-manager.js';
import { upsertValidated } from '../../scripts/lib/upsert-validated.mjs';

const REPO_ROOT = process.cwd();
const BATCH_SIZE = 50; // Files per batch

async function getFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(entries.map((res) => {
		const resPath = path.resolve(dir, res.name);
		if (res.isDirectory()) {
			if (res.name === 'node_modules' || res.name === '.git' || res.name === '.svelte-kit' || res.name === 'dist') return [];
			return getFiles(resPath);
		}
		if (res.name.match(/\.(ts|js|svelte|md|py|go|cpp|h|cu)$/)) {
			return resPath;
		}
		return [];
	}));
	return files.flat();
}

async function runIndexer() {
	console.log(`[indexer] Starting Karpathy Indexing for ${REPO_ROOT}...`);
	const allFiles = await getFiles(path.join(REPO_ROOT, 'src'));
	console.log(`[indexer] Found ${allFiles.length} files to index.`);

	const runId = crypto.randomUUID();
	// use singleton qdrant manager
	// const qdrant = new QdrantManager();

	// Process in batches
	for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
		const batch = allFiles.slice(i, i + BATCH_SIZE);
		console.log(`[indexer] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFiles.length / BATCH_SIZE)}...`);

		const fileData = await Promise.all(batch.map(async (fp) => {
			const content = await fs.readFile(fp, 'utf-8');
			const hash = crypto.createHash('sha256').update(content).digest('hex');
			return {
				filePath: path.relative(REPO_ROOT, fp),
				content,
				contentHash: hash,
				graph: { pageRank: 0.1 } // Placeholder for actual graph signals
			};
		}));

		// 1. Run Karpathy Hook
		const output = await processKarpathyHook({
			repoRoot: REPO_ROOT,
			runId,
			source: 'watcher',
			files: fileData
		});

		// 2. Generate Embeddings for Qdrant (Since Hook doesn't do it)
		for (const payload of output.qdrantPayloads) {
			const chunk = output.chunks.find(c => c.id === payload.id);
			if (chunk) {
				const embedding = await getOllamaEmbedding(chunk.content);
				payload.vector = { content: embedding };
			}
		}

		// 3. Persist batch
		await persistKarpathyHook(output);

		// 4. Upsert to Qdrant (Bulk)
		if (output.qdrantPayloads.length > 0) {
			await upsertValidated({
        client: qdrant,
        collection: qdrant.collections.codebase_chunks,
        points: output.qdrantPayloads.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
        expectedDim: Number(process.env.EMBED_DIM ?? 768),
        wait: true,
      });
		}
	}

	console.log('[indexer] Indexing complete.');
}

runIndexer().catch(console.error);
