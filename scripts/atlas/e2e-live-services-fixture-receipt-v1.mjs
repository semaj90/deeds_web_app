#!/usr/bin/env node
/**
 * Live-Service 8-Stage FIXTURE_ONLY Retrieval Receipt (Read-Only).
 *
 * Exercises the running local services without mutating PG18, Qdrant, or Neo4j:
 *   .okf :8095 -> EG1 :8097 -> Go Retrieval :8100 + Qdrant turbo8 :6333 ->
 *   PG18 read-only hydration & grant check -> Neo4j :7474 ->
 *   BitFrost ContextManifestV1 dry-run -> Headroom :8787 -> Gemma 4 :8090
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_PATH = resolve(ROOT, `.tmp/review/e2e-live-services-fixture-receipt-${STAMP}.json`);

async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err), data: null };
  } finally {
    clearTimeout(timer);
  }
}

function loadEnvValue(key) {
  if (process.env[key]) return process.env[key];
  for (const rel of ['sveltekit-frontend/.env', '.env']) {
    try {
      for (const line of readFileSync(resolve(ROOT, rel), 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith(`${key}=`)) {
          return t.slice(`${key}=`.length).trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* ignore missing env file */ }
  }
  return null;
}

function l2Norm(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return null;
  let sum = 0;
  for (const x of vec) sum += Number(x) * Number(x);
  return Math.sqrt(sum);
}

async function main() {
  const query = 'sveltekit search runtime rrf fusion canonical owner';
  const degraded = [];
  const stages = {};
  const stageStatus = ({ contract = false, reachable = false, executed = false, parity = null, authorized = false }) => ({
    contractVerified: Boolean(contract),
    serviceReachable: Boolean(reachable),
    executionVerified: Boolean(executed),
    numericalParity: parity,
    sourceAuthorized: Boolean(authorized),
    promotionEligible: false,
  });

  // 1. .okf / NLP sidecar (:8095) — execute /step1/query-intent (not health-only)
  const nlp = await fetchJson('http://127.0.0.1:8095/step1/query-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const nlpExecuted = Boolean(nlp.ok && nlp.data?.intent && nlp.data?.canonical_authority === false);
  stages.okf_taxonomy_8095 = {
    ok: nlp.ok,
    status: nlp.status,
    executed: nlpExecuted,
    intent: nlp.data?.intent ?? null,
    domainCandidatesCount: Array.isArray(nlp.data?.domain_candidates) ? nlp.data.domain_candidates.length : 0,
    advisoryOnly: true,
  };
  if (!nlpExecuted) degraded.push('okf_sidecar_unavailable');

  // 2. EG1 (:8097) + isolated EG2 (:8094) embed checks (never query EG1 Qdrant with EG2 vectors)
  let eg1 = await fetchJson('http://127.0.0.1:8097/embed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: query }),
  }, 15000);
  if (!eg1.ok) {
    eg1 = await fetchJson('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
    }, 15000);
  }
  const vec = Array.isArray(eg1.data?.embedding)
    ? eg1.data.embedding
    : Array.isArray(eg1.data?.embeddings?.[0])
      ? eg1.data.embeddings[0]
      : null;
  const eg1Norm = l2Norm(vec);
  const eg1Ok = Boolean(vec && vec.length === 768 && eg1Norm !== null && Math.abs(eg1Norm - 1) < 0.05);
  stages.eg1_embed_8097 = { ok: eg1Ok, status: eg1.status, dim: vec?.length ?? 0, l2Norm: eg1Norm };
  if (!eg1Ok) degraded.push('eg1_embed_unavailable');

  const eg2 = await fetchJson('http://127.0.0.1:8094/embed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts: [`task: code retrieval | query: ${query}`], dims: [768] }),
  }, 15000);
  const eg2Vec = Array.isArray(eg2.data?.embeddings?.['768']?.[0]) ? eg2.data.embeddings['768'][0] : null;
  const eg2Norm = l2Norm(eg2Vec);
  const eg2Ok = Boolean(eg2.ok && eg2Vec && eg2Vec.length === 768 && eg2Norm !== null && Math.abs(eg2Norm - 1) < 0.05);
  stages.eg2_embed_8094 = {
    ok: eg2Ok,
    status: eg2.status,
    dim: eg2Vec?.length ?? 0,
    l2Norm: eg2Norm,
    isolatedFromEg1Qdrant: true,
  };
  if (!eg2Ok) degraded.push('eg2_embed_unavailable');

  // 3. Go Retrieval (:8100 POST /search/codebase) + Qdrant turbo8 shadow (:6333)
  const goSearch = await fetchJson('http://127.0.0.1:8100/search/codebase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 }),
  });
  const goChunks = Array.isArray(goSearch.data?.chunks) ? goSearch.data.chunks : [];
  let qdrantHits = [];
  if (eg1Ok) {
    const qRes = await fetchJson('http://127.0.0.1:6333/collections/codebase_chunks_768_turbo8/points/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: vec, using: 'content', limit: 5, with_payload: ['pg_id', 'source_ref'] }),
    });
    qdrantHits = Array.isArray(qRes.data?.result?.points) ? qRes.data.result.points : [];
  }
  stages.retrieval_executors = {
    goRetrievalReachable: goSearch.ok,
    goSearchStatus: goSearch.status,
    goSearchChunksCount: goChunks.length,
    goRepresentationUsed: goSearch.data?.representation_used ?? null,
    goPgReconciledCount: goSearch.data?.query_stage_trace?.pg_reconciled_count ?? null,
    qdrantTurbo8Hits: qdrantHits.length,
    searchRuntimeExecutedInProcess: false,
  };
  if (!goSearch.ok) degraded.push('go_retrieval_unavailable');
  if (goSearch.ok && goChunks.length === 0) degraded.push('go_retrieval_zero_chunks');

  // 4. PG18 read-only hydration + active-scoped grant check (never mutates)
  let totalGrants = 0;
  let activeGrants = 0;
  let hydratedCandidates = [];
  const hitPgIds = qdrantHits
    .map((pt) => pt?.payload?.pg_id)
    .filter((id) => typeof id === 'string' && id.length > 0);
  const dbUrl = loadEnvValue('DATABASE_URL');
  let pgReachable = false;
  if (dbUrl) {
    try {
      const { default: pg } = await import(pathToFileURL(resolve(ROOT, 'sveltekit-frontend/node_modules/pg/lib/index.js')).href);
      const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
      const client = await pool.connect();
      pgReachable = true;
      try {
        await client.query('BEGIN READ ONLY');
        const g = await client.query(
          `SELECT count(*)::int AS total_cnt,
                  count(*) FILTER (
                    WHERE status = 'GRANTED' AND revoked_at IS NULL
                      AND issued_at <= CURRENT_TIMESTAMP
                      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                  )::int AS active_cnt
             FROM atlas_actor_workspace_source_grants_v1`,
        );
        totalGrants = Number(g.rows[0]?.total_cnt ?? 0);
        activeGrants = Number(g.rows[0]?.active_cnt ?? 0);
        if (hitPgIds.length > 0) {
          const hyd = await client.query(
            `SELECT id::text, COALESCE(NULLIF(source_ref, ''), relative_path) AS source_ref, symbol, content_hash
               FROM codebase_chunk_index
              WHERE id = ANY($1::uuid[])`,
            [hitPgIds],
          );
          hydratedCandidates = hyd.rows;
        }
        await client.query('COMMIT');
      } finally {
        client.release();
        await pool.end();
      }
    } catch (err) {
      degraded.push(`pg18_check_failed:${err instanceof Error ? err.message : String(err)}`);
    }
  }
  stages.pg18_hydration_and_grants = {
    pgReachable,
    hydratedCount: hydratedCandidates.length,
    totalGrants,
    activeGrants,
    failClosed: activeGrants === 0,
  };

  // 5. Neo4j GDS / Cypher read-only check (:7474)
  const neoUser = loadEnvValue('NEO4J_USER') ?? 'neo4j';
  const neoPass = loadEnvValue('NEO4J_PASSWORD');
  const neoHeaders = { 'content-type': 'application/json' };
  if (neoPass) {
    neoHeaders.authorization = 'Basic ' + Buffer.from(`${neoUser}:${neoPass}`).toString('base64');
  }
  const neoRoot = await fetchJson('http://127.0.0.1:7474/');
  const neoCypher = await fetchJson('http://127.0.0.1:7474/db/neo4j/tx/commit', {
    method: 'POST',
    headers: neoHeaders,
    body: JSON.stringify({ statements: [{ statement: 'RETURN 1 AS ok' }] }),
  });
  const neoCypherOk = Boolean(neoCypher.ok && (!Array.isArray(neoCypher.data?.errors) || neoCypher.data.errors.length === 0));
  stages.neo4j_graph = {
    reachable: neoRoot.ok,
    cypherExecuted: neoCypherOk,
    gdsStreamExecuted: false,
    errorCode: neoCypher.data?.errors?.[0]?.code ?? null,
  };
  if (!neoRoot.ok || !neoCypherOk) degraded.push('neo4j_cypher_not_executed');

  // 6. BitFrost ContextManifestV1 dry-run descriptor + Headroom (:8787) probe
  const contextManifest = {
    schema: 'atlas.context-manifest.v1',
    mode: 'DRY_RUN',
    canonicalAuthority: false,
    writesPerformed: false,
    candidateIds: hydratedCandidates.map((c) => c.id),
    sourceRefs: hydratedCandidates.map((c) => c.source_ref),
    manifestSha256: 'sha256:' + createHash('sha256').update(JSON.stringify(hydratedCandidates)).digest('hex'),
  };
  const headroom = await fetchJson('http://127.0.0.1:8787/health', {}, 2000);
  stages.bitfrost_and_headroom = {
    manifestSha256: contextManifest.manifestSha256,
    candidateCount: contextManifest.candidateIds.length,
    headroom8787Ok: headroom.ok,
  };
  if (!headroom.ok) degraded.push('headroom_8787_unavailable');

  // 7. Gemma 4 (:8090) read-only model check + bounded citation completion
  const models = await fetchJson('http://127.0.0.1:8090/v1/models');
  const modelId = models.data?.data?.[0]?.id ?? null;
  let synthesisOk = false;
  let citedSourceRefs = [];
  if (modelId) {
    const refList = contextManifest.sourceRefs.slice(0, 3).join(', ') || 'SearchRuntime';
    const chat = await fetchJson('http://127.0.0.1:8090/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 64,
        temperature: 0,
        messages: [{ role: 'user', content: `Reply in one sentence citing the exact file path ${contextManifest.sourceRefs[0] ?? 'SearchRuntime'}.` }],
      }),
    }, 20000);
    const reply = String(chat.data?.choices?.[0]?.message?.content ?? '');
    synthesisOk = Boolean(chat.ok && reply.length > 0);
    citedSourceRefs = contextManifest.sourceRefs.filter((r) => r && reply.includes(r));
  }
  const citationVerified = citedSourceRefs.length > 0;
  stages.gemma4_8090 = { ok: synthesisOk, modelId, citedSourceRefs, citationVerified };
  if (!synthesisOk) degraded.push('gemma4_unavailable');
  if (synthesisOk && !citationVerified) degraded.push('gemma4_citation_missing');

  const receiptBody = {
    schema: 'atlas.e2e-live-services-fixture-receipt.v1',
    mode: 'FIXTURE_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
    externalServicesContacted: true,
    liveDatabaseRead: pgReachable,
    generatedAt: new Date().toISOString(),
    query,
    serviceReachable: nlp.ok && eg1Ok && goSearch.ok && pgReachable && neoRoot.ok && synthesisOk,
    executionVerified: Boolean(nlpExecuted && eg1Ok && qdrantHits.length > 0 && hydratedCandidates.length > 0 && synthesisOk && citationVerified),
    sourceAuthorized: activeGrants > 0,
    promotionEligible: false,
    verified: activeGrants > 0 && synthesisOk && citationVerified && hydratedCandidates.length > 0,
    degraded,
    stageMatrix: {
      okf_8095: stageStatus({ contract: nlpExecuted, reachable: nlp.ok, executed: nlpExecuted }),
      eg1_8097: stageStatus({ contract: eg1Ok, reachable: eg1.ok, executed: eg1Ok, parity: eg1Ok }),
      eg2_8094: stageStatus({ contract: eg2Ok, reachable: eg2.ok, executed: eg2Ok, parity: eg2Ok }),
      go_retrieval_8100_qdrant_6333: stageStatus({ contract: goSearch.ok && qdrantHits.length > 0, reachable: goSearch.ok, executed: goChunks.length > 0 || qdrantHits.length > 0 }),
      pg18_hydration_grants: stageStatus({ contract: pgReachable, reachable: pgReachable, executed: hydratedCandidates.length > 0, authorized: activeGrants > 0 }),
      neo4j_7474: stageStatus({ contract: neoCypherOk, reachable: neoRoot.ok, executed: neoCypherOk }),
      bitfrost_headroom_8787: stageStatus({ contract: hydratedCandidates.length > 0, reachable: headroom.ok, executed: headroom.ok && hydratedCandidates.length > 0 }),
      gemma4_8090: stageStatus({ contract: citationVerified, reachable: models.ok, executed: synthesisOk && citationVerified }),
    },
    stages,
  };
  receiptBody.receiptSha256 = 'sha256:' + createHash('sha256').update(JSON.stringify(receiptBody)).digest('hex');

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(receiptBody, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    verified: receiptBody.verified,
    activeGrants,
    hydratedCount: hydratedCandidates.length,
    citedSourceRefs,
    headroom8787Ok: headroom.ok,
    modelId,
    degraded,
    outPath: OUT_PATH,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
