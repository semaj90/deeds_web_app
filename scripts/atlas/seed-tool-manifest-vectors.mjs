#!/usr/bin/env node
/**
 * seed-tool-manifest-vectors.mjs
 *
 * AFC-E2E-97: Populates public.atlas_tool_manifest_vectors_v1 with canonical
 * 768-dim embeddings for all tools from docs/reports/mcp-tool-registry-index.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REGISTRY_JSON = path.join(ROOT, 'docs', 'reports', 'mcp-tool-registry-index.json');
const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = (() => {
  const base = OLLAMA_HOST.startsWith('http') ? OLLAMA_HOST : `http://${OLLAMA_HOST}`;
  // OLLAMA_HOST=0.0.0.0 carries no port; default to 11434 (per CLAUDE.md host normalization rule).
  return /:\d+$/.test(base) ? base : `${base}:11434`;
})();
const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';

function deterministicPseudoVector768(text) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vec = [];
  for (let i = 0; i < 768; i++) {
    const byte = hash[i % hash.length];
    const val = Math.sin((i + 1) * (byte + 1));
    vec.push(Number(val.toFixed(6)));
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vec.map(v => Number((v / norm).toFixed(6)));
}

async function embed(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 1024) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embedding) && data.embedding.length === 768) {
        return { vector: data.embedding, method: 'ollama' };
      }
    }
  } catch {}
  // No pseudo-vector fallback: a hash vector has no semantic signal and was
  // previously written to the table silently. Fail closed instead.
  if (process.env.SEED_ALLOW_PSEUDO_VECTORS === '1') {
    return { vector: deterministicPseudoVector768(text), method: 'deterministic_pseudo' };
  }
  throw new Error(`EMBED_FAILED: ${EMBED_MODEL} returned no 768-d vector (is Ollama up and the model loaded?)`);
}

async function main() {
  console.log('[AFC-E2E-97] Loading tool registry index...');
  const registryRaw = fs.readFileSync(REGISTRY_JSON, 'utf8');
  const registry = JSON.parse(registryRaw);
  // Union of the static registry and the live discovered surface (mcp-tool-surface-live-v1.json).
  // payload.live_surface marks tools a model can actually call; the selector filters on it.
  const liveTools = new Map();
  const livePath = process.env.SEED_LIVE_SURFACE ?? path.join(ROOT, 'docs', 'reports', 'mcp-tool-surface-live-v1.json');
  const liveDoc = JSON.parse(fs.readFileSync(livePath, 'utf8'));
  for (const server of Object.values(liveDoc.servers ?? {})) {
    for (const t of server.surface?.tools ?? []) liveTools.set(t.ref.toolName, t.description ?? '');
  }
  if (liveTools.size === 0) throw new Error(`LIVE_SURFACE_EMPTY: ${livePath}`);
  const tools = [...(registry.tools || [])];
  const known = new Set(tools.map((t) => t.tool_name));
  for (const [name, description] of liveTools) {
    if (!known.has(name)) tools.push({ tool_name: name, description, namespace: name.split('.')[0], ontology: [], layers: [], examples: [] });
  }
  console.log(`[AFC-E2E-97] Found ${tools.length} tools to ingest.`);

  const repoEnv = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(repoEnv);
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 60 });

  const t0 = Date.now();
  let ollamaSuccessCount = 0;
  let fallbackCount = 0;
  let insertedCount = 0;

  try {
    for (const tool of tools) {
      const toolName = tool.tool_name;
      const namespace = tool.namespace || toolName.split('.')[0] || 'mcp';
      const description = tool.description || '';
      const prompt = `${toolName} ${description} ${(tool.ontology || []).join(' ')} ${(tool.examples || []).join(' ')}`.trim();

      const { vector, method } = await embed(prompt);
      if (method === 'ollama') ollamaSuccessCount++;
      else fallbackCount++;

      const vectorStr = `[${vector.join(',')}]`;
      const schemaChecksum = crypto.createHash('sha256').update(JSON.stringify(tool)).digest('hex');

      await sql`
        INSERT INTO public.atlas_tool_manifest_vectors_v1 (
          tool_name,
          namespace,
          description,
          embedding,
          recipe_revision,
          schema_checksum,
          payload,
          updated_at
        ) VALUES (
          ${toolName},
          ${namespace},
          ${description},
          ${vectorStr}::vector,
          'rev-20261101',
          ${schemaChecksum},
          ${sql.json({
            llama_name: tool.llama_name ?? toolName.replace(/\./g, '__'),
            ontology: tool.ontology ?? [],
            layers: tool.layers ?? [],
            domain: tool.domain ?? null,
            primary_layer: tool.primary_layer ?? tool.layers?.[0] ?? 'unknown',
            embed_method: method,
            live_surface: liveTools.has(toolName),
          })},
          clock_timestamp()
        )
        ON CONFLICT (tool_name) DO UPDATE SET
          namespace = EXCLUDED.namespace,
          description = EXCLUDED.description,
          embedding = EXCLUDED.embedding,
          recipe_revision = EXCLUDED.recipe_revision,
          schema_checksum = EXCLUDED.schema_checksum,
          payload = EXCLUDED.payload,
          updated_at = clock_timestamp();
      `;
      insertedCount++;
      if (insertedCount % 50 === 0) {
        console.log(`  Ingested ${insertedCount}/${tools.length} tool vectors...`);
      }
    }

    const [countRow] = await sql`SELECT count(*) FROM public.atlas_tool_manifest_vectors_v1;`;
    const totalPopulated = Number(countRow.count);

    const receipt = {
      schema: 'atlas.tool-manifest-vectors-seed.v1',
      contract: 'AFC-E2E-97',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t0,
      toolsIngested: insertedCount,
      totalInDatabase: totalPopulated,
      embedStats: {
        ollamaSuccessCount,
        fallbackCount,
      },
      canonicalAuthority: false,
      writesPerformed: true,
    };

    const outDir = path.join(ROOT, '.tmp', 'atlas');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'seed-tool-manifest-vectors-receipt-v1.json');
    fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf8');

    console.log('\n[AFC-E2E-97] Seeding Complete:');
    console.log(`  Tools Processed:    ${insertedCount}`);
    console.log(`  Total in pgvector:  ${totalPopulated}`);
    console.log(`  Ollama Embedded:    ${ollamaSuccessCount}`);
    console.log(`  Fallback Embedded:  ${fallbackCount}`);
    console.log(`  Receipt:            ${outPath}\n`);
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error('[AFC-E2E-97] Seeding failed:', err);
  process.exit(1);
});
