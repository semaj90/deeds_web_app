#!/usr/bin/env node
/**
 * atlas-tools-mcp.mjs — Stdio MCP server exposing three Atlas agentic tools:
 *   classify_intent         — classify prompt → intent/domain/safeNextCommand
 *   build_agentic_rag_context — score ACE packet cards against query
 *   build_recommendation    — produce structured repair/research recommendation
 *
 * Raw newline-delimited JSON-RPC 2.0 (MCP stdio transport, no SDK dependency).
 *
 * Wire in opencode.json:
 *   "atlas-tools": {
 *     "type": "local",
 *     "command": ["node", "./sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs"],
 *     "enabled": true,
 *     "timeout": 30000
 *   }
 */

import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import neo4j from 'neo4j-driver';

const log = (...a) => process.stderr.write('[atlas-tools] ' + a.join(' ') + '\n');

let neo4jDriver = null;
function getNeo4jDriver() {
  if (!neo4jDriver) {
    const URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
    const USER = process.env.NEO4J_USER || 'neo4j';
    const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
    neo4jDriver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  }
  return neo4jDriver;
}

process.on('exit', () => {
  if (neo4jDriver) {
    neo4jDriver.close();
  }
});

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'atlas-tools', version: '0.2.0' };

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'classify_intent',
    description:
      'Classify a user prompt into intent (repair/research/planning), domain ' +
      '(retrieval/graph/agent-workflow/general), subdomain, and produce a safe ' +
      'next shell command that gathers evidence without modifying any files.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The raw user prompt or error message to classify.' },
        context: { type: 'string', description: 'Optional extra context: file path, error type, or phase label.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_agentic_rag_context',
    description:
      'Build a compact RAG context packet from the ACE cache. Reads .opencode/ace-packet.json, ' +
      'scores cards against the query by keyword overlap, and returns the top-K cards with ' +
      'sourceRefs and a ready-to-inject prompt snippet. Use before sending a codebase question to Gemma4.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user query or repair goal used to score cards.' },
        maxCards: { type: 'number', description: 'Maximum number of cards to return (1-50). Default 20.' },
        domainFilter: { type: 'string', description: 'Optional domain to filter cards (e.g. "retrieval", "graph"). Omit for all.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_recommendation',
    description:
      'Produce a structured recommendation (likely_cause, evidence, patch_targets, ' +
      'safe_next_command, do_not_do) from classified intent and RAG context. ' +
      'Use after classify_intent and build_agentic_rag_context have run.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Intent from classify_intent: "repair", "research", or "planning".' },
        domain: { type: 'string', description: 'Domain from classify_intent (e.g. "retrieval", "graph").' },
        errorSummary: { type: 'string', description: 'One-sentence description of the error or question.' },
        evidenceLines: {
          type: 'array',
          items: { type: 'string', description: 'One evidence item: a file:line ref, Redis key, rg match, or ACE card title.' },
          description: 'Evidence items: file:line refs, Redis keys, rg matches, or ACE card titles.',
        },
        patchTargets: {
          type: 'array',
          items: { type: 'string', description: 'Relative file path that needs to change.' },
          description: 'Relative file paths that need to change. Empty array if no patch needed.',
        },
        proposedFix: { type: 'string', description: 'Optional one-line description of the proposed code change.' },
      },
      required: ['intent', 'domain', 'errorSummary', 'evidenceLines', 'patchTargets'],
      additionalProperties: false,
    },
  },
  {
    name: 'record_outcome',
    description: 'Record the outcome of a RAG query or code-repair task. Writes trace details to a local NDJSON ledger and creates behavioral relationships in Neo4j.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'The intent classified for this task (e.g. "repair_glyph_ingestion").' },
        tool: { type: 'string', description: 'The tool choice that was made.' },
        sourceRefs: {
          type: 'array',
          items: { type: 'string' },
          description: 'The source files or references involved in the selection.',
        },
        recommendationAccepted: { type: 'boolean', description: 'Whether the suggestion was accepted.' },
        reward: { type: 'number', description: 'The calculated reward score (0.0 to 1.0).' },
        graphVersion: { type: 'string', description: 'The version of the codebase graph (e.g., "2026-05-29").' },
        errorMsg: { type: 'string', description: 'Optional error description if the recommendation failed.' }
      },
      required: ['intent', 'tool', 'sourceRefs', 'recommendationAccepted', 'reward'],
      additionalProperties: false,
    }
  },
  {
    name: 'find_dependencies',
    description: 'Find dependencies (IMPORTS, CALLS) of a target codebase file in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target file path (relative to sveltekit-frontend/src or absolute).' }
      },
      required: ['target'],
      additionalProperties: false,
    }
  },
  {
    name: 'trace_database',
    description: 'Find files in the codebase mapping database usage (USES_DB) for a table name or query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Table name or search term.' }
      },
      required: ['query'],
      additionalProperties: false,
    }
  },
  {
    name: 'trace_tool_chain',
    description: 'Trace files invoking specific tools or tools mapped in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool name pattern to trace.' }
      },
      required: ['tool'],
      additionalProperties: false,
    }
  },
  {
    name: 'find_source_refs',
    description: 'Query SourceRef or CodebaseFile nodes in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name pattern or file path substring.' }
      },
      required: ['query'],
      additionalProperties: false,
    }
  },
  {
    name: 'find_feature',
    description: 'Query Feature nodes mapped in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'Feature name pattern.' }
      },
      required: ['feature'],
      additionalProperties: false,
    }
  },
  {
    name: 'find_route',
    description: 'Query layouts or SvelteKit route endpoints mapped in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Route path pattern (e.g. "/api/ace").' }
      },
      required: ['route'],
      additionalProperties: false,
    }
  }
];

// ── Tool implementations ────────────────────────────────────────────────────────

function classifyIntent({ prompt, context = '' }) {
  const text = (prompt + ' ' + context).toLowerCase();

  const domain =
    text.includes('qdrant') || text.includes('embedding') || text.includes('vector') || text.includes('ace') || text.includes('packet') || text.includes('card')
      ? 'retrieval'
      : text.includes('graph') || text.includes('topology') || text.includes('neo4j') || text.includes('cluster')
        ? 'graph'
        : text.includes('opencode') || text.includes('tool') || text.includes('skill') || text.includes('mcp')
          ? 'agent-workflow'
          : text.includes('svelte') || text.includes('route') || text.includes('component')
            ? 'frontend'
            : text.includes('drizzle') || text.includes('schema') || text.includes('postgres') || text.includes('migration')
              ? 'database'
              : 'general';

  const intent =
    text.includes('error') || text.includes('fix') || text.includes('fail') || text.includes('broken') || text.includes('missing')
      ? 'repair'
      : text.includes('search') || text.includes('find') || text.includes('why') || text.includes('what') || text.includes('how')
        ? 'research'
        : 'planning';

  const subdomain =
    text.includes('ace') || text.includes('rank') || text.includes('ingest')
      ? 'ace-pipeline'
      : text.includes('schema') || text.includes('zod') || text.includes('tool')
        ? 'tool-schema'
        : text.includes('redis') || text.includes('cache')
          ? 'cache'
          : text.includes('phase17') || text.includes('phase18') || text.includes('phase19') || text.includes('lane')
            ? 'atlas-lane'
            : 'unknown';

  const safeNextCommand =
    intent === 'repair'
      ? `rg -n "error|fail|undefined|null" scripts/ingest/ src/lib/server/ace/ --type ts`
      : domain === 'retrieval'
        ? 'node scripts/ingest/cache-ace-packet.mjs --audit'
        : domain === 'graph'
          ? 'rg -n "BELONGS_TO_CLUSTER|IMPORTS|topology" src/lib/server/graph/ --type ts'
          : domain === 'agent-workflow'
            ? 'npm run smoke:opencode'
            : `rg -rn "${prompt.split(' ').slice(0, 3).join('|')}" scripts/ src/ --type ts`;

  return { intent, domain, subdomain, confidence: subdomain !== 'unknown' ? 0.85 : 0.65, safeNextCommand };
}

function buildAgenticRagContext({ query, maxCards = 20, domainFilter }) {
  const root = process.cwd();
  const packetPath = path.join(root, '.opencode', 'ace-packet.json');

  if (!fs.existsSync(packetPath)) {
    return {
      ok: false,
      error: 'ACE packet not found. Run: npm run ingest:pipeline',
      safeNextCommand: 'npm run ingest:pipeline',
      cards: [],
      promptPacket: '',
      sourceRefs: [],
    };
  }

  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  } catch (e) {
    return { ok: false, error: `Failed to parse ACE packet: ${e.message}`, cards: [], promptPacket: '', sourceRefs: [] };
  }

  let cards = (packet.cards ?? []).filter(c => c.score != null && isFinite(c.score));

  if (domainFilter) {
    cards = cards.filter(c => c.domain === domainFilter);
  }

  const cap = Math.max(1, Math.min(50, Number(maxCards) || 20));
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  cards = cards
    .map(c => {
      const text = ((c.title ?? '') + ' ' + (c.summary ?? '')).toLowerCase();
      const overlap = queryTerms.filter(t => text.includes(t)).length;
      return { ...c, _qs: (c.score ?? 0) + overlap * 0.05 };
    })
    .sort((a, b) => (b._qs ?? 0) - (a._qs ?? 0))
    .slice(0, cap)
    .map(({ _qs, ...c }) => c);

  const sourceRefs = [...new Set(cards.map(c => c.sourceRef).filter(Boolean))];

  const promptPacket = [
    `[ACE CONTEXT — ${cards.length} cards, query: "${query}"]`,
    domainFilter ? `Domain filter: ${domainFilter}` : '',
    '',
    ...cards.slice(0, 10).map(
      (c, i) =>
        `${i + 1}. ${c.title ?? 'Untitled'} (score: ${c.score?.toFixed(3) ?? '?'})` +
        (c.summary ? `\n   ${c.summary.slice(0, 120)}` : '') +
        (c.sourceRef ? `\n   sourceRef: ${c.sourceRef}` : ''),
    ),
  ].filter(l => l !== '').join('\n');

  return {
    ok: true,
    query,
    totalCards: cards.length,
    packetAge: packet.generatedAt
      ? Math.round((Date.now() - new Date(packet.generatedAt).getTime()) / 60000) + 'min'
      : 'unknown',
    cards,
    sourceRefs,
    promptPacket,
    safeNextCommand: cards.length === 0 ? 'npm run ingest:pipeline' : 'node scripts/ingest/cache-ace-packet.mjs --audit',
  };
}

function buildRecommendation({ intent, domain, errorSummary, evidenceLines, patchTargets, proposedFix }) {
  const safeNextCommand =
    intent === 'repair' && patchTargets.length > 0
      ? `node --check ${patchTargets[0]}`
      : intent === 'repair'
        ? 'npm run svelte-check 2>&1 | head -30'
        : domain === 'retrieval'
          ? 'npm run ingest:pipeline'
          : domain === 'atlas-lane'
            ? 'npm run atlas:phase-lanes'
            : 'npm run smoke:opencode';

  const doNotDo = [];
  if (intent === 'repair') {
    doNotDo.push('Do not run drizzle-kit push without operator review');
    doNotDo.push('Do not delete or archive files without checking G1-G9 import gates');
  }
  if (domain === 'retrieval') {
    doNotDo.push('Do not clear Redis ace:packet:latest without running ingest:pipeline first');
  }
  doNotDo.push('Do not assume the fix succeeded — re-run the validator after patching');

  return {
    likely_cause: errorSummary,
    evidence: evidenceLines,
    patch_targets: patchTargets,
    proposed_fix: proposedFix ?? null,
    safe_next_command: safeNextCommand,
    do_not_do: doNotDo,
    intent,
    domain,
  };
}

async function recordOutcome(args) {
  const { intent, tool, sourceRefs, recommendationAccepted, reward, graphVersion = '2026-05-29', errorMsg = null } = args;

  const outcomeRecord = {
    id: crypto.randomUUID(),
    intent,
    tool,
    sourceRefs,
    recommendationAccepted,
    reward,
    graphVersion,
    errorMsg,
    timestamp: new Date().toISOString()
  };

  // 1. Write to local NDJSON ledger
  const ledgerDir = path.join(process.cwd(), '.opencode');
  if (!fs.existsSync(ledgerDir)) {
    fs.mkdirSync(ledgerDir, { recursive: true });
  }
  const ledgerPath = path.join(ledgerDir, 'outcome-ledger.ndjson');
  fs.appendFileSync(ledgerPath, JSON.stringify(outcomeRecord) + '\n');
  log(`Logged outcome to ${ledgerPath}`);

  // 2. Sync to Neo4j
  let syncedToNeo4j = false;
  try {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
        // MERGE Intent
        await session.run(
          `MERGE (i:Intent { name: $intent })
           ON CREATE SET i.created_at = datetime()
           SET i.updated_at = datetime()`,
          { intent }
        );

        // MERGE Tool
        await session.run(
          `MERGE (t:Tool { name: $tool })
           ON CREATE SET t.created_at = datetime()
           SET t.updated_at = datetime()`,
          { tool }
        );

        // Link Intent -> Tool
        await session.run(
          `MATCH (i:Intent { name: $intent })
           MATCH (t:Tool { name: $tool })
           MERGE (i)-[r:RESOLVED_BY]->(t)
           SET r.recommendationAccepted = $recommendationAccepted,
               r.reward = $reward,
               r.updated_at = datetime()`,
          { intent, tool, recommendationAccepted, reward }
        );

        // CREATE Outcome
        await session.run(
          `CREATE (o:Outcome {
             id: $outcomeId,
             reward: $reward,
             recommendationAccepted: $recommendationAccepted,
             graphVersion: $graphVersion,
             timestamp: datetime()
           })`,
          { outcomeId: outcomeRecord.id, reward, recommendationAccepted, graphVersion }
        );

        // Connect SourceRefs / CodebaseFiles
        for (const ref of sourceRefs) {
          const normalizedRef = ref.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');

          const fileCheck = await session.run(
            `MATCH (f:CodebaseFile { filePath: $normalizedRef }) RETURN f`,
            { normalizedRef }
          );

          if (fileCheck.records.length > 0) {
            await session.run(
              `MATCH (t:Tool { name: $tool })
               MATCH (f:CodebaseFile { filePath: $normalizedRef })
               MATCH (o:Outcome { id: $outcomeId })
               MERGE (t)-[r1:USED]->(f)
               SET r1.updated_at = datetime()
               MERGE (f)-[r2:PRODUCED]->(o)
               SET r2.updated_at = datetime()`,
              { tool, normalizedRef, outcomeId: outcomeRecord.id }
            );
          } else {
            await session.run(
              `MERGE (s:SourceRef { name: $ref })
               ON CREATE SET s.created_at = datetime()
               SET s.updated_at = datetime()
               WITH s
               MATCH (t:Tool { name: $tool })
               MATCH (o:Outcome { id: $outcomeId })
               MERGE (t)-[r1:USED]->(s)
               SET r1.updated_at = datetime()
               MERGE (s)-[r2:PRODUCED]->(o)
               SET r2.updated_at = datetime()`,
              { tool, ref, outcomeId: outcomeRecord.id }
            );
          }
        }
      syncedToNeo4j = true;
    } finally {
      await session.close();
    }
  } catch (err) {
    log(`Warning: Failed to sync outcome to Neo4j: ${err.message}`);
  }

  return { ok: true, id: outcomeRecord.id, syncedToNeo4j };
}

async function findDependencies({ target }) {
  const normalizedTarget = target.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (f:CodebaseFile { filePath: $normalizedTarget })-[r:IMPORTS|CALLS]->(dep)
       RETURN dep.filePath as dep, type(r) as type`,
      { normalizedTarget }
    );
    const deps = res.records.map(r => ({ dep: r.get('dep'), type: r.get('type') }));
    return { target: normalizedTarget, dependencies: deps };
  } finally {
    await session.close();
  }
}

async function traceDatabase({ query }) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (f:CodebaseFile)-[r:USES_DB]->(t:Table)
       WHERE t.name CONTAINS $query OR f.filePath CONTAINS $query
       RETURN f.filePath as file, t.name as table, r.operation as operation`,
      { query }
    );
    const traces = res.records.map(r => ({ file: r.get('file'), table: r.get('table'), operation: r.get('operation') }));
    return { query, traces };
  } finally {
    await session.close();
  }
}

async function traceToolChain({ tool }) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (f:CodebaseFile)-[r:USES_TOOL]->(t:Tool)
       WHERE t.name CONTAINS $tool
       RETURN f.filePath as file, t.name as tool, r.type as type`,
      { tool }
    );
    const traces = res.records.map(r => ({ file: r.get('file'), tool: r.get('tool'), type: r.get('type') }));
    return { tool, traces };
  } finally {
    await session.close();
  }
}

async function findSourceRefs({ query }) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (s:SourceRef) WHERE s.name CONTAINS $query
       RETURN s.name as name`,
      { query }
    );
    const refs = res.records.map(r => r.get('name'));
    return { query, sourceRefs: refs };
  } finally {
    await session.close();
  }
}

async function findFeature({ feature }) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (f:Feature) WHERE f.name CONTAINS $feature
       RETURN f.name as name, f.description as description`,
      { feature }
    );
    const features = res.records.map(r => ({ name: r.get('name'), description: r.get('description') }));
    return { feature, features };
  } finally {
    await session.close();
  }
}

async function findRoute({ route }) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (r:Route) WHERE r.path CONTAINS $route
       RETURN r.path as path, r.type as type`,
      { route }
    );
    const routes = res.records.map(r => ({ path: r.get('path'), type: r.get('type') }));
    return { route, routes };
  } finally {
    await session.close();
  }
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────────────

async function dispatch(method, params, id) {
  if (method === 'initialize') {
    return { protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO, capabilities: { tools: {} } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params ?? {};
    try {
      let result;
      if (name === 'classify_intent')           result = classifyIntent(args);
      else if (name === 'build_agentic_rag_context') result = buildAgenticRagContext(args);
      else if (name === 'build_recommendation') result = buildRecommendation(args);
      else if (name === 'record_outcome') result = await recordOutcome(args);
      else if (name === 'find_dependencies') result = await findDependencies(args);
      else if (name === 'trace_database') result = await traceDatabase(args);
      else if (name === 'trace_tool_chain') result = await traceToolChain(args);
      else if (name === 'find_source_refs') result = await findSourceRefs(args);
      else if (name === 'find_feature') result = await findFeature(args);
      else if (name === 'find_route') result = await findRoute(args);
      else throw new Error(`Unknown tool: ${name}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  }
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

// ── Stdio loop ─────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

let pendingOperations = 0;
let isClosed = false;

function shutdown() {
  log('Stdin closed and operations complete, shutting down...');
  if (neo4jDriver) {
    neo4jDriver.close().then(() => {
      process.exit(0);
    }).catch(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

rl.on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { method, params, id } = msg;
  const isNotif = id === undefined || id === null;

  pendingOperations++;
  try {
    const result = await dispatch(method, params, id);
    if (isNotif || result === null) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch (e) {
    if (isNotif) return;
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id,
      error: { code: e.code ?? -32603, message: e.message },
    }) + '\n');
  } finally {
    pendingOperations--;
    if (isClosed && pendingOperations === 0) {
      shutdown();
    }
  }
});

rl.on('close', () => {
  isClosed = true;
  if (pendingOperations === 0) {
    shutdown();
  }
});

log('atlas-tools MCP ready (classify_intent, build_agentic_rag_context, build_recommendation, record_outcome, and path trace tools)');