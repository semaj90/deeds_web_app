#!/usr/bin/env node
/**
 * scripts/atlas/eval-messy-query-routing.mjs
 *
 * Phase 18 — Messy Query Orchestrator.
 * Router-first, tools-second evaluation harness for messy user queries.
 *
 * This script demonstrates a lightweight LangExtract-style parser,
 * a 4x4 signal router, CHR97 fast-path gating, and a HyperRAG fallback plan.
 * It also shows how Redis BitFrost / gpu:karpathy:scores can be read for rerank guidance.
 */

import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

const SIG_KEYWORDS = {
  semantic: /\b(explain|describe|why|how|compare|summarize|implication|impact|reason)\b/i,
  lexical: /\b(\.ts|\.js|\.mjs|\.svelte|dockerfile|postgres|pgvector|neo4j|redis|couchdb|gRPC|MCP|llama|Gemma4|TurboQuant)\b/i,
  graph: /\b(depend|import|export|path|relationship|topology|cluster|graph|edge|adjacent|neighbor|caus|effect)\b/i,
  trust: /\b(delete|drop|shutdown|credential|secret|privilege|admin|root|token|auth|credential|execute|permission)\b/i,
};

const DEFAULT_CHR97_FAST_PATH_THRESHOLD = 0.7;
const DEFAULT_TARGET_FAST_RATE = 0.3;
const DEFAULT_MAX_FAST_RATE_GAP = 0.2;
const MAX_SUBQUERIES = 5;

function parseNumberArg(flag, fallback, opts = {}) {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return fallback;
  const raw = Number(arg.slice(flag.length + 1));
  if (!Number.isFinite(raw)) return fallback;
  const min = Number.isFinite(opts.min) ? opts.min : -Infinity;
  const max = Number.isFinite(opts.max) ? opts.max : Infinity;
  return Math.max(min, Math.min(max, raw));
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function buildDocumentationRefs() {
  return [
    {
      title: 'Parent Atlas Karpathy Pipeline',
      path: 'docs/architecture/parent-atlas-karpathy-pipeline.md',
      reason: 'CHR97, Atlas, and retrieval-stage architecture context',
      tags: ['chr97', 'atlas', 'retrieval', 'pipeline', 'cache'],
      lanes: ['chr97', 'hyperrag'],
    },
    {
      title: 'Neo4j GraphRAG Parent Atlas',
      path: 'docs/architecture/neo4j-graphrag-parent-atlas.md',
      reason: 'GraphRAG and topology-backed fallback behavior',
      tags: ['neo4j', 'graphrag', 'graph', 'topology', 'fallback'],
      lanes: ['graphrag', 'hyperrag'],
    },
    {
      title: 'Legal AI Parent Atlas Product Integration',
      path: 'docs/architecture/legal-ai-parent-atlas-product-integration.md',
      reason: 'How retrieval and synthesis connect to product-facing flows',
      tags: ['product', 'integration', 'retrieval', 'synthesis', 'router'],
      lanes: ['hyperrag', 'chr97'],
    },
    {
      title: 'TRACE KAG Web Development Guide',
      path: 'docs/architecture/trace-kag-web-development-guide.md',
      reason: 'Router/tool boundaries and TRACE/KAG implementation rules',
      tags: ['trace', 'kag', 'router', 'tools', 'mcp'],
      lanes: ['mcp', 'hyperrag'],
    },
    {
      title: 'TRACE Runtime Split',
      path: 'docs/architecture/trace-runtime-split.md',
      reason: 'Gemma4, MCP, and raw infra boundary guidance',
      tags: ['trace', 'runtime', 'gemma4', 'mcp', 'infra'],
      lanes: ['mcp'],
    },
    {
      title: 'Repo SvelteKit Route Atlas',
      path: 'docs/graph/repo-sveltekit-route-atlas.md',
      reason: 'Route-level surface map for app/API retrieval grounding',
      tags: ['routes', 'api', 'sveltekit', 'surface', 'path'],
      lanes: ['chr97', 'hyperrag'],
    },
    {
      title: 'Karpathy LLM Wiki',
      path: 'docs/codebase_atlas/karpathy_llmwiki.md',
      reason: 'Higher-level codebase atlas and synthesis reference',
      tags: ['karpathy', 'wiki', 'atlas', 'synthesis', 'codebase'],
      lanes: ['chr97', 'hyperrag', 'graphrag'],
    },
    {
      title: 'LangGraph API Reference',
      path: 'memory/langgraph-api-reference.md',
      reason:
        'LangGraph StateGraph, supervisor, and node orchestration reference for workflow design',
      tags: ['langgraph', 'stategraph', 'workflow', 'supervisor', 'parallel'],
      lanes: ['hyperrag', 'mcp'],
    },
  ];
}

function recommendDocsForQuery(query, parse, routing, documentationRefs) {
  const dispatchSet = new Set(routing.dispatch.map((value) => value.toLowerCase()));
  const haystack = [
    query.toLowerCase(),
    ...parse.files.map((value) => value.toLowerCase()),
    ...parse.services.map((value) => value.toLowerCase()),
    ...parse.errors.map((value) => value.toLowerCase()),
    ...parse.concepts.map((value) => value.toLowerCase()),
    ...routing.dispatch.map((value) => value.toLowerCase()),
  ].join(' ');

  const routeBias = {
    chr97: ['chr97', 'routes', 'atlas', 'karpathy'],
    hyperrag: ['retrieval', 'synthesis', 'router', 'fallback'],
    graphrag: ['graphrag', 'graph', 'topology', 'neo4j'],
    mcp: ['mcp', 'trace', 'tools', 'runtime', 'infra', 'langgraph'],
  };

  return documentationRefs
    .map((ref) => {
      let score = 0;
      const refTags = ref.tags ?? [];
      const refLanes = ref.lanes ?? [];

      for (const tag of refTags) {
        if (haystack.includes(tag.toLowerCase())) score += 1;
      }
      if (parse.files.length > 0 && refTags.includes('routes')) score += 0.5;

      for (const lane of dispatchSet) {
        if (refLanes.includes(lane)) score += 1.5;
        for (const laneTag of routeBias[lane] ?? []) {
          if (refTags.includes(laneTag)) score += 0.35;
        }
      }

      if (dispatchSet.has('graphrag') && refTags.includes('graphrag')) score += 1;
      if (dispatchSet.has('mcp') && refTags.includes('mcp')) score += 1;
      if (dispatchSet.has('chr97') && refTags.includes('chr97')) score += 1;
      if (
        parse.services.some((value) => /langgraph/i.test(value)) &&
        refTags.includes('langgraph')
      ) {
        score += 2;
      }

      return {
        title: ref.title,
        path: ref.path,
        reason: ref.reason,
        score: Number(score.toFixed(2)),
      };
    })
    .filter((ref) => ref.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function parseLangExtract(query) {
  const files = Array.from(
    new Set([
      ...(query.match(/\b(?:src|lib|routes|docker|services|scripts)\/[A-Za-z0-9_./-]+\b/gi) ?? []),
    ])
  );
  const ports = Array.from(
    new Set([
      ...(query.match(
        /\b(?:80|443|50051|50053|50055|6333|6379|8090|8095|8096|8333|9333|11434)\b/g
      ) ?? []),
    ])
  );
  const services = Array.from(
    new Set([
      ...(query.match(
        /\b(?:Redis|Qdrant|Neo4j|Postgres|CouchDB|llama|Ollama|Hermes|LangGraph|TurboQuant|CHR97|HyperRAG)\b/gi
      ) ?? []),
    ])
  );
  const errors = Array.from(
    new Set([
      ...(query.match(
        /\b(?:error|exception|timeout|failure|mismatch|missing|unauthorized|403|404|500)\b/gi
      ) ?? []),
    ])
  );
  const commands = Array.from(
    new Set([
      ...(query.match(
        /\b(?:npm run|docker run|docker compose|git pull|git checkout|psql|curl|brew install|pip install|npm install|yarn install|npm test|playwright test|pwsh|powershell|node|npx|tsx)\b/gi
      ) ?? []),
    ])
  );
  const concepts = Array.from(
    new Set([
      ...(query.match(
        /\b(?:retrieval|embedding|topology|synthesis|cache|vector|ranks|blend|tool|agent|pipeline|worker|sidecar|fallback|router|confidence|schema|migration|provenance)\b/gi
      ) ?? []),
    ])
  );

  return { files, ports, services, errors, commands, concepts };
}

function decomposeQuery(query) {
  const clauses = query
    .split(/[,;]|\band\b|\bor\b|\n/gi)
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (clauses.length <= 1) {
    return [query.trim()];
  }

  const subqueries = [];
  for (const clause of clauses) {
    if (clause.length < 10) continue;
    subqueries.push(clause);
    if (subqueries.length >= MAX_SUBQUERIES) break;
  }

  if (subqueries.length === 0) {
    subqueries.push(query.trim());
  }

  // For messy prompts, keep at least two routeable parts so lane routing can split intent.
  if (subqueries.length === 1 && /\b(and|or|then|also|plus|additionally|while)\b/i.test(query)) {
    const midpoint = Math.max(10, Math.floor(query.length / 2));
    subqueries.push(query.slice(midpoint).trim());
  }

  return subqueries;
}

function extractSignal(query) {
  const semantic = SIG_KEYWORDS.semantic.test(query) ? 0.9 : 0.4;
  const lexical = SIG_KEYWORDS.lexical.test(query) ? 0.9 : 0.3;
  const graph = SIG_KEYWORDS.graph.test(query) ? 0.85 : 0.25;
  const trust = SIG_KEYWORDS.trust.test(query) ? 0.95 : 0.1;
  const total = Math.min(1.0, (semantic + lexical + graph) / 3);
  const messy =
    query.split(/\s+/).length > 20 || /\b(and|or|then|also|plus|additionally)\b/i.test(query);
  return { semantic, lexical, graph, trust, total, messy };
}

class QueryRouter4x4 {
  constructor() {
    this.matrix = [
      [0.85, 0.35, 0.25, 0.15], // CHR97
      [0.2, 0.8, 0.1, 0.3], // HyperRAG
      [0.2, 0.2, 0.9, 0.2], // GraphRAG
      [0.1, 0.15, 0.25, 0.9], // MCP
    ];
    this.threshold = 0.28;
  }

  route(signal) {
    const vector = [signal.semantic, signal.lexical, signal.graph, signal.trust];
    const raw = this.matrix.map((row) =>
      row.reduce((sum, weight, idx) => sum + weight * vector[idx], 0)
    );
    const max = Math.max(...raw);
    const exps = raw.map((value) => Math.exp(value - max));
    const sum = exps.reduce((acc, x) => acc + x, 0);
    const weights = exps.map((x) => x / sum);

    const names = ['chr97', 'hyperrag', 'graphrag', 'mcp'];
    const laneWeights = Object.fromEntries(
      names.map((name, idx) => [name, parseFloat(weights[idx].toFixed(3))])
    );
    const dispatch = names.filter((_, idx) => weights[idx] >= this.threshold);

    return { laneWeights, dispatch, raw, vector };
  }
}

async function getKarpathyBoost(redis) {
  try {
    const [cursor, sample] = await redis.hscan('gpu:karpathy:scores', 0, 'COUNT', 20);
    const entries = [];
    if (sample && Array.isArray(sample)) {
      for (let i = 1; i < sample.length; i += 2) {
        const key = sample[i - 1];
        const value = JSON.parse(sample[i]);
        entries.push({
          file: key,
          blend: value.blend ?? null,
          pr: value.pr ?? null,
          attn: value.attn ?? null,
          authority: value.authority ?? null,
        });
      }
    }
    return entries.sort((a, b) => (b.blend ?? 0) - (a.blend ?? 0)).slice(0, 10);
  } catch {
    return [];
  }
}

function buildToolPlan(query, parse) {
  const shouldCallTool =
    parse.commands.length > 0 ||
    /\b(run|execute|check|verify|inspect|build|rebuild|deploy)\b/i.test(query);
  const plan = [];

  if (shouldCallTool) {
    plan.push({
      tool: 'mcp:command-checker',
      reason: 'query asks for action or execution',
      allowlist: ['docker', 'npm', 'git', 'redis', 'qdrant', 'psql'],
    });
  }

  if (parse.services.length > 0) {
    plan.push({
      tool: 'mcp:service-inspector',
      reason: 'query references runtime services/protocols',
    });
  }

  if (parse.files.length > 0) {
    plan.push({ tool: 'mcp:codebase-file-lens', reason: 'query includes repo-relative files' });
  }

  if (plan.length === 0) {
    plan.push({
      tool: 'mcp:query-classifier',
      reason: 'no explicit tool action detected, keep tool use minimal',
    });
  }

  return plan;
}

function buildBoundary(query, parse) {
  const proposedMcpTools = buildToolPlan(query, parse).map((item) => item.tool);
  const allowlistedCommands = ['docker', 'npm', 'git', 'redis-cli', 'psql', 'qdrant'];
  const grpcCalls = [
    { service: 'embeddings', purpose: 'query + subquery vectorization' },
    { service: 'rerank', purpose: 'cross-lane reranking' },
    { service: 'vector-ops', purpose: 'fast similarity / merge operations' },
  ];

  return {
    mcp: {
      role: 'tool permissions + execution guardrail',
      proposedTools: proposedMcpTools,
      requireAllowlistValidation: true,
      allowlistedCommands,
    },
    grpc: {
      role: 'fast internal compute services',
      calls: grpcCalls,
    },
  };
}

function buildLangGraphWorkflow({
  query,
  parse,
  subqueries,
  perSubquery,
  chr97,
  fallback,
  toolPlan,
}) {
  const needsFallback = !chr97.selected;
  return {
    name: 'messy-query-orchestrator',
    stages: [
      {
        stage: 'parse',
        status: 'ok',
        output: { entities: parse, subqueryCount: subqueries.length },
      },
      { stage: 'route', status: 'ok', output: { perSubquery } },
      {
        stage: 'retrieve',
        status: needsFallback ? 'fallback' : 'fast-path',
        output: needsFallback ? fallback : { path: 'CHR97', confidence: chr97.confidence },
      },
      { stage: 'tool-plan', status: 'ok', output: toolPlan },
      {
        stage: 'validate',
        status: 'ok',
        output: {
          guardrail: 'Hermes allowlist required for actions',
          hasActionRequest: toolPlan.some((item) => item.tool === 'mcp:command-checker'),
        },
      },
      {
        stage: 'synthesize',
        status: 'ok',
        output: {
          model: 'gemma4-rotorquant:latest',
          includeSourceRefs: true,
          packetMergeStrategy: 'merge lane packets + synthesis log',
        },
      },
    ],
    summary: {
      query,
      strategy: needsFallback ? 'HyperRAG fallback' : 'CHR97 fast answer',
    },
  };
}

function buildFallbackPlan(query, routing, parse) {
  return {
    seed: {
      query,
      lanes: routing.dispatch,
      parser: parse,
      routeSignals: routing.laneWeights,
    },
    hyperrag: {
      reason: 'messy query or low CHR97 confidence',
      preferred: ['qdrant', 'postgres', 'neo4j'],
      sourceRefs: parse.files.length > 0 ? parse.files : ['derived from query semantics'],
    },
    synthesis: {
      model: 'gemma4-rotorquant:latest',
      includeSourceRefs: true,
      tools: buildToolPlan(query, parse),
    },
  };
}

async function runChr97FastPath(query, routing, threshold) {
  return {
    path: 'CHR97 fast path',
    selected: routing.laneWeights.chr97 >= threshold,
    confidence: routing.laneWeights.chr97,
    verdict: routing.laneWeights.chr97 > threshold ? 'fast answer' : 'fallback',
    candidateFile: query.match(/\b(src\/|lib\/|routes\/)[A-Za-z0-9_./-]+\b/)?.[0] ?? null,
  };
}

async function runHyperRagFallback(query, routing) {
  return {
    path: 'HyperRAG fallback',
    lanes: routing.dispatch.filter((l) => l !== 'chr97'),
    gating: routing.laneWeights,
    stores: ['qdrant', 'postgres', 'neo4j', 'redis-bitfrost'],
    note: 'seed HyperRAG with cartridge-proximate chunks if CHR97 confidence <= 0.7',
  };
}

function mergeAcePackets(query, subqueries, perSubquery) {
  return {
    packetId: `ace-${Buffer.from(query).toString('hex').slice(0, 12)}`,
    sourceRefs: perSubquery
      .flatMap((entry) => entry.parse.files)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 12),
    synthesisLog: {
      query,
      subqueries,
      lanes: perSubquery.map((entry) => ({
        subquery: entry.subquery,
        dispatch: entry.routing.dispatch,
      })),
    },
  };
}

function calibrateChr97Threshold(entries, currentThreshold, targetFastRate) {
  const confidences = entries
    .map((entry) => Number(entry.chr97?.confidence ?? 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  const total = confidences.length;
  if (total === 0) {
    return {
      currentThreshold,
      targetFastRate,
      currentFastRate: 0,
      suggestedThreshold: currentThreshold,
      projectedFastRateAtSuggested: 0,
      minConfidence: null,
      maxConfidence: null,
      medianConfidence: null,
    };
  }

  const currentFastCount = entries.filter((entry) => entry.chr97?.selected).length;
  const targetCount = Math.max(1, Math.ceil(total * targetFastRate));
  const thresholdAtTargetIndex = confidences[Math.min(total - 1, targetCount - 1)];
  const suggestedThreshold = Number(thresholdAtTargetIndex.toFixed(3));
  const projectedFastCount = confidences.filter((value) => value >= suggestedThreshold).length;
  const medianConfidence = confidences[Math.floor((total - 1) / 2)];

  return {
    currentThreshold,
    targetFastRate,
    currentFastRate: Number((currentFastCount / total).toFixed(3)),
    suggestedThreshold,
    projectedFastRateAtSuggested: Number((projectedFastCount / total).toFixed(3)),
    minConfidence: Number(confidences[total - 1].toFixed(3)),
    maxConfidence: Number(confidences[0].toFixed(3)),
    medianConfidence: Number(medianConfidence.toFixed(3)),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const failOnDrift = process.argv.includes('--fail-on-drift');
  const chr97Threshold = parseNumberArg('--chr97-threshold', DEFAULT_CHR97_FAST_PATH_THRESHOLD, {
    min: 0,
    max: 1,
  });
  const targetFastRate = parseNumberArg('--target-fast-rate', DEFAULT_TARGET_FAST_RATE, {
    min: 0.05,
    max: 0.95,
  });
  const maxFastRateGap = parseNumberArg('--max-fast-rate-gap', DEFAULT_MAX_FAST_RATE_GAP, {
    min: 0,
    max: 1,
  });
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  ensureDir(REPORTS_DIR);

  const queries = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const dirtyQueries =
    queries.length > 0
      ? queries
      : [
          'why does the evidence upload modal reject files when qdrant is healthy and the Redis cache shows old gpu:karpathy:scores values',
          'find dependency path between src/lib/server/ace/context-assembler.ts and qdrant cluster prefilter code',
          'check if Neo4j graph retrieval can explain failure of hermes tool output for TurboQuant router',
          'run a safe grep for old postgres migrations and explain why user_id mismatch happens in drift cases',
        ];

  const router = new QueryRouter4x4();
  const report = {
    generatedAt: new Date().toISOString(),
    queries: [],
    sampleKarpathy: [],
    documentationRefs: buildDocumentationRefs(),
    summary: {},
  };
  report.sampleKarpathy = await getKarpathyBoost(redis);

  for (const query of dirtyQueries) {
    const parse = parseLangExtract(query);
    const subqueries = decomposeQuery(query);
    const signal = extractSignal(query);
    const routing = router.route(signal);
    const perSubquery = subqueries.map((subquery) => {
      const subParse = parseLangExtract(subquery);
      const subSignal = extractSignal(subquery);
      const subRouting = router.route(subSignal);
      return {
        subquery,
        parse: subParse,
        signal: subSignal,
        routing: subRouting,
      };
    });
    const chr97 = await runChr97FastPath(query, routing, chr97Threshold);
    const fallback = await runHyperRagFallback(query, routing);
    const toolPlan = buildToolPlan(query, parse);
    const boundary = buildBoundary(query, parse);
    const langGraphWorkflow = buildLangGraphWorkflow({
      query,
      parse,
      subqueries,
      perSubquery,
      chr97,
      fallback,
      toolPlan,
    });
    const acePacket = mergeAcePackets(query, subqueries, perSubquery);
    const relevantDocs = recommendDocsForQuery(query, parse, routing, report.documentationRefs);

    report.queries.push({
      query,
      parse,
      subqueries,
      signal,
      routing,
      perSubquery,
      chr97,
      fallback,
      toolPlan,
      boundary,
      langGraphWorkflow,
      acePacket,
      relevantDocs,
    });
  }

  report.summary = {
    totalQueries: report.queries.length,
    chr97FastPathCount: report.queries.filter((entry) => entry.chr97.selected).length,
    fallbackCount: report.queries.filter((entry) => !entry.chr97.selected).length,
    avgSubqueries: report.queries.length
      ? Number(
          (
            report.queries.reduce((sum, entry) => sum + entry.subqueries.length, 0) /
            report.queries.length
          ).toFixed(2)
        )
      : 0,
    calibration: calibrateChr97Threshold(report.queries, chr97Threshold, targetFastRate),
  };

  const outputPath = join(REPORTS_DIR, 'messy-query-routing-eval.json');
  const mdPath = join(REPORTS_DIR, 'messy-query-routing-eval.md');
  if (!dryRun) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  }

  const mdLines = [
    '# Phase 18 — Messy Query Orchestration Evaluation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## 1. Codebase Documentation References',
    '',
  ];

  for (const ref of report.documentationRefs) {
    mdLines.push(`- ${ref.title} — ${ref.path}`);
    mdLines.push(`  Reason: ${ref.reason}`);
  }

  mdLines.push('', '## 2. Redis BitFrost Sample', '');

  if (report.sampleKarpathy.length === 0) {
    mdLines.push('- No `gpu:karpathy:scores` sample available from Redis.');
  } else {
    mdLines.push('| File | Blend | PR | Attn | Authority |');
    mdLines.push('| --- | --- | --- | --- | --- |');
    for (const row of report.sampleKarpathy) {
      mdLines.push(
        `| ${row.file} | ${row.blend ?? 'n/a'} | ${row.pr ?? 'n/a'} | ${row.attn ?? 'n/a'} | ${row.authority ?? 'n/a'} |`
      );
    }
  }

  mdLines.push('', '## 3. Query Routing Results', '');
  for (const entry of report.queries) {
    mdLines.push(`### Query: ${entry.query}`);
    mdLines.push('');
    mdLines.push(`- Parsed files: ${entry.parse.files.join(', ') || 'none'}`);
    mdLines.push(`- Parsed services: ${entry.parse.services.join(', ') || 'none'}`);
    mdLines.push(`- Parsed commands: ${entry.parse.commands.join(', ') || 'none'}`);
    mdLines.push(`- Parsed errors: ${entry.parse.errors.join(', ') || 'none'}`);
    mdLines.push('- Subqueries:');
    for (const subquery of entry.subqueries) {
      mdLines.push(`  - ${subquery}`);
    }
    mdLines.push(
      `- Signal: semantic=${entry.signal.semantic.toFixed(2)}, lexical=${entry.signal.lexical.toFixed(2)}, graph=${entry.signal.graph.toFixed(2)}, trust=${entry.signal.trust.toFixed(2)}, messy=${entry.signal.messy}`
    );
    mdLines.push(`- Router dispatch: ${entry.routing.dispatch.join(', ')}`);
    mdLines.push(
      `- CHR97 fast-path selected: ${entry.chr97.selected} (${entry.chr97.confidence.toFixed(2)})`
    );
    mdLines.push(`- Tool plan: ${entry.toolPlan.map((item) => item.tool).join(', ')}`);
    mdLines.push(`- MCP tools: ${entry.boundary.mcp.proposedTools.join(', ')}`);
    mdLines.push(
      `- gRPC calls: ${entry.boundary.grpc.calls.map((item) => item.service).join(', ')}`
    );
    mdLines.push(`- ACE sourceRefs: ${entry.acePacket.sourceRefs.join(', ') || 'none'}`);
    mdLines.push('- Most relevant docs:');
    if ((entry.relevantDocs?.length ?? 0) === 0) {
      mdLines.push('  - none');
    } else {
      for (const doc of entry.relevantDocs) {
        mdLines.push(`  - ${doc.title} — ${doc.path} (score=${doc.score.toFixed(2)})`);
      }
    }
    mdLines.push('');
  }

  mdLines.push('## 4. CHR97 Calibration', '');
  mdLines.push(
    `- Current threshold: ${report.summary.calibration.currentThreshold.toFixed(3)} (fast-rate=${report.summary.calibration.currentFastRate.toFixed(3)})`
  );
  mdLines.push(
    `- Target fast-rate: ${report.summary.calibration.targetFastRate.toFixed(3)} -> suggested threshold ${report.summary.calibration.suggestedThreshold.toFixed(3)} (projected fast-rate=${report.summary.calibration.projectedFastRateAtSuggested.toFixed(3)})`
  );
  mdLines.push(
    `- Confidence range: min=${report.summary.calibration.minConfidence ?? 'n/a'}, median=${report.summary.calibration.medianConfidence ?? 'n/a'}, max=${report.summary.calibration.maxConfidence ?? 'n/a'}`
  );
  const fastRateGap = Math.max(
    0,
    report.summary.calibration.targetFastRate - report.summary.calibration.currentFastRate
  );
  mdLines.push(
    `- Fast-rate gap to target: ${fastRateGap.toFixed(3)} (allowed=${maxFastRateGap.toFixed(3)}, failOnDrift=${failOnDrift})`
  );
  mdLines.push('');

  if (!dryRun) {
    writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  }
  console.log(`${C.green}✅ Messy Query Orchestration evaluation complete.${C.reset}`);
  if (dryRun) {
    console.log('  - Dry run: report generated in-memory (no files written)');
  } else {
    console.log(`  - JSON report: ${outputPath}`);
    console.log(`  - Markdown summary: ${mdPath}`);
  }

  if (failOnDrift && fastRateGap > maxFastRateGap) {
    console.error(
      `${C.red}❌ CHR97 fast-rate drift exceeded threshold: gap=${fastRateGap.toFixed(3)} > allowed=${maxFastRateGap.toFixed(3)}${C.reset}`
    );
    await redis.quit();
    process.exit(1);
  }

  await redis.quit();
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
