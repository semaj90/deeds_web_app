import { ENV } from '$lib/server/env.server.js';
import db from '$lib/server/db/client.js';
import { agentMemoryObservations } from '$lib/server/db/schema-postgres.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { redisService } from '$lib/server/redis-service.js';

const BATCH_SIZE = 50;

function asArray(value: any) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function pickString(record: any, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const v = record?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return fallback;
}

function normalizeObservation(record: any, idx = 0, projectPathOverride: string | null = null) {
  const sourceRefs = asArray(record.source_refs ?? record.sourceRefs ?? record.refs ?? record.sources ?? record.source_ref);
  const tags = asArray(record.tags ?? record.labels ?? record.topics ?? record.observation_tags);
  const toolCalls = asArray(record.tool_calls ?? record.toolCalls ?? record.tools ?? record.calls);
  const summary = pickString(record, ['summary', 'content', 'message', 'observation', 'note', 'text', 'title'], '');
  const rawSummary = summary || JSON.stringify(record).slice(0, 4000);

  return {
    source: 'claude-mem',
    ide: pickString(record, ['ide'], 'opencode') || 'opencode',
    sessionId: pickString(record, ['session_id', 'sessionId', 'session', 'conversation_id'], null),
    observationId: pickString(record, ['observation_id', 'observationId', 'id', 'event_id'], `observation:${idx}`),
    projectPath: projectPathOverride ?? pickString(record, ['project_path', 'projectPath', 'cwd', 'workspace_path', 'repo_path'], null),
    summary: rawSummary,
    tags,
    sourceRefs,
    toolCalls,
    rawJson: record,
  } as const;
}

async function embedBatch(texts: string[], model = ENV.OLLAMA_EMBED_MODEL) {
  if (!texts.length) return [];
  try {
    const resp = await fetch(`${ENV.OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Embedding request failed: ${resp.status} ${txt}`);
    }
    const payload = await resp.json();
    // Ollama may return { data: [{ embedding: [...] }, ...] } or { embedding: [...] }
    if (Array.isArray(payload?.data)) {
      return payload.data.map((d: any) => (Array.isArray(d.embedding) ? d.embedding.map((n: any) => Number(n) || 0) : null));
    }
    if (Array.isArray(payload?.embedding)) {
      return [payload.embedding.map((n: any) => Number(n) || 0)];
    }
    return [];
  } catch (e) {
    console.warn('[claude-mem-ingest] embedding error', e?.message ?? e);
    return [];
  }
}

export async function ingestObservations(rawRecords: any[], opts?: { projectPath?: string; collection?: string }) {
  const projectPath = opts?.projectPath ?? null;
  const collection = opts?.collection ?? 'agent_memory_observations';

  const normalized = rawRecords.map((r, i) => normalizeObservation(r, i, projectPath));

  let inserted = 0;
  let upserted = 0;
  const latest: any = null;

  // Batch embeddings
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.summary);
    const embeddings = await embedBatch(texts);

    // Persist each row and upsert qdrant
    for (let j = 0; j < batch.length; j++) {
      const obs = batch[j];
      const embedding = embeddings[j] ?? null;
      const pointId = String(deterministicPointId([obs.source, obs.ide, obs.sessionId, obs.observationId, obs.projectPath, obs.summary].join('|')));

      try {
        const insertObj: any = {
          source: obs.source,
          ide: obs.ide,
          sessionId: obs.sessionId,
          observationId: obs.observationId,
          projectPath: obs.projectPath,
          summary: obs.summary,
          tags: obs.tags,
          sourceRefs: obs.sourceRefs,
          toolCalls: obs.toolCalls,
          rawJson: obs.rawJson,
          embeddingModel: ENV.OLLAMA_EMBED_MODEL,
          embeddingDim: 768,
          qdrantPointId: pointId,
        };

        await db.db.insert(agentMemoryObservations).values(insertObj);
        inserted += 1;

        if (embedding && Array.isArray(embedding) && embedding.length) {
          const point: any = {
            id: Number(pointId) || undefined,
            vector: { embedding },
            payload: {
              source: obs.source,
              ide: obs.ide,
              session_id: obs.sessionId,
              observation_id: obs.observationId,
              project_path: obs.projectPath,
              summary: obs.summary,
              tags: obs.tags ?? [],
              source_refs: obs.sourceRefs ?? [],
              tool_calls: obs.toolCalls ?? [],
              embedding_model: ENV.OLLAMA_EMBED_MODEL,
              embedding_dim: 768,
              kind: 'claude-mem-observation',
              imported_at: new Date().toISOString(),
            },
          };
          try {
            await qdrant.batchUpsert({ collection, points: [point] });
            upserted += 1;
          } catch (e) {
            console.warn('[claude-mem-ingest] qdrant upsert failed', e?.message ?? e);
          }
        }
      } catch (e) {
        console.error('[claude-mem-ingest] db insert failed', e?.message ?? e);
      }
    }
  }

  // Update hot-card in Redis
  try {
    const hot = {
      source: 'claude-mem',
      ide: projectPath ?? 'opencode',
      count: normalized.length,
      latest: normalized[normalized.length - 1] ?? null,
      collection,
      embeddingModel: ENV.OLLAMA_EMBED_MODEL,
      embeddingDim: 768,
      importedAt: new Date().toISOString(),
    };
    await redisService.setCache('ace:memory:claude-mem:latest', hot, 86400);
  } catch (e) {
    console.warn('[claude-mem-ingest] redis hot-card set failed', e?.message ?? e);
  }

  return { inserted, upserted };
}

export default { ingestObservations };
