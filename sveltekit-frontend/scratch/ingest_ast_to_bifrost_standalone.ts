import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────
const DATABASE_URL   = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const EMBED_URL      = 'http://127.0.0.1:3040/v1/embeddings';   // Bifrost → embeddinggemma
const QDRANT_URL     = 'http://127.0.0.1:6333';
const COLLECTION     = 'BifrostSemanticCachePlugin';
const EMBED_MODEL    = 'ollama/embeddinggemma:latest';
// Bifrost receives model as "ollama/gemma4-legal-vlm:latest" (provider/model format)
// cache_by_model:true means model field in payload MUST match exactly
const CACHE_MODEL    = 'ollama/gemma4-legal-vlm:latest';
const CACHE_PROVIDER = 'ollama';
const CACHE_KEY      = 'global'; // Must match Bifrost default_cache_key for cache hits without x-bf-cache-key header
const BATCH_SIZE     = 20;                                        // embed N at a time
const TTL_SECONDS    = 60 * 60 * 24 * 30;                        // 30 days
// ──────────────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function makeResponseJson(content: string): string {
    return JSON.stringify({
        id: 'bifrost-seed-' + crypto.randomBytes(8).toString('hex'),
        object: 'chat.completion',
        model: CACHE_MODEL,
        choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
}

async function embedBatch(prompts: string[]): Promise<number[][] | null> {
    try {
        const r = await fetch(EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, input: prompts }),
            signal: AbortSignal.timeout(30_000)
        });
        if (!r.ok) { console.error(`  Embed HTTP ${r.status}`); return null; }
        const j = await r.json() as { data: { embedding: number[] }[] };
        return j.data.map(d => d.embedding);
    } catch (e) {
        console.error('  Embed error:', (e as Error).message);
        return null;
    }
}

async function upsertPoints(points: object[]): Promise<boolean> {
    try {
        const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
            signal: AbortSignal.timeout(15_000)
        });
        return r.ok;
    } catch (e) {
        console.error('  Qdrant error:', (e as Error).message);
        return false;
    }
}

async function run() {
    console.log('\n  Phase 89 — Bifrost Direct Qdrant Seeding');
    console.log('  (embed via embeddinggemma → insert into BifrostSemanticCachePlugin)');
    console.log('  ─────────────────────────────────────────\n');

    const res = await pool.query(
        'SELECT file_path, signature, node_type, metadata FROM phase89_ast_signatures WHERE signature IS NOT NULL AND length(signature) > 10 LIMIT 5300'
    );
    console.log(`  Found ${res.rows.length} signatures to seed.\n`);

    let success = 0;
    let failed = 0;
    const rows = res.rows;
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const prompts = batch.map(row => {
            const meta = row.metadata as Record<string, string> | null;
            const symbol = meta?.symbol || meta?.name || row.file_path?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
            return `What is the implementation of ${symbol}?`;
        });

        const embeddings = await embedBatch(prompts);
        if (!embeddings) { failed += batch.length; continue; }

        const points = batch.map((row, idx) => {
            const meta = row.metadata as Record<string, string> | null;
            const symbol = meta?.symbol || meta?.name || row.file_path?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
            const prompt = prompts[idx];
            const responseJson = makeResponseJson(row.signature);
            return {
                id: crypto.randomUUID(),
                vector: embeddings[idx],
                payload: {
                    request_hash:  sha256(prompt),
                    params_hash:   sha256(CACHE_MODEL + ':t0.0'),
                    cache_key:     CACHE_KEY,
                    model:         CACHE_MODEL,
                    provider:      CACHE_PROVIDER,
                    response:      responseJson,
                    stream_chunks: '',
                    from_bifrost_semantic_cache_plugin: true,
                    expires_at:    expiresAt,
                    // extra metadata for observability
                    _symbol:   symbol,
                    _kind:     row.node_type || '',
                    _file:     row.file_path || ''
                }
            };
        });

        const ok = await upsertPoints(points);
        if (ok) {
            success += batch.length;
        } else {
            failed += batch.length;
        }

        const pct = Math.round(((i + batch.length) / rows.length) * 100);
        process.stdout.write(`\r  Progress: ${i + batch.length}/${rows.length} (${pct}%)  ✅ ${success}  ❌ ${failed}`);
    }

    console.log(`\n\n  ✅ Done — ${success} points seeded into ${COLLECTION} (expires ${new Date(expiresAt * 1000).toLocaleDateString()})`);
    await pool.end();
}

run().catch(console.error);
