#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'logs', 'claude-mem');
const DEFAULT_MODEL = 'embeddinggemma:latest';
const DEFAULT_COLLECTION = 'agent_memory_observations';

for (const envFile of [
  path.join(ROOT, '.env'),
  path.join(ROOT, '.env.local'),
  path.join(ROOT, 'sveltekit-frontend', '.env'),
  path.join(ROOT, 'sveltekit-frontend', '.env.local'),
]) {
  if (existsSync(envFile)) dotenv.config({ path: envFile, override: false });
}

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const PG_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';

function parseArgs(argv) {
  const out = {
    input: null,
    limit: 200,
    dryRun: false,
    collection: DEFAULT_COLLECTION,
    projectPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') out.input = argv[++i] ?? null;
    else if (arg === '--limit') out.limit = Number(argv[++i] ?? '200');
    else if (arg === '--collection') out.collection = argv[++i] ?? DEFAULT_COLLECTION;
    else if (arg === '--project-path') out.projectPath = argv[++i] ?? null;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (!arg.startsWith('-') && !out.input) out.input = arg;
  }

  return out;
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function hashToUuid(text) {
  const hex = hashText(text).slice(0, 32).padEnd(32, '0');
  const timeLow = hex.slice(0, 8);
  const timeMid = hex.slice(8, 12);
  const timeHiAndVersion = `4${hex.slice(12, 15)}`;
  const clockSeqHiAndReserved = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  const clockSeqLow = hex.slice(18, 20);
  const node = hex.slice(20, 32);
  return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeqHiAndReserved}${clockSeqLow}-${node}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
  }
  if (value == null) return [];
  return [value];
}

function pickString(record, keys, fallback = '') {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function normalizeObservation(record, fallbackIndex, projectPathOverride = null) {
  const sourceRefs = asArray(record.source_refs ?? record.sourceRefs ?? record.refs ?? record.sources ?? record.source_ref);
  const tags = asArray(record.tags ?? record.labels ?? record.topics ?? record.observation_tags);
  const toolCalls = asArray(record.tool_calls ?? record.toolCalls ?? record.tools ?? record.calls);
  const summary = pickString(record, [
    'summary',
    'content',
    'message',
    'observation',
    'note',
    'text',
    'title',
    'session_summary',
    'summary_text',
  ], '');
  const rawSummary = summary || JSON.stringify(record).slice(0, 4000);

  return {
    source: 'claude-mem',
    ide: pickString(record, ['ide'], 'opencode') || 'opencode',
    sessionId: pickString(record, ['session_id', 'sessionId', 'session', 'conversation_id'], null),
    observationId: pickString(record, ['observation_id', 'observationId', 'id', 'event_id'], `observation:${fallbackIndex}`),
    projectPath: projectPathOverride ?? pickString(record, ['project_path', 'projectPath', 'cwd', 'workspace_path', 'repo_path'], null),
    summary: rawSummary,
    tags,
    sourceRefs,
    toolCalls,
    rawJson: record,
  };
}

async function readJsonObservations(filePath) {
  const raw = await readFile(filePath, 'utf8');
  if (filePath.endsWith('.jsonl') || filePath.endsWith('.ndjson')) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          return { summary: line, observation_id: `line:${index}` };
        }
      });
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const key of ['observations', 'items', 'rows', 'results', 'messages', 'notes']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [parsed];
  }
  return [];
}

async function readSqliteObservations(filePath, limit) {
  const python = process.env.PYTHON ?? process.env.PYTHON_PATH ?? 'python';
  const py = String.raw`
import json, sqlite3, sys
db_path = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
tables = [row[0] for row in cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")]
out = []
preferred = {'observations','observation','memories','memory','messages','notes','sessions','session_observations','tool_calls'}
for table in tables:
    cols = [r[1] for r in cur.execute(f"PRAGMA table_info('{table}')")]
    if not cols:
        continue
    name_hit = table.lower() in preferred or any(col in cols for col in ('summary','content','message','observation','note','text'))
    if not name_hit:
        continue
    try:
        rows = cur.execute(f'SELECT * FROM "{table}" LIMIT ?', (limit,)).fetchall()
    except Exception:
        continue
    for row in rows:
        rec = dict(row)
        rec['_source_table'] = table
        out.append(rec)
print(json.dumps(out, ensure_ascii=False))
`;
  const result = spawnSync(python, ['-c', py, filePath, String(limit)], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`SQLite export read failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  const parsed = JSON.parse(result.stdout || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function readObservations(inputPath, limit) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.json' || ext === '.jsonl' || ext === '.ndjson') {
    return readJsonObservations(inputPath);
  }
  if (ext === '.sqlite' || ext === '.sqlite3' || ext === '.db') {
    return readSqliteObservations(inputPath, limit);
  }
  const text = await readFile(inputPath, 'utf8');
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ summary: line, observation_id: `line:${index}` }));
  }
}

async function ensureTable(pool) {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_memory_observations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source text NOT NULL DEFAULT 'claude-mem',
      ide text DEFAULT 'opencode',
      session_id text,
      observation_id text,
      project_path text,
      summary text NOT NULL,
      tags jsonb DEFAULT '[]'::jsonb,
      source_refs jsonb DEFAULT '[]'::jsonb,
      tool_calls jsonb DEFAULT '[]'::jsonb,
      raw_json jsonb DEFAULT '{}'::jsonb,
      embedding_model text DEFAULT 'embeddinggemma:latest',
      embedding_dim integer DEFAULT 768,
      qdrant_point_id text,
      created_at timestamptz DEFAULT now() NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_memory_observations_session_idx ON agent_memory_observations (session_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_memory_observations_observation_idx ON agent_memory_observations (observation_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_memory_observations_qdrant_idx ON agent_memory_observations (qdrant_point_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS agent_memory_observations_created_idx ON agent_memory_observations (created_at DESC);`);
}

async function embedText(text) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DEFAULT_MODEL, prompt: text }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const vector = Array.isArray(payload.embedding) ? payload.embedding : null;
    if (!vector || vector.length === 0) return null;
    return vector.map((n) => Number(n) || 0);
  } catch {
    return null;
  }
}

function stablePointId(observation) {
  const sourceText = [
    observation.source ?? 'claude-mem',
    observation.ide ?? 'opencode',
    observation.sessionId ?? '',
    observation.observationId ?? '',
    observation.projectPath ?? '',
    observation.summary ?? '',
  ].join('|');
  return hashToUuid(sourceText);
}

async function qdrantJson(pathname, options = {}) {
  const response = await fetch(`${QDRANT_URL}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Qdrant ${pathname} failed (${response.status}): ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

async function ensureCollection(collection) {
  try {
    await qdrantJson(`/collections/${encodeURIComponent(collection)}`);
  } catch {
    await qdrantJson(`/collections/${encodeURIComponent(collection)}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: { size: 768, distance: 'Cosine' },
      }),
    });
  }
}

async function upsertQdrantPoint(collection, point) {
  await qdrantJson(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({ points: [point] }),
  });
}

async function main() {
  await mkdir(LOG_DIR, { recursive: true });
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/memory/import-claude-mem-observations.mjs --input <json|jsonl|sqlite> [--limit 200] [--collection agent_memory_observations]');
    process.exit(1);
  }

  const observations = (await readObservations(args.input, args.limit))
    .slice(0, args.limit)
    .map((record, index) => normalizeObservation(record, index, args.projectPath));

  const pool = new Pool({
    connectionString: PG_URL,
    max: 5,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  });
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: false });
  const createdAt = new Date().toISOString();
  const report = {
    source: 'claude-mem',
    input: path.resolve(args.input),
    collection: args.collection,
    count: observations.length,
    embedded: 0,
    qdrantUpserts: 0,
    latest: null,
    createdAt,
    dryRun: args.dryRun,
  };

  try {
    await ensureTable(pool);
    if (!args.dryRun) {
      await ensureCollection(args.collection);
    }

    for (const observation of observations) {
      const embedding = await embedText(observation.summary);
      const qdrantPointId = stablePointId(observation);

      if (!args.dryRun) {
        await pool.query(
          `INSERT INTO agent_memory_observations
            (source, ide, session_id, observation_id, project_path, summary, tags, source_refs, tool_calls, raw_json, embedding_model, embedding_dim, qdrant_point_id)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13)`,
          [
            observation.source,
            observation.ide,
            observation.sessionId,
            observation.observationId,
            observation.projectPath,
            observation.summary,
            JSON.stringify(observation.tags ?? []),
            JSON.stringify(observation.sourceRefs ?? []),
            JSON.stringify(observation.toolCalls ?? []),
            JSON.stringify(observation.rawJson ?? {}),
            DEFAULT_MODEL,
            768,
            qdrantPointId,
          ],
        );

        if (embedding) {
          await upsertQdrantPoint(args.collection, {
            id: qdrantPointId,
            vector: embedding,
            payload: {
              source: observation.source,
              ide: observation.ide,
              session_id: observation.sessionId,
              observation_id: observation.observationId,
              project_path: observation.projectPath,
              summary: observation.summary,
              tags: observation.tags ?? [],
              source_refs: observation.sourceRefs ?? [],
              tool_calls: observation.toolCalls ?? [],
              embedding_model: DEFAULT_MODEL,
              embedding_dim: 768,
              kind: 'claude-mem-observation',
              imported_at: createdAt,
            },
          });
          report.embedded += 1;
          report.qdrantUpserts += 1;
        }
      }

      report.latest = {
        observationId: observation.observationId,
        sessionId: observation.sessionId,
        qdrantPointId,
        summary: observation.summary.slice(0, 240),
        tags: observation.tags ?? [],
        sourceRefs: observation.sourceRefs ?? [],
      };
    }

    if (!args.dryRun) {
      const hotKeyValue = {
        source: 'claude-mem',
        ide: 'opencode',
        count: observations.length,
        latest: report.latest,
        collection: args.collection,
        embeddingModel: DEFAULT_MODEL,
        embeddingDim: 768,
        importedAt: createdAt,
      };
      await redis.set('ace:memory:claude-mem:latest', JSON.stringify(hotKeyValue), 'EX', 86400);
      if (report.latest?.sessionId) {
        await redis.set(
          `ace:memory:claude-mem:session:${report.latest.sessionId}`,
          JSON.stringify(hotKeyValue),
          'EX',
          86400,
        );
      }
    }

    await writeFile(path.join(LOG_DIR, 'import-latest.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[memory:claude-mem:import] Fatal:', error?.message ?? error);
  process.exit(1);
});
