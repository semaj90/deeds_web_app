// One-shot: regenerate cluster 4 summary (AGENTS.md cluster — fallback stub only)
import { createClient } from 'redis';

const QDRANT = 'http://localhost:6333';
const OLLAMA = 'http://127.0.0.1:11434';
const MODEL  = process.env.ROTORQUANT_CHAT_MODEL ?? process.env.OLLAMA_CHAT_MODEL ?? 'gemma4-rotorquant:latest';
const CLUSTER_ID = 4;

const res = await fetch(`${QDRANT}/collections/codebase_chunks_768/points/scroll`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filter: { must: [{ key: 'som_cluster', match: { value: CLUSTER_ID } }] },
    limit: 12,
    with_payload: true,
    with_vector: false,
  }),
});
const { result } = await res.json();
const points = result?.points ?? [];
console.log(`[cluster ${CLUSTER_ID}] ${points.length} Qdrant chunks`);
if (points.length < 3) { console.log('Too small — skipping'); process.exit(0); }

const snippets = points.map((pt, i) => {
  const fp  = pt.payload?.file_path ?? pt.payload?.path ?? 'unknown';
  const txt = (pt.payload?.content ?? pt.payload?.chunk_text ?? '').slice(0, 300);
  return `[${i + 1}] ${fp}\n${txt}`;
}).join('\n\n');

const prompt = `You are analyzing a cluster of code and documentation files grouped by semantic similarity.
Cluster ID: ${CLUSTER_ID}

Representative file content:
${snippets}

Write a single 2-sentence technical summary of what this cluster of files is about.
Focus on the functional role and relationships, not individual files.
Be specific and concise. No bullet points.`;

const llmRes = await fetch(`${OLLAMA}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.2, num_predict: 512 },
  }),
});
if (!llmRes.ok) throw new Error(`Ollama ${llmRes.status}: ${await llmRes.text()}`);
const body = await llmRes.json();
const summary = (body.message?.content ?? body.response ?? '').trim();
console.log(`summary (${summary.length} chars): ${summary.slice(0, 120)}`);
if (summary.length < 40) throw new Error(`Too short: "${summary}"`);

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
await redis.connect();
const meta = await redis.hGetAll('gpu:autoencoder:centroids_64_meta');
const trainedAt = meta.trainedAt ?? new Date().toISOString();
const filePaths = [...new Set(
  points.map(pt => pt.payload?.file_path ?? pt.payload?.path).filter(Boolean)
)];
const record = JSON.stringify({
  summary, clusterId: CLUSTER_ID, size: points.length,
  filePaths: filePaths.slice(0, 30), trainedAt, updatedAt: new Date().toISOString(),
});
await redis.setEx(`cluster:summary:${CLUSTER_ID}`, 6 * 3600, record);
await redis.setEx(`ace:cluster:summary:${CLUSTER_ID}`, 6 * 3600, summary);
await redis.quit();
console.log(`[cluster ${CLUSTER_ID}] written to Redis`);
