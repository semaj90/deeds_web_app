#!/usr/bin/env node

import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..', '..');
const frontendReportsRoot = path.resolve(frontendRoot, 'docs', 'reports');

dotenv.config({ path: path.resolve(frontendRoot, '.env') });
dotenv.config({ path: path.resolve(frontendRoot, '.env.local'), override: true });

const REPORT_DIR = path.resolve(frontendReportsRoot, 'sessions');
const REPORT_PATH = path.resolve(
  REPORT_DIR,
  `phase109-unified-retrieval-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

const QUERIES = [
  {
    id: 'exact-symbol',
    query: 'reciprocalRankFusion',
    kind: 'exact symbol',
  },
  {
    id: 'feature-hyperrag',
    query: 'HyperRAG packet retrieval and ACE context assembly',
    kind: 'feature',
  },
  {
    id: 'structural',
    query: 'where is local Gemma tool execution routed',
    kind: 'structural',
  },
  {
    id: 'research',
    query: 'crawl web document extraction and research ingestion',
    kind: 'research',
  },
];

function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeQuery(query) {
  return String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKeyForTopK(query, limit) {
  return `qdrant:topk:v1:${sha256Hex(normalizeQuery(query))}:${limit}`;
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function extractQdrantDimension(result) {
  const vectors = result?.config?.params?.vectors ?? result?.config?.vectors ?? null;
  if (!vectors) return null;
  if (typeof vectors?.size === 'number') return vectors.size;

  if (typeof vectors === 'object') {
    const sizes = Object.values(vectors)
      .map((entry) => entry?.size)
      .filter((size) => Number.isFinite(Number(size)))
      .map(Number);
    if (sizes.length > 0) return sizes[0];
  }

  return null;
}

async function probeQdrantCollection(baseUrl, collection) {
  const response = await fetch(`${baseUrl}/collections/${collection}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Qdrant collection ${collection} HTTP ${response.status}`);
  }

  const payload = await response.json();
  const result = payload?.result ?? payload;
  return {
    collection,
    count: asNumber(result?.points_count ?? result?.vectors_count ?? 0),
    dimensions: extractQdrantDimension(result),
    raw: result,
  };
}

async function probeOpenAICompatibleChat(baseUrl, model, messages) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`Synthesis HTTP ${response.status}: ${raw.slice(0, 500)}`);
  }

  const text = json?.choices?.[0]?.message?.content ?? '';
  return {
    provider: 'llama-server-openai-compatible',
    model: json?.model ?? model,
    responseChars: text.length,
    text,
    raw: json ?? raw,
  };
}

function topCountBySource(candidates, predicate) {
  return candidates.filter(predicate).length;
}

function pickBestScore(candidates, predicate) {
  const matches = candidates.filter(predicate);
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((candidate) => candidate.score ?? 0));
}

function toCandidateView(candidate) {
  return {
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    fusionScore: asNumber(candidate.fusionScore),
    rankBefore: asNumber(candidate.rankBefore, 1),
    score: asNumber(candidate.score),
    scoreSource: candidate.scoreSource,
    qdrantPointId: candidate.qdrantPointId,
    packetId: candidate.packetId,
    denseScore: candidate.scoreSource.startsWith('qdrant') ? asNumber(candidate.score) : undefined,
    bm25Score: candidate.scoreSource === 'postgres_trigram' ? asNumber(candidate.score) : undefined,
    astScore: candidate.scoreSource === 'ast_tree' ? asNumber(candidate.score) : undefined,
    graphScore: candidate.scoreSource === 'rg_keyword' ? asNumber(candidate.score) : undefined,
  };
}

async function probeNeo4j(neo4jDriver, packetKeys) {
  if (packetKeys.length === 0) {
    return {
      seedNodesFound: 0,
      expandedNodes: 0,
      edgeTypes: {
        SIMILAR_TOPOLOGY: 0,
        BELONGS_TO: 0,
        IMPORTS: 0,
        USES: 0,
      },
    };
  }

  const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const seedResult = await session.run(
      `
      MATCH (p:Packet)
      WHERE p.packet_key IN $packetKeys
      RETURN count(DISTINCT p) AS seedNodesFound
      `,
      { packetKeys },
    );

    const expansionResult = await session.run(
      `
      MATCH (p:Packet)
      WHERE p.packet_key IN $packetKeys
      OPTIONAL MATCH (p)-[:SIMILAR_TOPOLOGY]-(neighbor:Packet)
      RETURN count(DISTINCT neighbor) AS expandedNodes
      `,
      { packetKeys },
    );

    const edgeTypes = {};
    for (const type of ['SIMILAR_TOPOLOGY', 'BELONGS_TO', 'IMPORTS', 'USES']) {
      const result = await session.run(
        `
        MATCH ()-[r:${type}]-()
        RETURN count(r) AS count
        `,
      );
      edgeTypes[type] = asNumber(result.records[0]?.get('count') ?? 0);
    }

    return {
      seedNodesFound: asNumber(seedResult.records[0]?.get('seedNodesFound') ?? 0),
      expandedNodes: asNumber(expansionResult.records[0]?.get('expandedNodes') ?? 0),
      edgeTypes,
    };
  } finally {
    await session.close();
  }
}

async function main() {
  const [
    { ENV },
    { pool },
    { embedQueryForLane },
    { retrieveAllCandidates },
    { fuseCandidates },
    { scoreCandidates },
    { postProcessCandidates },
    { hydrateCandidates },
    { analyzeQueryRouting },
    { selectTool },
    { buildAceRoutingPacket },
    { turbovecHealth, turbovecSearch },
    { getRedis },
    { LlamaServerProvider },
  ] = await Promise.all([
    import('../../src/lib/server/env.server.js'),
    import('../../src/lib/server/db/client.js'),
    import('../../src/lib/server/retrieval/embedding-service.js'),
    import('../../src/lib/server/retrieval/retrieve-candidates.js'),
    import('../../src/lib/server/retrieval/fuse-candidates.js'),
    import('../../src/lib/server/retrieval/candidate-scorer.js'),
    import('../../src/lib/server/retrieval/post-process-reranker.js'),
    import('../../src/lib/server/retrieval/hydrate-candidates.js'),
    import('../../src/lib/server/nlp/query-routing.js'),
    import('../../src/lib/server/retrieval/hmm-tool-selector.js'),
    import('../../src/lib/server/ace/ace-routing.js'),
    import('../../src/lib/server/retrieval/turbovec-prefilter.js'),
    import('../../src/lib/server/redis.js'),
    import('../../src/lib/server/ace/providers/llama-server-provider.js'),
  ]);

  const qdrantBase = (process.env.QDRANT_URL ?? ENV.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
  const redis = getRedis();
  const neo4jUri = ENV.NEO4J_URI;
  const neo4jAuth = ENV.NEO4J_USER && ENV.NEO4J_PASSWORD
    ? { username: ENV.NEO4J_USER, password: ENV.NEO4J_PASSWORD }
    : undefined;
  const neo4jDriver = neo4jUri
    ? neo4j.driver(neo4jUri, neo4jAuth ? neo4j.auth.basic(neo4jAuth.username, neo4jAuth.password) : neo4j.auth.basic('neo4j', 'password'))
    : null;

  await fs.mkdir(REPORT_DIR, { recursive: true });

  const qdrant384 = await probeQdrantCollection(qdrantBase, 'codebase_chunks_384_hybrid');
  const qdrant768 = await probeQdrantCollection(qdrantBase, 'codebase_chunks_768');

  const startSnapshot = {
    qdrant384,
    qdrant768,
    neo4j: neo4jUri ? 'configured' : 'missing',
    redis: Boolean(redis),
  };

  const stubProvider = new LlamaServerProvider();
  const stubResult = await stubProvider.generate({ prompt: 'phase109 provider passthrough probe' });
  const stubPassthrough = stubResult.text === 'phase109 provider passthrough probe';

  const queryCacheStatus = [];
  const queryResults = [];
  const globalIssues = [];

  if (qdrant384.dimensions !== 384) {
    globalIssues.push(`codebase_chunks_384_hybrid dimension mismatch: expected 384, got ${qdrant384.dimensions ?? 'unknown'}`);
  }
  if (qdrant768.dimensions !== 768) {
    globalIssues.push(`codebase_chunks_768 dimension mismatch: expected 768, got ${qdrant768.dimensions ?? 'unknown'}`);
  }

  for (const querySpec of QUERIES) {
    const startedAt = Date.now();
    const queryId = sha256Hex(`${querySpec.id}:${normalizeQuery(querySpec.query)}`).slice(0, 16);
    const result = {
      query: querySpec.query,
      queryId,
      kind: querySpec.kind,
      embedding: {
        provider: 'embeddinggemma',
        model: '',
        dimensions: {
          dense384: 0,
          dense768: 0,
        },
        elapsedMs: 0,
      },
      lanes: {
        redis: { attempted: false, hit: false, count: 0 },
        qdrant: { collection: 'codebase_chunks_384_hybrid', count: 0 },
        turboVec: { attempted: false, count: 0 },
        fallbackUsed: false,
      },
      postgres: {
        requested: 0,
        resolved: 0,
        unresolvedPacketKeys: [],
      },
      neo4j: {
        seedNodesFound: 0,
        expandedNodes: 0,
        edgeTypes: {
          SIMILAR_TOPOLOGY: 0,
          BELONGS_TO: 0,
          IMPORTS: 0,
          USES: 0,
        },
      },
      candidates: [],
      ace: {
        assembled: false,
        packetCount: 0,
        estimatedTokens: 0,
      },
      synthesis: {
        attempted: false,
        provider: '',
        model: '',
        responseChars: 0,
        status: 'FAIL',
      },
      status: 'FAIL',
      warnings: [],
      failures: [],
    };

    try {
      const [dense384, dense768] = await Promise.all([
        embedQueryForLane(querySpec.query, 'dense_384'),
        embedQueryForLane(querySpec.query, 'dense_768'),
      ]);

      result.embedding.model = dense384.model;
      result.embedding.dimensions.dense384 = dense384.dimension;
      result.embedding.dimensions.dense768 = dense768.dimension;
      result.embedding.elapsedMs = dense384.exec_ms + dense768.exec_ms;

      if (dense384.dimension !== 384) {
        throw new Error(`query embedding dimension mismatch for dense_384: expected 384, got ${dense384.dimension}`);
      }
      if (dense768.dimension !== 768) {
        throw new Error(`query embedding dimension mismatch for dense_768: expected 768, got ${dense768.dimension}`);
      }
      if (qdrant384.dimensions !== dense384.dimension) {
        throw new Error(`query embedding dimension does not match codebase_chunks_384_hybrid (${dense384.dimension} != ${qdrant384.dimensions})`);
      }
      if (qdrant768.dimensions !== dense768.dimension) {
        throw new Error(`query embedding dimension does not match codebase_chunks_768 (${dense768.dimension} != ${qdrant768.dimensions})`);
      }

      const topKCacheKey = cacheKeyForTopK(querySpec.query, 128);
      result.lanes.redis.attempted = true;
      try {
        const cached = await redis.get(topKCacheKey);
        result.lanes.redis.hit = Boolean(cached);
        result.lanes.redis.count = cached ? 1 : 0;
      } catch {
        result.warnings.push('redis cache probe failed');
      }
      queryCacheStatus.push({ query: querySpec.query, key: topKCacheKey, hit: result.lanes.redis.hit });

      const turbovecProbe = await turbovecHealth();
      result.lanes.turboVec.attempted = true;
      if (turbovecProbe?.ok) {
        const turboSearch = await turbovecSearch(dense384.vector, { topK: 25 });
        result.lanes.turboVec.count = turboSearch.candidates.length;
        result.lanes.fallbackUsed = turboSearch.backend === 'offline';
      } else {
        result.lanes.turboVec.count = 0;
        result.lanes.fallbackUsed = true;
        result.warnings.push('TurboVec unavailable or unhealthy');
      }

      const analysis = await analyzeQueryRouting(querySpec.query, {
        domainHint:
          querySpec.id === 'research'
            ? 'research'
            : querySpec.id === 'structural'
              ? 'graph'
              : 'retrieval',
      });
      const tool = await selectTool(
        querySpec.query,
        Array.from(dense384.vector),
        5,
        undefined,
        {
          intent: analysis.intent,
          domainClass: analysis.domainClass,
          intentConfidence: analysis.intentConfidence,
          domainConfidence: analysis.domainConfidence,
          intentProbabilities: analysis.intentProbabilities,
          domainProbabilities: analysis.domainProbabilities,
          analysisSource: analysis.analysisSource,
        },
      );

      const retrievalCandidates = await retrieveAllCandidates(querySpec.query, undefined, 128, {
        includeVectorLanes: true,
      });
      const fused = fuseCandidates(retrievalCandidates);
      const scored = await scoreCandidates(
        querySpec.query,
        fused.map(toCandidateView),
      );
      const postProcessed = postProcessCandidates(scored);
      const hydrated = await hydrateCandidates(fused.slice(0, Math.min(10, fused.length)));

      const candidatePacketKeys = [...new Set(postProcessed.slice(0, 8).map((entry) => entry.packetKey))];
      result.ace.assembled = true;
      result.ace.packetCount = candidatePacketKeys.length;
      result.ace.estimatedTokens = candidatePacketKeys.length * 128;

      const rankedTools = (tool.ranked_tools ?? (tool.tool_id ? [{ tool: tool.tool_id, score: tool.score }] : [])).map((entry) => ({
        toolId: entry.tool,
        toolName: entry.tool,
        score: entry.score,
        eligible: entry.score > 0,
      }));

      const acePacket = buildAceRoutingPacket({
        query: querySpec.query,
        analysis,
        selectedToolId: tool.tool_id,
        rankedTools,
        selectedEvidenceIds: candidatePacketKeys,
        sourceRefs: [...new Set(postProcessed.slice(0, 8).map((entry) => entry.sourceRef).filter(Boolean))],
        allowedScopes: analysis.domainClass ? [analysis.domainClass] : [],
        prohibitedActions: analysis.authorizationRequired ? ['mutation-without-approval'] : [],
        requiresApproval: analysis.authorizationRequired,
        traceId: `phase109:${queryId}`,
        evidenceIds: candidatePacketKeys,
        processingPassId: `phase109:${queryId}`,
        embeddingContractVersion: 'embeddinggemma-384',
        retrievalContractVersion: 'hybrid-rrf-v1',
      });

      const postgresPacketRows = candidatePacketKeys.length > 0
        ? await pool.query(
            `
            SELECT
              packet_key,
              source_ref,
              title_id,
              content_hash
            FROM atlas_packets
            WHERE packet_key = ANY($1::text[])
          `,
            [candidatePacketKeys],
          )
        : { rows: [] };

      result.postgres.requested = candidatePacketKeys.length;
      result.postgres.resolved = postgresPacketRows.rows.length;

      const postgresByPacket = new Map(
        postgresPacketRows.rows.map((row) => [row.packet_key, row]),
      );

      const qdrantCandidates = retrievalCandidates.filter((candidate) => candidate.scoreSource.startsWith('qdrant'));
      const qdrantByPacket = new Map();
      for (const candidate of qdrantCandidates) {
        if (!qdrantByPacket.has(candidate.packetKey)) {
          qdrantByPacket.set(candidate.packetKey, candidate);
        }
      }

      const unresolvedPacketKeys = [];
      const candidateRows = [];
      const topologyScores = new Map();

      if (neo4jDriver && candidatePacketKeys.length > 0) {
        const neo4jSummary = await probeNeo4j(neo4jDriver, candidatePacketKeys);
        result.neo4j.seedNodesFound = neo4jSummary.seedNodesFound;
        result.neo4j.expandedNodes = neo4jSummary.expandedNodes;
        result.neo4j.edgeTypes = neo4jSummary.edgeTypes;

        const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.READ });
        try {
          const topologyResult = await session.run(
            `
            MATCH (p:Packet)
            WHERE p.packet_key IN $packetKeys
            OPTIONAL MATCH (p)-[r:SIMILAR_TOPOLOGY]-(neighbor:Packet)
            RETURN coalesce(neighbor.packet_key, p.packet_key) AS packetKey,
                   max(coalesce(r.score, neighbor.authority_score, 1.0)) AS topologyScore
            `,
            { packetKeys: candidatePacketKeys },
          );
          for (const record of topologyResult.records) {
            const packetKey = record.get('packetKey');
            const score = Number(record.get('topologyScore') ?? 0);
            if (packetKey) {
              topologyScores.set(packetKey, Number.isFinite(score) ? score : 0);
            }
          }
        } finally {
          await session.close();
        }
      }

      for (const candidate of postProcessed.slice(0, 8)) {
        const packetKey = candidate.packetKey;
        const pgRow = postgresByPacket.get(packetKey) ?? null;
        const qdrantCandidate = qdrantByPacket.get(packetKey) ?? null;
        const qdrantSourceRef = qdrantCandidate?.sourceRef ?? null;
        const postgresSourceRef = pgRow?.source_ref ?? null;
        const qdrantScore = pickBestScore(qdrantCandidates, (item) => item.packetKey === packetKey);
        const lexicalScore = pickBestScore(retrievalCandidates, (item) => item.packetKey === packetKey && item.scoreSource === 'postgres_trigram');
        const astScore = pickBestScore(retrievalCandidates, (item) => item.packetKey === packetKey && item.scoreSource === 'ast_tree');
        const topologyScore = topologyScores.get(packetKey) ?? astScore ?? 0;
        const finalCandidate = postProcessed.find((entry) => entry.packetKey === packetKey) ?? candidate;
        const hydratedRow = hydrated.find((entry) => entry.packet_key === packetKey || entry.source_ref === candidate.sourceRef) ?? null;

        let identityStatus = 'MATCHED';
        if (!pgRow) {
          identityStatus = 'MISSING_POSTGRES';
        } else if (qdrantCandidate && qdrantSourceRef && postgresSourceRef && qdrantSourceRef !== postgresSourceRef) {
          identityStatus = 'MISMATCH';
        } else if (qdrantCandidate && !qdrantSourceRef) {
          identityStatus = 'MISSING_QDRANT';
        }

        if (!pgRow) unresolvedPacketKeys.push(packetKey);
        if (qdrantCandidate && pgRow && qdrantSourceRef && postgresSourceRef && qdrantSourceRef !== postgresSourceRef) {
          throw new Error(`qdrant payload source_ref differs from canonical atlas_packets row for ${packetKey}`);
        }

        candidateRows.push({
          packetKey,
          sourceRef: candidate.sourceRef,
          titleId: hydratedRow?.title_id ?? null,
          qdrantScore,
          lexicalScore,
          topologyScore,
          rerankerScore: candidate.blendedScore ?? 0,
          finalScore: finalCandidate.finalScore ?? 0,
          identityStatus,
        });
      }

      result.postgres.unresolvedPacketKeys = unresolvedPacketKeys;

      if (qdrantCandidates.length === 0) {
        result.warnings.push(`no qdrant candidates returned for "${querySpec.query}"`);
      }
      if (postProcessed.some((entry) => !entry.packetKey || !entry.sourceRef)) {
        throw new Error(`fused candidates with missing identity survived fusion for "${querySpec.query}"`);
      }
      if (unresolvedPacketKeys.length > 0 && querySpec.id !== 'research') {
        throw new Error(`unresolved packet keys for "${querySpec.query}": ${unresolvedPacketKeys.join(', ')}`);
      }

      const synthesisPrompt = [
        `Query: ${querySpec.query}`,
        `Intent: ${analysis.intent}`,
        `Domain: ${analysis.domainClass}`,
        '',
        'Top candidates:',
        ...candidateRows.slice(0, 5).map((row, index) => {
          return `[${index + 1}] ${row.packetKey} | ${row.sourceRef} | title=${row.titleId ?? '(none)'} | q=${row.qdrantScore.toFixed(4)} lex=${row.lexicalScore.toFixed(4)} topo=${row.topologyScore.toFixed(4)} final=${row.finalScore.toFixed(4)}`;
        }),
      ].join('\n');

      const synthesis = await probeOpenAICompatibleChat(
        (ENV.TURBOQUANT_BASE_URL ?? ENV.TURBOQUANT_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, ''),
        ENV.ROTORQUANT_CHAT_MODEL ?? ENV.GEMMA4_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf',
        [
          {
            role: 'system',
            content: 'You are a retrieval synthesis lane. Return a concise answer grounded in the provided candidate evidence.',
          },
          {
            role: 'user',
            content: synthesisPrompt,
          },
        ],
      );

      result.synthesis.attempted = true;
      result.synthesis.provider = synthesis.provider;
      result.synthesis.model = synthesis.model;
      result.synthesis.responseChars = synthesis.responseChars;
      result.synthesis.status = synthesis.text.trim().length > 0 ? 'PASS' : 'FAIL';

      if (stubPassthrough) {
        throw new Error('LlamaServerProvider is still a passthrough stub and must not be used as a synthesis provider');
      }

      result.candidates = candidateRows;
      result.status = result.warnings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS';

      // Keep ACE packet observable for the report, even though the smoke is read-only.
      result.ace.packet = {
        queryId: acePacket.queryId,
        runId: acePacket.runId,
        selectedToolId: acePacket.toolRouting.selectedToolId,
        candidateTools: acePacket.toolRouting.candidateTools.length,
        evidenceIds: acePacket.provenance.evidenceIds.length,
      };
    } catch (error) {
      result.failures.push(error instanceof Error ? error.message : String(error));
      result.status = 'FAIL';
    }

    result.elapsedMs = Date.now() - startedAt;
    queryResults.push(result);
  }

  if (neo4jDriver) {
    await neo4jDriver.close().catch(() => {});
  }

  const overallFailures = [
    ...globalIssues,
    ...queryResults.flatMap((query) => query.failures),
  ];
  const overallStatus = overallFailures.length > 0
    ? 'FAIL'
    : queryResults.some((query) => query.status === 'PASS_WITH_WARNINGS')
      ? 'PASS_WITH_WARNINGS'
      : 'PASS';

  const report = {
    generatedAt: new Date().toISOString(),
    reportPath: REPORT_PATH,
    overallStatus,
    startSnapshot,
    globalIssues,
    queryCacheStatus,
    queries: queryResults,
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== Phase 109 Unified Retrieval Smoke ===');
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Overall: ${overallStatus}`);
  for (const query of queryResults) {
    console.log(`\n[${query.kind}] ${query.query}`);
    console.log(`  embedding: ${query.embedding.model} / ${query.embedding.dimensions.dense384} + ${query.embedding.dimensions.dense768}`);
    console.log(`  qdrant: ${query.lanes.qdrant.collection} count=${query.lanes.qdrant.count}`);
    console.log(`  redis: attempted=${query.lanes.redis.attempted} hit=${query.lanes.redis.hit}`);
    console.log(`  turbovec: attempted=${query.lanes.turboVec.attempted} count=${query.lanes.turboVec.count} fallback=${query.lanes.fallbackUsed}`);
    console.log(`  postgres: requested=${query.postgres.requested} resolved=${query.postgres.resolved} unresolved=${query.postgres.unresolvedPacketKeys.length}`);
    console.log(`  neo4j: seeds=${query.neo4j.seedNodesFound} expanded=${query.neo4j.expandedNodes} SIMILAR_TOPOLOGY=${query.neo4j.edgeTypes.SIMILAR_TOPOLOGY}`);
    console.log(`  ace: assembled=${query.ace.assembled} packetCount=${query.ace.packetCount}`);
    console.log(`  synthesis: ${query.synthesis.status} provider=${query.synthesis.provider} model=${query.synthesis.model} chars=${query.synthesis.responseChars}`);
    if (query.failures.length > 0) {
      console.log(`  failures: ${query.failures.join(' | ')}`);
    }
  }

  if (overallStatus === 'FAIL') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal smoke error:', error);
  process.exit(1);
});
