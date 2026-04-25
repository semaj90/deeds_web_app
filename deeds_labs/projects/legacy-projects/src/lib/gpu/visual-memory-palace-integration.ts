import { browser } from '$app/environment';

export interface VisualMemoryOptions {
  qdrantClient?: {
    upsert?: (collection: string, body: unknown) => Promise<unknown>;
    search?: (c: string, q: unknown) => Promise<any>;
  } | null;
  redisClient?: {
    setBuffer?: (k: string, v: Uint8Array) => Promise<void>;
    get?: (k: string) => Promise<string | null>;
  } | null;
  minioClient?: {
    putObject?: (bucket: string, key: string, body: Uint8Array) => Promise<void>;
  } | null;
  ollamaUrl?: string;
}

export interface MemoryRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/* Small helper that prefers Docker hostname, then env, then localhost. */
function getOllamaEndpoint(provided?: string) {
  return provided || process.env.OLLAMA_URL || 'http://ollama:11434';
}

async function embedText(text: string, url?: string): Promise<number[]> {
  const endpoint = `${getOllamaEndpoint(url)}/api/embed`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) throw new Error(`embed failed ${res.status}`);
    const payload = await res.json();
    // Ollama embedding shape may vary; try common fields
    return (payload?.embedding ?? payload?.data?.[0]?.embedding ?? payload) as number[];
  } catch (err) {
    // Fallback: return a deterministic cheap embedding (hash-based)
    const hash = new TextEncoder().encode(text).slice(0, 256);
    const arr: number[] = [];
    for (let i = 0; i < 128; i++) arr.push(<any>(<any>(hash[i % hash.length] ?? 0)) / 255);
    return arr;
  }
}

export class VisualMemoryPalace {
  private qdrant?: VisualMemoryOptions['qdrantClient'];
  private redis?: VisualMemoryOptions['redisClient'];
  private minio?: VisualMemoryOptions['minioClient'];
  private ollamaUrl?: string;
  private collection = 'visual-memory-palace';
  private inMemoryIndex = new Map<string, MemoryRecord>();

  constructor(opts: VisualMemoryOptions = {}) {
    this.qdrant = opts.qdrantClient ?? null;
    this.redis = opts.redisClient ?? null;
    this.minio = opts.minioClient ?? null;
    this.ollamaUrl = opts.ollamaUrl;
  }

  async storeMemory(text: string, metadata?: Record<string, unknown>): Promise<MemoryRecord> {
    const embedding = await embedText(text, this.ollamaUrl);
    const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const rec: MemoryRecord = {
      id,
      text,
      embedding,
      metadata,
      createdAt: new Date().toISOString(),
    };

    // In-memory index
    this.inMemoryIndex.set(id, rec);

    // Best-effort Qdrant upsert
    if (this.qdrant?.upsert) {
      try {
        await this.qdrant.upsert(this.collection, {
          id,
          vector: embedding,
          payload: { text, metadata },
        });
      } catch {
        /* ignore */
      }
    }

    // Best-effort Redis cache
    if (this.redis?.setBuffer) {
      try {
        const data = new TextEncoder().encode(JSON.stringify(rec));
        await this.redis.setBuffer(`vmp:${id}`, data);
      } catch {
        /* ignore */
      }
    }

    // Best-effort MinIO storage snapshot
    if (this.minio?.putObject) {
      try {
        const buf = new TextEncoder().encode(
          JSON.stringify({ id, text, metadata, createdAt: rec.createdAt })
        );
        await this.minio.putObject('visual-memory', `${id}.json`, buf);
      } catch {
        /* ignore */
      }
    }

    return rec;
  }

  /**
   * Find similar memories by a text query. If Qdrant exists use it, otherwise fallback to brute-force cosine search in-memory.
   */
  async findSimilar(query: string, topK = 6): Promise<MemoryRecord[]> {
    const qEmbedding = await embedText(query, this.ollamaUrl);

    // Prefer Qdrant search if available
    if (this.qdrant?.search) {
      try {
        const res = await this.qdrant.search(this.collection, { vector: qEmbedding, top: topK });
        // Attempt to map to MemoryRecord shape if possible
        return (res?.hits ?? []).map((h: any) => ({
          id: h.id ?? h.payload?.id ?? 'unknown',
          text: h.payload?.text ?? h.payload?.content ?? '',
          embedding: (h.vector ?? qEmbedding) as number[],
          metadata: h.payload?.metadata ?? h.payload ?? {},
          createdAt: new Date().toISOString(),
        }));
      } catch {
        /* continue to local fallback */
      }
    }

    // Brute-force in-memory cosine search
    function cosine(a: number[], b: number[]) {
      let da = 0,
        db = 0,
        num = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        num += x * y;
        da += x * x;
        db += y * y;
      }
      if (da === 0 || db === 0) return 0;
      return num / (Math.sqrt(da) * Math.sqrt(db));
    }

    const scored: Array<{ rec: MemoryRecord; score: number }> = [];
    for (const rec of this.inMemoryIndex.values()) {
      const s = cosine(qEmbedding, rec.embedding);
      scored.push(<any>(<any>{ rec, score: s }));
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.rec);
  }
}
