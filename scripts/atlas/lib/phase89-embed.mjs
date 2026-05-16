// sveltekit-frontend/scripts/lib/phase89-embed.mjs
import ollama from "ollama";
import { getJson, setJson, sha256 } from "./phase89-cache.mjs";

/**
 * Get embedding with Redis cache
 * Uses stable hash key: emb:<model>:<sha256(text)>
 */
export async function embedCached({ rds, text, model, ollamaUrl }) {
  const key = `emb:${model}:${sha256(text)}`;
  const cached = await getJson(rds, key);

  if (cached?.embedding?.length) {
    return cached.embedding;
  }

  // Generate new embedding using ollama
  const response = await ollama.embeddings({
    model,
    prompt: text
  });

  const embedding = response.embedding;

  // Cache for 7 days
  await setJson(rds, key, { embedding, model, timestamp: Date.now() }, 60 * 60 * 24 * 7);

  return embedding;
}

/**
 * Batch embed with cache (for bulk processing)
 */
export async function embedBatchCached({ rds, texts, model, ollamaUrl, onProgress }) {
  const results = [];
  let cacheHits = 0;

  for (let i = 0; i < texts.length; i++) {
    const embedding = await embedCached({ rds, text: texts[i], model, ollamaUrl });
    results.push(embedding);

    // Check if it was a cache hit (quick heuristic: < 10ms)
    if (onProgress) {
      onProgress({ index: i, total: texts.length, cacheHits });
    }
  }

  return { embeddings: results, cacheHits };
}
