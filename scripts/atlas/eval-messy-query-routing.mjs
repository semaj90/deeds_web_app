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

const FALLBACK_THRESHOLD = 0.7;
const CHR97_FAST_PATH_THRESHOLD = 0.72;

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function parseLangExtract(query) {
  const files = Array.from(new Set([...query.match(/\b(?:src|lib|routes|docker|services|scripts)\/[A-Za-z0-9_./-]+\b/gi) ?? []]));
  const ports = Array.from(new Set([...query.match(/\b(?:80|443|50051|50053|50055|6333|6379|8090|8095|8096|8333|9333|11434)\b/g) ?? []]));
  const services = Array.from(new Set([...query.match(/\b(?:Redis|Qdrant|Neo4j|Postgres|CouchDB|llama|Ollama|Hermes|LangGraph|TurboQuant|CHR97|HyperRAG)\b/gi) ?? []]));
  const errors = Array.from(new Set([...query.match(/\b(?:error|exception|timeout|failure|mismatch|missing|unauthorized|403|404|500)\b/gi) ?? []]));
  const commands = Array.from(new Set([...query.match(/\b(?:npm run|docker run|docker compose|git pull|git checkout|psql|curl|brew install|pip install|npm install|yarn install|npm test|playwright test)\b/gi) ?? []]));
  const concepts = Array.from(new Set([...query.match(/\b(?:retrieval|embedding|topology|synthesis|cache|vector|ranks|blend|tool|agent|pipeline|worker|sidecar|fallback|router|confidence|schema|migration|provenance)\b/gi) ?? []]));

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
    if (subqueries.length >= 4) break;
  }

  if (subqueries.length === 0) {
    subqueries.push(query.trim());
  }

  return subqueries;
}

function extractSignal(query) {
  const semantic = SIG_KEYWORDS.semantic.test(query) ? 0.9 : 0.4;
  const lexical = SIG_KEYWORDS.lexical.test(query) ? 0.9 : 0.3;
  const graph = SIG_KEYWORDS.graph.test(query) ? 0.85 : 0.25;
  const trust = SIG_KEYWORDS.trust.test(query) ? 0.95 : 0.1;
  const total = Math.min(1.0, (semantic + lexical + graph) / 3);
  const messy = query.split(/\s+/).length > 20 || /\b(and|or|then|also|plus|additionally)\b/i.test(query);
  return { semantic, lexical, graph, trust, total, messy };
}

class QueryRouter4x4 {
  constructor() {
    this.matrix = [
      [0.85, 0.35, 0.25, 0.15], // CHR97
      [0.20, 0.80, 0.10, 0.30], // HyperRAG
      [0.20, 0.20, 0.90, 0.20], // GraphRAG
      [0.10, 0.15, 0.25, 0.90], // MCP
    ];
    this.threshold = 0.28;
  }

  route(signal) {
    const vector = [signal.semantic, signal.lexical, signal.graph, signal.trust];
    const raw = this.matrix.map((row) => row.reduce((sum, weight, idx) => sum + weight * vector[idx], 0));
    const max = Math.max(...raw);
    const exps = raw.map((value) => Math.exp(value - max));
    const sum = exps.reduce((acc, x) => acc + x, 0);
    const weights = exps.map((x) => x / sum);

    const names = ['chr97', 'hyperrag', 'graphrag', 'mcp'];
    const laneWeights = Object.fromEntries(names.map((name, idx) => [name, parseFloat(weights[idx].toFixed(3))]));
    const dispatch = names.filter((_, idx) => weights[idx] >= this.threshold);

    return { laneWeights, dispatch, raw, vector };
  }
}

async function getKarpathyBoost(redis) {
  try {
    const sample = await redis.hscan('gpu:karpathy:scores', 0, 'COUNT', 20);
    const entries = [];
    for (let i = 1; i < sample.length; i += 2) {
      const key = sample[i - 1];
      const value = JSON.parse(sample[i]);
      entries.push({ file: key, blend: value.blend ?? null, pr: value.pr ?? null, attn: value.attn ?? null, authority: value.authority ?? null });
    }
    return entries.sort((a, b) => (b.blend ?? 0) - (a.blend ?? 0)).slice(0, 10);
  } catch {
    return [];
  }
}

function buildToolPlan(query, parse) {
  const shouldCallTool = parse.commands.length > 0 || /\b(run|execute|check|verify|inspect|build|rebuild|deploy)\b/i.test(query);
  const plan = [];

  if (shouldCallTool) {
    plan.push({ tool: 'mcp:command-checker', reason: 'query asks for action or execution', allowlist: ['docker', 'npm', 'git', 'redis', 'qdrant', 'psql'] });
  }

  if (parse.services.length > 0) {
    plan.push({ tool: 'mcp:service-inspector', reason: 'query references runtime services/protocols' });
  }

  if (parse.files.length > 0) {
    plan.push({ tool: 'mcp:codebase-file-lens', reason: 'query includes repo-relative files' });
  }

  if (plan.length === 0) {
    plan.push({ tool: 'mcp:query-classifier', reason: 'no explicit tool action detected, keep tool use minimal' });
  }

  return plan;
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
      model: 'gemma4-legal',
      includeSourceRefs: true,
      tools: buildToolPlan(query, parse),
    }
  };
}

async function runChr97FastPath(query, routing) {
  return {
    path: 'CHR97 fast path',
    selected: routing.laneWeights.chr97 >= CHR97_FAST_PATH_THRESHOLD,
    confidence: routing.laneWeights.chr97,
    verdict: routing.laneWeights.chr97 >= CHR97_FAST_PATH_THRESHOLD ? 'fast answer' : 'fallback',
    candidateFile: query.match(/\b(src\/|lib\/|routes\/)[A-Za-z0-9_./-]+\b/)?.[0] ?? null,
  };
}

async function runHyperRagFallback(query, routing) {
  return {
    path: 'HyperRAG fallback',
    lanes: routing.dispatch.filter((l) => l !== 'chr97'),
    gating: routing.laneWeights,
    note: 'seed HyperRAG with cartridge-proximate chunks if CHR97 is not confident enough',
  };
}

async function main() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  ensureDir(REPORTS_DIR);

  const queries = process.argv.slice(2);
  const dirtyQueries = queries.length > 0 ? queries : [
    'why does the evidence upload modal reject files when qdrant is healthy and the Redis cache shows old gpu:karpathy:scores values',
    'find dependency path between src/lib/server/ace/context-assembler.ts and qdrant cluster prefilter code',
    'check if Neo4j graph retrieval can explain failure of hermes tool output for TurboQuant router',
    'run a safe grep for old postgres migrations and explain why user_id mismatch happens in drift cases',
  ];

  const router = new QueryRouter4x4();
  const report = { generatedAt: new Date().toISOString(), queries: [], sampleKarpathy: [], summary: {} };
  report.sampleKarpathy = await getKarpathyBoost(redis);

  for (const query of dirtyQueries) {
    const parse = parseLangExtract(query);
    const subqueries = decomposeQuery(query);
    const signal = extractSignal(query);
    const routing = router.route(signal);
    const chr97 = await runChr97FastPath(query, routing);
    const fallback = await runHyperRagFallback(query, routing);
    const toolPlan = buildToolPlan(query, parse);

    report.queries.push({
      query,
      parse,
      subqueries,
      signal,
      routing,
      chr97,
      fallback,
      toolPlan,
    });
  }

  const outputPath = join(REPORTS_DIR, 'messy-query-routing-eval.json');
  const mdPath = join(REPORTS_DIR, 'messy-query-routing-eval.md');
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  const mdLines = [
    '# Phase 18 — Messy Query Orchestration Evaluation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## 1. Redis BitFrost Sample',
    '',
  ];

  if (report.sampleKarpathy.length === 0) {
    mdLines.push('- No `gpu:karpathy:scores` sample available from Redis.');
  } else {
    mdLines.push('| File | Blend | PR | Attn | Authority |');
    mdLines.push('| --- | --- | --- | --- | --- |');
    for (const row of report.sampleKarpathy) {
      mdLines.push(`| ${row.file} | ${row.blend ?? 'n/a'} | ${row.pr ?? 'n/a'} | ${row.attn ?? 'n/a'} | ${row.authority ?? 'n/a'} |`);
    }
  }

  mdLines.push('', '## 2. Query Routing Results', '');
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
    mdLines.push(`- Signal: semantic=${entry.signal.semantic.toFixed(2)}, lexical=${entry.signal.lexical.toFixed(2)}, graph=${entry.signal.graph.toFixed(2)}, trust=${entry.signal.trust.toFixed(2)}, messy=${entry.signal.messy}`);
    mdLines.push(`- Router dispatch: ${entry.routing.dispatch.join(', ')}`);
    mdLines.push(`- CHR97 fast-path selected: ${entry.chr97.selected} (${entry.chr97.confidence.toFixed(2)})`);
    mdLines.push(`- Tool plan: ${entry.toolPlan.map((item) => item.tool).join(', ')}`);
    mdLines.push('');
  }

  writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
  console.log(`${C.green}✅ Messy Query Orchestration evaluation complete.${C.reset}`);
  console.log(`  - JSON report: ${outputPath}`);
  console.log(`  - Markdown summary: ${mdPath}`);

  await redis.quit();
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
