#!/usr/bin/env node
/**
 * Prove the concrete two-stage retrieval/summarization flow:
 *
 *   EmbeddingGemma -> Qdrant content shortlist -> TurboVec gRPC transform/prefilter
 *   -> Go Retrieval codebase search -> Postgres truth join -> LangExtract
 *   -> Ornith 1.5 (llama-server :8090) bounded JSON summary
 *
 * This is proof-only. It does not mutate Postgres, Qdrant, Redis, or packet identity.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
const QUERY = String(args.get('query') ?? 'Parent Atlas Qdrant TurboVec Go Retrieval LangExtract Ornith summarization flow');
const TOP_K = Number(args.get('top-k') ?? 8);
const OUT_JSON = path.resolve(REPO_ROOT, String(args.get('out-json') ?? 'docs/reports/retrieval-summarization-flow-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/retrieval-summarization-flow-proof.md'));

const EMBED_URL = String(
  args.get('embed-url')
  ?? env.EMBED_SERVER_URL
  ?? env.EMBEDDING_URL
  ?? env.OLLAMA_EMBED_BASE_URL
  ?? env.OLLAMA_URL
  ?? 'http://127.0.0.1:11434'
).replace(/\/+$/, '');
const OLLAMA_URL = String(args.get('ollama-url') ?? env.OLLAMA_URL ?? env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const EMBED_MODEL = String(args.get('embed-model') ?? env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const QDRANT_URL = String(args.get('qdrant-url') ?? env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const QDRANT_COLLECTION = String(args.get('collection') ?? env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768');
const QDRANT_VECTOR_NAME = String(args.get('vector-name') ?? env.QDRANT_CODE_VECTOR_NAME ?? 'content');
const TURBOVEC_GRPC_URL = String(args.get('turbovec-grpc') ?? env.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062');
const GO_RETRIEVAL_URL = String(args.get('go-retrieval-url') ?? env.GO_RETRIEVAL_HTTP_URL ?? env.RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, '');
const LANGEXTRACT_URL = String(args.get('langextract-url') ?? env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8095').replace(/\/+$/, '');
const SYNTHESIS_URL = String(args.get('synthesis-url') ?? env.LOCAL_OPENAI_BASE_URL ?? 'http://127.0.0.1:8090/v1').replace(/\/+$/, '');
const SYNTHESIS_MODEL = String(args.get('synthesis-model') ?? env.LLAMA_SERVER_MODEL ?? env.LANGEXTRACT_MODEL ?? 'ornith-1.5-9b');

function lane(status, detail = {}) {
  return { status, ...detail };
}

function evidenceIdFor(row) {
  return `ev_${createHash('sha256').update(`${row.packet_key}|${row.source_ref_key ?? ''}|${row.source_ref}`).digest('hex').slice(0, 16)}`;
}

function liveSourceByteLength(sourceRef) {
  for (const root of SOURCE_REF_ROOTS) {
    try {
      const abs = path.resolve(root, sourceRef);
      if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
      if (fs.statSync(abs).isFile()) return fs.statSync(abs).size;
    } catch { /* try next root */ }
  }
  return null;
}

function statusFromLanes(lanes) {
  const statuses = Object.values(lanes).map((value) => value.status);
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('FALLBACK_PASS') || statuses.includes('WARN') || statuses.includes('DIAGNOSTIC_PASS')) return 'WARN';
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
    const search = await fetchJson(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: vector,
        using: QDRANT_VECTOR_NAME,
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
    const hits = (search?.result?.points ?? []).map((hit) => ({
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

export async function postgresPgVectorShortlist(vector) {
  const started = Date.now();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const vectorStr = `[${vector.join(',')}]`;
    const limit = Math.max(TOP_K * 2, 10);
    const query = `
      SELECT id, qdrant_id, relative_path, symbol, kind, line_start, line_end,
             1 - (content_embedding_768 <=> $1::vector) AS score
      FROM codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL
      ORDER BY content_embedding_768 <=> $1::vector
      LIMIT $2;
    `;
    const result = await pool.query(query, [vectorStr, limit]);
    const hits = result.rows.map((row) => ({
      id: String(row.id),
      qdrant_id: row.qdrant_id ? String(row.qdrant_id) : null,
      score: Number(row.score ?? 0),
      source_ref: row.relative_path,
      symbol: row.symbol ?? null,
      kind: row.kind ?? null,
      line_start: row.line_start ?? null,
      line_end: row.line_end ?? null,
    }));
    return {
      hits,
      lane: lane(hits.length > 0 ? 'LIVE_PASS' : 'FAIL', {
        table: 'codebase_chunk_index',
        column: 'content_embedding_768',
        index: 'idx_codebase_chunk_content_embedding_768_hnsw',
        hits: hits.length,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      hits: [],
      lane: lane('FAIL', {
        table: 'codebase_chunk_index',
        column: 'content_embedding_768',
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  } finally {
    await pool.end();
  }
}

export function measurePgVectorQdrantParity(pgHits, qdrantHits, topK = TOP_K) {
  const pgTop = pgHits.slice(0, topK);
  const qdrantTop = qdrantHits.slice(0, topK);

  const pgQdrantIds = new Set(pgTop.map((h) => h.qdrant_id).filter(Boolean));
  const pgSourceRefs = new Set(pgTop.map((h) => h.source_ref).filter(Boolean));

  let idOverlapCount = 0;
  let sourceRefOverlapCount = 0;
  const overlaps = [];

  for (const qHit of qdrantTop) {
    const matchById = qHit.id && pgQdrantIds.has(qHit.id);
    const matchByPath = qHit.source_ref && pgSourceRefs.has(qHit.source_ref);
    if (matchById) idOverlapCount++;
    if (matchByPath) sourceRefOverlapCount++;
    if (matchById || matchByPath) {
      overlaps.push({
        qdrant_id: qHit.id,
        source_ref: qHit.source_ref,
        qdrant_score: qHit.score,
        pg_score: pgTop.find((p) => p.qdrant_id === qHit.id || p.source_ref === qHit.source_ref)?.score ?? null,
      });
    }
  }

  const overlapRatio = topK > 0 ? idOverlapCount / topK : 0;
  return {
    top_k_evaluated: topK,
    pgvector_hits: pgHits.length,
    qdrant_hits: qdrantHits.length,
    id_overlap_count: idOverlapCount,
    source_ref_overlap_count: sourceRefOverlapCount,
    id_overlap_ratio: Number(overlapRatio.toFixed(3)),
    parity_status: overlapRatio >= 0.7 ? 'HIGH_PARITY' : (overlapRatio > 0 ? 'PARTIAL_PARITY' : 'DIVERGENT'),
    overlap_samples: overlaps,
  };
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

async function postgresTruthJoin(qdrantHits, goResults, pgHits = []) {
  const started = Date.now();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const packetKeys = [
      ...qdrantHits.map((hit) => hit.packet_key),
      ...goResults.map((hit) => hit?.sourceMetadata?.packetKey ?? hit?.source_metadata?.packet_key ?? hit?.packet_key ?? hit?.id ?? hit?.chunkId ?? hit?.chunk_id),
      ...pgHits.map((hit) => hit.packet_key ?? hit.qdrant_id),
    ].filter(Boolean).map(String);
    const sourceRefs = [
      ...qdrantHits.map((hit) => hit.source_ref),
      ...goResults.map((hit) => hit?.filePath ?? hit?.file_path ?? hit?.sourceMetadata?.sourceRef ?? hit?.source_metadata?.source_ref),
      ...pgHits.map((hit) => hit.source_ref),
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

  async function ornithInlineExtraction(reason) {
    const body = await fetchJson(`${SYNTHESIS_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LOCAL_OPENAI_API_KEY ?? 'local'}`,
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Extract compact codebase feature metadata. Return strict JSON only with entities, keywords, and structure.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Extract entities, keywords, dependencies, and document_type from these Parent Atlas packet rows.',
              content,
              required_json: {
                entities: [{ text: 'string', label: 'string' }],
                keywords: ['string'],
                structure: { document_type: 'string', dependencies: ['string'] },
              },
            }),
          },
        ],
        temperature: 0.1,
        max_tokens: 420,
        response_format: { type: 'json_object' },
      }),
      timeoutMs: 90_000,
    });
    const sanitized = sanitizeGemma4Summary(body?.choices?.[0]?.message?.content ?? '');
    let parsed;
    try {
      parsed = JSON.parse(sanitized.summary || sanitized.cleaned || '{}');
    } catch {
      parsed = {
        entities: [],
        keywords: [],
        structure: { document_type: 'codebase_feature_envelope', parse_error: true },
      };
    }
    parsed.entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    parsed.structure = parsed.structure && typeof parsed.structure === 'object'
      ? parsed.structure
      : { document_type: 'codebase_feature_envelope' };
    return {
      body: parsed,
      lane: lane('FALLBACK_PASS', {
        url: LANGEXTRACT_URL,
        fallback_url: SYNTHESIS_URL,
        fallback_used: true,
        reason,
        entities: parsed.entities.length,
        structure_keys: Object.keys(parsed.structure).length,
        duration_ms: Date.now() - started,
      }),
    };
  }

  try {
    const body = await fetchJson(`${LANGEXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: content,
        source_type: 'plain_text',
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
    try {
      return await ornithInlineExtraction(`LangExtract unavailable: ${error.message}`);
    } catch (fallbackError) {
      return {
        body: null,
        lane: lane('FAIL', {
          url: LANGEXTRACT_URL,
          fallback_url: SYNTHESIS_URL,
          error: error.message,
          fallback_error: fallbackError.message,
          duration_ms: Date.now() - started,
        }),
      };
    }
  }
}

// Live byte-level source identity (canonical sourceRevision = sha256 of exact file bytes).
// Computed from the worktree at proof time; it is NOT compared with the indexed chunk revision,
// which is still NULL for most rows (see GAP-P5), so the packet stays index-unqualified.
// source_ref values are relative to either the repo root or sveltekit-frontend/ (both exist in this corpus),
// so try each root in order and accept only a regular file that lies inside that root.
const SOURCE_REF_ROOTS = [REPO_ROOT, path.join(REPO_ROOT, 'sveltekit-frontend')];
function liveSourceRevision(sourceRef) {
  for (const root of SOURCE_REF_ROOTS) {
    try {
      const abs = path.resolve(root, sourceRef);
      if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
      if (!fs.statSync(abs).isFile()) continue;
      return `sha256:${createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}`;
    } catch {
      // try the next root
    }
  }
  return null;
}

// Fail-closed citation verifier (identity, revision, span membership only; not semantic support).
// Citations must name an admitted evidence_id. Missing, ambiguous, stale, or out-of-span citations are rejected.
export function verifyCitations(citations, evidence) {
  const byId = new Map();
  for (const item of evidence) {
    const group = byId.get(item.evidence_id) ?? [];
    group.push(item);
    byId.set(item.evidence_id, group);
  }
  const raw = Array.isArray(citations) ? citations : [];
  const accepted = [];
  const rejected = [];
  for (const citation of raw) {
    const matches = byId.get(citation?.evidence_id) ?? [];
    let reason = null;
    if (matches.length === 0) reason = 'UNKNOWN_EVIDENCE_ID';
    else if (matches.length !== 1) reason = 'AMBIGUOUS_EVIDENCE';
    else if (matches[0].live_source_revision == null) reason = 'SOURCE_UNAVAILABLE';
    else if (!citation.source_revision) reason = 'MISSING_SOURCE_REVISION';
    else if (citation.source_revision !== matches[0].live_source_revision) reason = 'REVISION_MISMATCH';
    else if (
      !Number.isSafeInteger(citation.start_byte) ||
      !Number.isSafeInteger(citation.end_byte) ||
      citation.start_byte < matches[0].start_byte ||
      citation.end_byte > matches[0].end_byte ||
      citation.start_byte >= citation.end_byte
    ) reason = 'SPAN_OUT_OF_BOUNDS';
    if (reason) rejected.push({ citation, reason });
    else accepted.push({
      evidence_id: matches[0].evidence_id,
      source_ref: matches[0].source_ref,
      source_revision: matches[0].live_source_revision,
      start_byte: citation.start_byte,
      end_byte: citation.end_byte,
    });
  }
  return {
    status: rejected.length ? 'PARTIAL_UNGROUNDED' : accepted.length ? 'CITATION_MEMBERSHIP_PASS' : 'NO_CITATIONS_RETURNED',
    admittedCount: evidence.length,
    raw_citations: raw,
    accepted,
    rejected,
  };
}

async function ornithSynthesis(rows, extraction) {
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
      evidence_id: evidenceIdFor(row),
      live_source_revision: liveSourceRevision(row.source_ref),
      start_byte: 0,
      end_byte: liveSourceByteLength(row.source_ref),
      authority: 'DIAGNOSTIC_ONLY',
    })),
    packet_status: {
      canonical_authority: false,
      index_revision_qualified: false,
      note: 'live_source_revision is computed from the worktree bytes; indexed source_revision is NULL for most chunk rows (GAP-P5).',
    },
    extraction: {
      entity_count: Array.isArray(extraction?.entities) ? extraction.entities.length : 0,
      entities: Array.isArray(extraction?.entities) ? extraction.entities.slice(0, 12) : [],
      structure: extraction?.structure ?? {},
    },
    rules: [
      'Use only provided source_refs and extracted structure.',
      'Cite only evidence_id values listed in source_refs. Never cite a path or invent an ID.',
      'Each citation must copy source_revision exactly and give start_byte and end_byte within that evidence span.',
      'Do not invent files, tools, services, ports, or graph edges.',
      'Return compact JSON only.',
      'Limit citations array to at most 6 most relevant items.',
    ],
  };
  try {
    const body = await fetchJson(`${SYNTHESIS_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LOCAL_OPENAI_API_KEY ?? 'local'}`,
      },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You summarize bounded Parent Atlas feature envelopes. Return compact JSON only with summary, domain_class, ontology_label, topology_label, citations (at most 6 items, each {evidence_id, source_revision, start_byte, end_byte}), missing_evidence, confidence.',
          },
          { role: 'user', content: JSON.stringify(envelope) },
        ],
        temperature: 0.1,
        max_tokens: 2500,
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

    const cited = Array.isArray(parsed?.citations) ? parsed.citations : [];
    const citationVerification = verifyCitations(cited, envelope.source_refs);

    // Maintain true model output without silent truncation; supply sanitized display separately
    const displaySanitizedSummary = parsed ? {
      ...parsed,
      display_sanitized_source_refs: citationVerification.accepted.map((item) => item.source_ref),
      rejected_citations: citationVerification.rejected,
      raw_citations: citationVerification.raw_citations,
    } : { summary: sanitized.summary };

    // Unsealed diagnostic run: a clean citation pass is DIAGNOSTIC_PASS, never production-admitted LIVE_PASS.
    const synthesisLaneStatus = sanitized.safe && citationVerification.status === 'CITATION_MEMBERSHIP_PASS'
      ? 'DIAGNOSTIC_PASS'
      : (sanitized.safe && citationVerification.accepted.length > 0 ? 'WARN' : 'FAIL');

    return {
      summary: parsed ?? { summary: sanitized.summary },
      display_summary: displaySanitizedSummary,
      lane: lane(synthesisLaneStatus, {
        url: SYNTHESIS_URL,
        model: SYNTHESIS_MODEL,
        reasoning_leak_stripped: sanitized.changed,
        json_parsed: Boolean(parsed),
        output_chars: sanitized.summary.length,
        citation_verification: citationVerification,
        cited_source_refs: cited.length,
        accepted_source_refs: citationVerification.accepted.length,
        rejected_source_refs: citationVerification.rejected,
        duration_ms: Date.now() - started,
      }),
    };
  } catch (error) {
    return {
      summary: null,
      lane: lane('FAIL', {
        url: SYNTHESIS_URL,
        model: SYNTHESIS_MODEL,
        error: error.message,
        duration_ms: Date.now() - started,
      }),
    };
  }
}

// Windows can hold the report open (AV, editor, indexer); fall back to versioned timestamp file if locked.
function safeWriteFileSync(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  } catch (error) {
    if (['EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(filePath);
      const base = filePath.slice(0, -ext.length);
      const fallbackPath = `${base}-${ts}${ext}`;
      try {
        fs.writeFileSync(fallbackPath, content, 'utf8');
        console.warn(`[safeWriteFileSync] Note: ${filePath} is held by another process; preserved and wrote to ${fallbackPath}`);
        return fallbackPath;
      } catch (fallbackError) {
        console.error(`[safeWriteFileSync] Fallback write also failed:`, fallbackError);
      }
    }
    throw error;
  }
}

function markdown(report) {
  const parityLines = report.parity_pgvector_qdrant ? [
    '## Canonical pgvector ↔ Qdrant Parity',
    '',
    `Status: ${report.parity_pgvector_qdrant.parity_status}`,
    `ID Overlap: ${report.parity_pgvector_qdrant.id_overlap_count} / ${report.parity_pgvector_qdrant.top_k_evaluated} (${(report.parity_pgvector_qdrant.id_overlap_ratio * 100).toFixed(1)}%)`,
    `Path Overlap: ${report.parity_pgvector_qdrant.source_ref_overlap_count} / ${report.parity_pgvector_qdrant.top_k_evaluated}`,
    '',
  ] : [];

  return [
    '# Retrieval Summarization Flow Proof',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Query: ${report.query}`,
    '',
    '## Contract',
    '',
    'EmbeddingGemma -> Qdrant content shortlist + Postgres pgvector shortlist -> TurboVec gRPC transform/prefilter -> Go Retrieval -> Postgres truth join -> LangExtract -> Ornith 1.5 bounded summary.',
    '',
    '| lane | status | detail |',
    '|---|---:|---|',
    ...Object.entries(report.lanes).map(([name, value]) => `| ${name} | ${value.status} | ${String(value.error ?? value.reason ?? value.url ?? value.grpc_url ?? value.table ?? '').replace(/\|/g, '/')} |`),
    '',
    ...parityLines,
    '## Summary Preview',
    '',
    '```json',
    JSON.stringify(report.summary, null, 2).slice(0, 2000),
    '```',
    '',
  ].join('\n');
}

// DAG alignment receipt: maps each layer of the provenance spine to a status read from live data.
// Nothing here is typed in; a blocked layer reports the exact live reason. It does not override any gate.
async function dagAlignment(rows, report) {
  const sourceRefs = rows.map((r) => r.source_ref).filter(Boolean);
  const digested = sourceRefs.filter((ref) => liveSourceRevision(ref) !== null).length;
  let chunkRowsWithRevision = null;
  let chunkRowsTotal = null;
  let admissionVerdict = null;
  let admissionReason = null;
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const r = await pool.query('select count(*) filter (where source_revision is not null)::int as with_rev, count(*)::int as total from codebase_chunk_index');
    chunkRowsWithRevision = r.rows[0].with_rev;
    chunkRowsTotal = r.rows[0].total;
  } catch (error) {
    chunkRowsWithRevision = `QUERY_FAILED:${error.message}`;
  } finally {
    await pool.end();
  }
  try {
    const audit = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'docs/reports/atlas-canonical-projection-fabric-audit-2026-09-28.json'), 'utf8'));
    admissionVerdict = audit.overall_verdict ?? null;
    admissionReason = audit.overall_verdict_reason ?? null;
  } catch (error) {
    admissionVerdict = `UNREADABLE:${error.message}`;
  }
  const layers = [
    { layer: 1, name: 'source_bytes_sha256', status: digested === sourceRefs.length && sourceRefs.length > 0 ? 'LIVE_PASS' : 'PARTIAL', evidence: { digested, of: sourceRefs.length } },
    { layer: 2, name: 'candidate_ordinal_map', status: 'NOT_BUILT', evidence: { reason: 'proof does not seal a CandidateOrdinalMapV1' } },
    { layer: 3, name: 'ace_packet_v3_sealed', status: 'BLOCKED', evidence: { chunk_rows_with_source_revision: chunkRowsWithRevision, chunk_rows_total: chunkRowsTotal, reason: 'source_revision NULL for most rows; workspace_revision is an integer default 0 in atlas_packets' } },
    { layer: 4, name: 'context_manifest_admission', status: admissionVerdict === 'NOT_SAFE_TO_PROJECT' || admissionVerdict === null || String(admissionVerdict).startsWith('UNREADABLE') ? 'BLOCKED' : 'ADMITTED_CHECK_REQUIRED', evidence: { projection_admission: admissionVerdict, reason: admissionReason } },
    { layer: 5, name: 'context_compression_headroom', status: 'NOT_BUILT', evidence: { canonicalAuthority: false, note: 'downstream of ContextManifest only' } },
    { layer: 6, name: 'bitfrost_key', status: 'NOT_PROVEN', evidence: { note: 'no manifest-keyed cache key built for this run' } },
    { layer: 7, name: 'ornith_synthesis', status: report.lanes.ornith_synthesis?.status ?? 'MISSING', evidence: { model: report.lanes.ornith_synthesis?.model ?? null, ungrounded: report.lanes.ornith_synthesis?.ungrounded_source_refs ?? null } },
  ];
  return layers;
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

  const [qdrant, pgvector] = await Promise.all([
    qdrantShortlist(embedding.vector),
    postgresPgVectorShortlist(embedding.vector),
  ]);
  report.lanes.qdrant = qdrant.lane;
  report.lanes.postgres_pgvector = pgvector.lane;
  report.candidates.qdrant = qdrant.hits.slice(0, TOP_K);
  report.candidates.postgres_pgvector = pgvector.hits.slice(0, TOP_K);
  report.parity_pgvector_qdrant = measurePgVectorQdrantParity(pgvector.hits, qdrant.hits, TOP_K);

  const turbo = await turbovecTransform(embedding.vector);
  report.lanes.turbovec_grpc = turbo.lane;

  const go = await goRetrievalSearch();
  report.lanes.go_retrieval = go.lane;
  report.candidates.go_retrieval_count = go.results.length;

  const truth = await postgresTruthJoin(qdrant.hits, go.results, pgvector.hits);
  report.lanes.postgres_truth_join = truth.lane;

  const extraction = await langextract(truth.rows);
  report.lanes.langextract = extraction.lane;

  const summary = await ornithSynthesis(truth.rows, extraction.body);
  report.lanes.ornith_synthesis = summary.lane;
  report.summary = summary.summary;

  report.dag_alignment = await dagAlignment(truth.rows, report);

  report.chain_status = report.dag_alignment.every((l) => l.status === "LIVE_PASS") ? "ALIGNED" : "NOT_ALIGNED";
  report.status = statusFromLanes(report.lanes);
  report.elapsed_ms = Date.now() - started;

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  safeWriteFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');
  safeWriteFileSync(OUT_MD, markdown(report));
  console.log(JSON.stringify({
    status: report.status,
    lanes: Object.fromEntries(Object.entries(report.lanes).map(([key, value]) => [key, value.status])),
    parity: report.parity_pgvector_qdrant?.parity_status ?? null,
    out_json: OUT_JSON,
    out_md: OUT_MD,
  }, null, 2));
  process.exit(report.status === 'FAIL' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Error in flow proof main():', error);
    const report = {
      generated_at: new Date().toISOString(),
      status: 'FAIL',
      query: QUERY,
      error: error.message,
    };
    try {
      fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
      safeWriteFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n');
      safeWriteFileSync(OUT_MD, markdown({ ...report, lanes: {}, summary: null }));
    } catch (writeErr) {
      console.error('Failed to write failure report files:', writeErr);
    }
    process.exit(1);
  });
}
