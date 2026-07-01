#!/usr/bin/env node
/**
 * Prove the concrete two-stage retrieval/summarization flow:
 *
 *   EmbeddingGemma -> Qdrant content shortlist -> TurboVec gRPC transform/prefilter
 *   -> Go Retrieval codebase search -> Postgres truth join -> LangExtract
 *   -> Gemma4 bounded JSON summary
 *
 * This is proof-only. It does not mutate Postgres, Qdrant, Redis, or packet identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { sanitizeGemma4Summary } from './lib/gemma4-summary-sanitizer.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const env = loadRepoEnv();
const QUERY = String(args.get('query') ?? 'Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Gemma4 summarization flow');
const TOP_K = Number(args.get('top-k') ?? 8);
const OUT_JSON = path.resolve(REPO_ROOT, String(args.get('out-json') ?? 'docs/reports/retrieval-summarization-flow-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/retrieval-summarization-flow-proof.md'));

const EMBED_URL = String(args.get('embed-url') ?? env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const OLLAMA_URL = String(args.get('ollama-url') ?? env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const EMBED_MODEL = String(args.get('embed-model') ?? env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const QDRANT_URL = String(args.get('qdrant-url') ?? env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const QDRANT_COLLECTION = String(args.get('collection') ?? env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768');
const QDRANT_VECTOR_NAME = String(args.get('vector-name') ?? env.QDRANT_CODE_VECTOR_NAME ?? 'content');
const TURBOVEC_GRPC_URL = String(args.get('turbovec-grpc') ?? env.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062');
const GO_RETRIEVAL_URL = String(args.get('go-retrieval-url') ?? env.GO_RETRIEVAL_HTTP_URL ?? env.RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, '');
const LANGEXTRACT_URL = String(args.get('langextract-url') ?? env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8096').replace(/\/+$/, '');
const GEMMA4_URL = String(args.get('gemma4-url') ?? env.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090/v1').replace(/\/+$/, '');
const GEMMA4_MODEL = String(args.get('gemma4-model') ?? env.LOCAL_GEMMA_MODEL ?? env.LANGEXTRACT_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf');

function lane(status, detail = {}) {
  return { status, ...detail };
}

function statusFromLanes(lanes) {
  const statuses = Object.values(lanes).map((value) => value.status);
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('FALLBACK_PASS') || statuses.includes('WARN')) return 'WARN';
  return 'LIVE_PASS';
}

function normalizeVector(raw) {
  if (!Array.isArray(raw)) return null;
  const vector = raw.map(Number);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function projectVector(vector, outDim) {
  if (!Array.isArray(vector)) return [];
  if (vector.length === outDim) return vector.map(Number);
  if (vector.length > outDim) {
    const step = vector.length / outDim;
    return Array.from({ length: outDim }, (_, index) => Number(vector[Math.floor(index * step)] ?? 0));
  }
  return [...vector.map(Number), ...Array(outDim - vector.length).fill(0)];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  return body;
}

async function embedQuery() {
  const started = Date.now();
  try {
    const body = await fetchJson(`${EMBED_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: [QUERY] }),
      timeoutMs: 30_000,
    });
    const vector = normalizeVector(body?.data?.[0]?.embedding);
    if (!vector) throw new Error('OpenAI-compatible embedding response missing data[0].embedding');
    return {
      vector,
      lane: lane('LIVE_PASS', {
        url: EMBED_URL,
        model: EMBED_MODEL,
        dimension: vector.length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (primaryError) {
    try {
      const body = await fetchJson(`${OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: [QUERY] }),
        timeoutMs: 30_000,
      });
      const vector = normalizeVector(body?.embeddings?.[0] ?? body?.embedding);
      if (!vector) throw new Error('Ollama embedding response missing embedding');
      return {
        vector,
        lane: lane('FALLBACK_PASS', {
          url: OLLAMA_URL,
          model: EMBED_MODEL,
          dimension: vector.length,
          fallback_used: true,
          reason: `OpenAI-compatible EmbeddingGemma unavailable; used Ollama EmbeddingGemma only. Primary error: ${primaryError.message}`,
          duration_ms: Date.now() - started,
        }),
      };
    } catch (fallbackError) {
      return {
        vector: null,
        lane: lane('FAIL', {
          url: EMBED_URL,
          model: EMBED_MODEL,
          error: `${primaryError.message}; fallback: ${fallbackError.message}`,
          duration_ms: Date.now() - started,
        }),
      };
    }
  }
}

async function qdrantShortlist(vector) {
  const started = Date.now();
  try {
    const search = await fetchJson(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: QDRANT_VECTOR_NAME, vector },
        limit: Math.max(TOP_K * 2, 10),
        filter: {
          must_not: [
            { key: 'proof_only', match: { value: true } },
          ],
        },
        with_payload: true,
        with_vector: false,
      }),
      timeoutMs: 30_000,
    });
    const hits = (search?.result ?? []).map((hit) => ({
      id: String(hit.id ?? ''),
      score: Number(hit.score ?? 0),
      packet_key: hit.payload?.packet_key ?? hit.payload?.packetKey ?? null,
      source_ref: hit.payload?.source_ref ?? hit.payload?.sourceRef ?? hit.payload?.canonical_source_ref ?? hit.payload?.file_path ?? null,
      feature_id: hit.payload?.feature_id ?? hit.payload?.featureId ?? null,
      feature_label: hit.payload?.feature_label ?? hit.payload?.featureLabel ?? null,
    }));
    return {
      hits,
      lane: lane(hits.length > 0 ? 'LIVE_PASS' : 'FAIL', {
        url: QDRANT_URL,
        collection: QDRANT_COLLECTION,
        vector_name: QDRANT_VECTOR_NAME,
        hits: hits.length,
        identity_hits: hits.filter((hit) => hit.packet_key && hit.source_ref && hit.feature_id).length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      hits: [],
      lane: lane('FAIL', {
        url: QDRANT_URL,
        collection: QDRANT_COLLECTION,
        vector_name: QDRANT_VECTOR_NAME,
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

function makeRequire(root) {
  return createRequire(pathToFileURL(path.join(root, '_dummy.js')).href);
}

function loadGrpc() {
  const roots = [
    path.resolve(REPO_ROOT, 'sveltekit-frontend/node_modules'),
    path.resolve(REPO_ROOT, 'node_modules'),
    path.resolve(process.cwd(), 'node_modules'),
  ];
  for (const root of roots) {
    try {
      const req = makeRequire(root);
      return { grpc: req('@grpc/grpc-js'), protoLoader: req('@grpc/proto-loader') };
    } catch {
      // try next root
    }
  }
  throw new Error('@grpc/grpc-js not found');
}

function grpcClient() {
  const { grpc, protoLoader } = loadGrpc();
  const protoPath = path.resolve(REPO_ROOT, 'proto/active/turbovec_cuda.proto');
  const def = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(def);
  return {
    client: new descriptor.turbovec.TurboVecCudaService(TURBOVEC_GRPC_URL, grpc.credentials.createInsecure()),
  };
}

function grpcCall(client, method, request, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + timeoutMs }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function turbovecTransform(vector) {
  const started = Date.now();
  let client;
  try {
    client = grpcClient().client;
    const health = await grpcCall(client, 'health', {}, 5_000);
    const outDim = Number(health?.dim ?? 64) || 64;
    const transformed = await grpcCall(client, 'transform', {
      vectors: vector,
      count: 1,
      inDim: vector.length,
      outDim,
      transformId: 'retrieval_summary_flow_768_to_64',
    }, 20_000);
    const projected = Array.from(transformed?.projectedVectors ?? []);
    const ok = Boolean(health?.ok) && projected.length === outDim;
    return {
      vector: ok ? projected : projectVector(vector, outDim),
      lane: lane(ok ? 'LIVE_PASS' : 'FAIL', {
        grpc_url: TURBOVEC_GRPC_URL,
        transport: 'grpc',
        backend: health?.backend ?? 'unknown',
        in_dim: vector.length,
        out_dim: Number(transformed?.outDim ?? outDim),
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      vector: projectVector(vector, 64),
      lane: lane('FAIL', {
        grpc_url: TURBOVEC_GRPC_URL,
        transport: 'grpc',
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  } finally {
    if (client) client.close();
  }
}

async function goRetrievalSearch() {
  const started = Date.now();
  const queries = [
    QUERY,
    'Parent Atlas Qdrant TurboVec summarization',
    'Qdrant TurboVec Go Retrieval codebase search',
  ];
  try {
    let response = null;
    let results = [];
    let query_used = QUERY;
    for (const query of queries) {
      response = await fetchJson(`${GO_RETRIEVAL_URL}/search/codebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: TOP_K }),
        timeoutMs: 30_000,
      });
      results = response?.results ?? response?.Results ?? response?.chunks ?? response?.Chunks ?? [];
      query_used = query;
      if (Array.isArray(results) && results.length > 0) break;
    }
    return {
      results,
      lane: lane(Array.isArray(results) && results.length > 0 ? 'LIVE_PASS' : 'FAIL', {
        url: GO_RETRIEVAL_URL,
        endpoint: '/search/codebase',
        query_used,
        results: Array.isArray(results) ? results.length : 0,
        total_ms: response?.totalMs ?? response?.total_ms ?? null,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      results: [],
      lane: lane('FAIL', {
        url: GO_RETRIEVAL_URL,
        endpoint: '/search/codebase',
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

async function postgresTruthJoin(qdrantHits, goResults) {
  const started = Date.now();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const packetKeys = [
      ...qdrantHits.map((hit) => hit.packet_key),
      ...goResults.map((hit) => hit?.sourceMetadata?.packetKey ?? hit?.source_metadata?.packet_key ?? hit?.packet_key ?? hit?.id ?? hit?.chunkId ?? hit?.chunk_id),
    ].filter(Boolean).map(String);
    const sourceRefs = [
      ...qdrantHits.map((hit) => hit.source_ref),
      ...goResults.map((hit) => hit?.filePath ?? hit?.file_path ?? hit?.sourceMetadata?.sourceRef ?? hit?.source_metadata?.source_ref),
    ].filter(Boolean).map(String);
    const query = `
      SELECT packet_key, source_ref, source_ref_key, feature_id, feature_label,
             domain_class,
             COALESCE(metadata->>'ontology_label', topology->>'ontology_label', payload->>'ontology_label') AS ontology_label,
             COALESCE(metadata->>'topology_label', topology->>'topology_label', payload->>'topology_label') AS topology_label,
             summary
      FROM atlas_packets
      WHERE packet_key = ANY($1::text[])
         OR source_ref = ANY($2::text[])
         OR file_path = ANY($2::text[])
      LIMIT 20
    `;
    const result = await pool.query(query, [packetKeys, sourceRefs]);
    return {
      rows: result.rows,
      lane: lane(result.rows.length > 0 ? 'LIVE_PASS' : 'FAIL', {
        table: 'atlas_packets',
        packet_keys_in: packetKeys.length,
        source_refs_in: sourceRefs.length,
        rows: result.rows.length,
        identity_rows: result.rows.filter((row) => row.packet_key && row.source_ref && row.feature_id).length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      rows: [],
      lane: lane('FAIL', {
        table: 'atlas_packets',
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  } finally {
    await pool.end();
  }
}

async function langextract(rows) {
  const started = Date.now();
  const content = rows.map((row) => [
    `packet_key: ${row.packet_key}`,
    `source_ref: ${row.source_ref}`,
    `feature_id: ${row.feature_id}`,
    `feature_label: ${row.feature_label ?? ''}`,
    `summary: ${row.summary ?? ''}`,
  ].join('\n')).join('\n\n---\n\n').slice(0, 12_000);
  try {
    const body = await fetchJson(`${LANGEXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        document_type: 'codebase_feature_envelope',
        extract_entities: true,
        extract_structure: true,
        use_ollama_ner: true,
      }),
      timeoutMs: 45_000,
    });
    return {
      body,
      lane: lane('LIVE_PASS', {
        url: LANGEXTRACT_URL,
        entities: Array.isArray(body?.entities) ? body.entities.length : 0,
        structure_keys: body?.structure && typeof body.structure === 'object' ? Object.keys(body.structure).length : 0,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      body: null,
      lane: lane('FAIL', {
        url: LANGEXTRACT_URL,
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

async function gemma4Summary(rows, extraction) {
  const started = Date.now();
  const envelope = {
    task_id: 'proof.retrieval_summarization_flow',
    query: QUERY,
    source_refs: rows.slice(0, TOP_K).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      source_ref_key: row.source_ref_key,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
    })),
    extraction: {
      entity_count: Array.isArray(extraction?.entities) ? extraction.entities.length : 0,
      entities: Array.isArray(extraction?.entities) ? extraction.entities.slice(0, 12) : [],
      structure: extraction?.structure ?? {},
    },
    rules: [
      'Use only provided source_refs and extracted structure.',
      'Do not invent files, tools, services, ports, or graph edges.',
      'Return JSON only.',
    ],
  };
  try {
    const body = await fetchJson(`${GEMMA4_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LOCAL_OPENAI_API_KEY ?? 'local'}`,
      },
      body: JSON.stringify({
        model: GEMMA4_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You summarize bounded Parent Atlas feature envelopes. Return compact JSON only with summary, domain_class, ontology_label, topology_label, source_refs, missing_evidence, confidence.',
          },
          { role: 'user', content: JSON.stringify(envelope) },
        ],
        temperature: 0.1,
        max_tokens: 700,
        stream: false,
        cache_prompt: true,
        chat_template_kwargs: { enable_thinking: false },
      }),
      timeoutMs: 90_000,
    });
    const raw = body?.choices?.[0]?.message?.content ?? '';
    const sanitized = sanitizeGemma4Summary(raw);
    let parsed = null;
    try {
      const start = sanitized.summary.indexOf('{');
      const end = sanitized.summary.lastIndexOf('}');
      parsed = start >= 0 && end > start ? JSON.parse(sanitized.summary.slice(start, end + 1)) : null;
    } catch {
      parsed = null;
    }
    return {
      summary: parsed ?? { summary: sanitized.summary },
      lane: lane(sanitized.safe ? 'LIVE_PASS' : 'FAIL', {
        url: GEMMA4_URL,
        model: GEMMA4_MODEL,
        reasoning_leak_stripped: sanitized.changed,
        json_parsed: Boolean(parsed),
        output_chars: sanitized.summary.length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      summary: null,
      lane: lane('FAIL', {
        url: GEMMA4_URL,
        model: GEMMA4_MODEL,
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

function markdown(report) {
  return [
    '# Retrieval Summarization Flow Proof',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Query: ${report.query}`,
    '',
    '## Contract',
    '',
    'EmbeddingGemma -> Qdrant content shortlist -> TurboVec gRPC transform/prefilter -> Go Retrieval -> Postgres truth join -> LangExtract -> Gemma4 bounded summary.',
    '',
    '| lane | status | detail |',
    '|---|---:|---|',
    ...Object.entries(report.lanes).map(([name, value]) => `| ${name} | ${value.status} | ${String(value.error ?? value.reason ?? value.url ?? value.grpc_url ?? '').replace(/\|/g, '/')} |`),
    '',
    '## Summary Preview',
    '',
    '```json',
    JSON.stringify(report.summary, null, 2).slice(0, 2000),
    '```',
    '',
  ].join('\n');
}

async function main() {
  const started = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    query: QUERY,
    rule: 'LIVE_PASS means real service, real port, real data. Fallbacks and warnings are visible, not green.',
    lanes: {},
    candidates: {},
    summary: null,
  };

  const embedding = await embedQuery();
  report.lanes.embeddinggemma = embedding.lane;
  if (!embedding.vector) throw new Error('EmbeddingGemma failed; cannot continue flow proof.');

  const qdrant = await qdrantShortlist(embedding.vector);
  report.lanes.qdrant = qdrant.lane;
  report.candidates.qdrant = qdrant.hits.slice(0, TOP_K);

  const turbo = await turbovecTransform(embedding.vector);
  report.lanes.turbovec_grpc = turbo.lane;

  const go = await goRetrievalSearch();
  report.lanes.go_retrieval = go.lane;
  report.candidates.go_retrieval_count = go.results.length;

  const truth = await postgresTruthJoin(qdrant.hits, go.results);
  report.lanes.postgres_truth_join = truth.lane;

  const extraction = await langextract(truth.rows);
  report.lanes.langextract = extraction.lane;

  const summary = await gemma4Summary(truth.rows, extraction.body);
  report.lanes.gemma4_summary = summary.lane;
  report.summary = summary.summary;

  report.status = statusFromLanes(report.lanes);
  report.elapsed_ms = Date.now() - started;

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, markdown(report), 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    lanes: Object.fromEntries(Object.entries(report.lanes).map(([key, value]) => [key, value.status])),
    out_json: OUT_JSON,
    out_md: OUT_MD,
  }, null, 2));
  process.exit(report.status === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  const report = {
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    query: QUERY,
    error: error.message,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, markdown({ ...report, lanes: {}, summary: null }), 'utf8');
  console.error(error);
  process.exit(1);
});
