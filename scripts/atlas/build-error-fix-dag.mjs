#!/usr/bin/env node
/**
 * Error-Fix DAG builder — KAG / DAG / HMM layer.
 *
 * Reads findings from audit-contract-map.mjs output and builds:
 *  - A DAG (directed acyclic graph) ordering root errors before downstream errors
 *  - KAG recall: looks up Redis `ace:fixer:patterns` for past fixes
 *  - HMM state labels: transparent error state machine (schema_mismatch,
 *    stale_migration, route_contract_mismatch, env_url_mismatch, etc.)
 *  - Topological sort for recommended fix order
 *
 * Usage:
 *   node scripts/atlas/build-error-fix-dag.mjs [--json] [--dry-run] [--no-redis]
 *
 * Output:
 *   docs/graph/contract-error-map.json
 *   docs/reports/error-fix-dag-report.json
 *   docs/reports/error-fix-dag-report.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from './_atlas-utils.mjs';

const REPORTS_DIR = join(REPO_ROOT, 'docs', 'reports');
const GRAPH_DIR   = join(REPO_ROOT, 'docs', 'graph');

const ARGS     = process.argv.slice(2);
const DRY_RUN  = ARGS.includes('--dry-run');
const JSON_OUT = ARGS.includes('--json');
const NO_REDIS = ARGS.includes('--no-redis');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const CONTRACT_REPORT = join(REPORTS_DIR, 'contract-error-map-report.json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

// ── HMM state catalog ─────────────────────────────────────────────────────────
// Each state maps to a human-readable label + a set of error codes that belong to it
const HMM_STATES = {
  schema_mismatch: {
    label: 'Schema Mismatch',
    codes: ['userId_fk_type_mismatch', 'drizzle_type_mismatch', 'unknown_fk_type', 'vector_dim_mismatch'],
    description: 'Drizzle schema column type does not match the live Postgres column type.',
  },
  stale_migration: {
    label: 'Stale Migration',
    codes: ['sql_file_not_in_journal', 'drizzle_table_missing_in_migration', 'migration_table_missing_in_schema'],
    description: 'SQL migration file exists on disk but is not tracked by drizzle/meta/_journal.json, or vice versa.',
  },
  route_contract_mismatch: {
    label: 'Route Contract Mismatch',
    codes: ['superValidate_without_matching_schema', 'action_missing_fail_400_form', 'action_missing_return_form', 'client_superForm_without_server_load', 'superforms_schema_not_top_level'],
    description: 'SvelteKit route or Superforms v2 contract is incomplete or incorrectly wired.',
  },
  env_url_mismatch: {
    label: 'Env/URL Mismatch',
    codes: ['env_url_mismatch', 'hardcoded_port', 'missing_seaweed_env', 'missing_db_url_env'],
    description: 'Environment variable or URL mismatch between dev/prod/Docker contexts.',
  },
  vector_infra_missing: {
    label: 'Vector Infrastructure Missing',
    codes: ['extension_in_migrations', 'hnsw_indexes', 'drizzle_vector_import', 'vector_dimensions', 'pgvector_not_installed'],
    description: 'pgvector extension or HNSW indexes missing from migrations or live DB.',
  },
  api_validation_gap: {
    label: 'API Validation Gap',
    codes: ['api_route_parses_json_without_zod', 'zod_schema_not_connected_to_drizzle_table', 'legacy_zod_adapter'],
    description: 'API route processes untrusted input without Zod validation.',
  },
  ssr_safety_violation: {
    label: 'SSR Safety Violation',
    codes: ['server_import_leaked_to_client'],
    description: 'Server-only import (DB, secrets) visible in client .svelte bundle.',
  },
  meta_hygiene: {
    label: 'Drizzle Meta Hygiene',
    codes: ['non_json_in_drizzle_meta', 'unsafe_write_without_where'],
    description: 'drizzle/meta/ contains non-JSON files or schema has unsafe writes without .where().',
  },
};

// ── Root-cause → downstream dependency map ────────────────────────────────────
// If error A is a root cause, fixing A is required before downstream B can be verified
const ROOT_CAUSE_DEPS = [
  // Schema mismatches cascade into route + zod mismatches
  { from: 'schema_mismatch',        to: 'route_contract_mismatch',  weight: 0.85 },
  { from: 'schema_mismatch',        to: 'api_validation_gap',       weight: 0.60 },
  // Stale migrations cascade into schema mismatches
  { from: 'stale_migration',        to: 'schema_mismatch',          weight: 0.91 },
  { from: 'stale_migration',        to: 'vector_infra_missing',     weight: 0.70 },
  // Env mismatches cascade into route contracts
  { from: 'env_url_mismatch',       to: 'route_contract_mismatch',  weight: 0.55 },
  // Missing pgvector infra cascades into API validation gaps (embedding routes)
  { from: 'vector_infra_missing',   to: 'api_validation_gap',       weight: 0.45 },
  // Meta hygiene issues cascade into stale migrations
  { from: 'meta_hygiene',           to: 'stale_migration',          weight: 0.80 },
  // SSR violations are leaf nodes — no downstream dependencies
];

// ── Validation commands per state ─────────────────────────────────────────────
const VALIDATION_COMMANDS = {
  schema_mismatch:         ['npm run db:check', 'npm run audit:contracts', 'npm run test:network-contracts'],
  stale_migration:         ['npm run audit:drizzle-meta', 'cd sveltekit-frontend && npx drizzle-kit generate --dry-run'],
  route_contract_mismatch: ['npm run audit:forms', 'npm run test:network-contracts'],
  env_url_mismatch:        ['npm run audit:contracts', 'node scripts/atlas/validate-dev-services.mjs'],
  vector_infra_missing:    ['npm run audit:pgvector', 'npm run db:check'],
  api_validation_gap:      ['npm run audit:forms', 'npm run lint:drizzle'],
  ssr_safety_violation:    ['npm run audit:forms', 'cd sveltekit-frontend && npx svelte-check'],
  meta_hygiene:            ['npm run audit:drizzle-meta', 'npm run audit:drizzle-meta:fix'],
};

// ── Agent command keys ────────────────────────────────────────────────────────
const AGENT_COMMAND_KEYS = {
  schema_mismatch:         ['db.check', 'contract.audit', 'drizzle.inspect'],
  stale_migration:         ['drizzle.journal', 'db.migrate', 'contract.audit'],
  route_contract_mismatch: ['forms.audit', 'contract.audit'],
  env_url_mismatch:        ['env.check', 'services.health', 'contract.audit'],
  vector_infra_missing:    ['pgvector.audit', 'db.check'],
  api_validation_gap:      ['forms.audit', 'zod.check'],
  ssr_safety_violation:    ['forms.audit', 'ssr.check'],
  meta_hygiene:            ['drizzle.meta.check', 'drizzle.meta.fix'],
};

// ── KAG recall from Redis ─────────────────────────────────────────────────────
async function kagRecall(states) {
  if (NO_REDIS) return {};
  let redis;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();

    const recalls = {};
    for (const state of states) {
      const key = `ace:fixer:patterns:${state}`;
      const raw = await redis.get(key).catch(() => null);
      if (raw) {
        try { recalls[state] = JSON.parse(raw); } catch { recalls[state] = [raw]; }
      }
    }
    try {
      redis.disconnect();
    } catch {
      // best-effort cleanup
    }
    return recalls;
  } catch {
    try {
      redis?.disconnect();
    } catch {
      // best-effort cleanup
    }
    return {};
  }
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────
function topologicalSort(nodes, edges) {
  const inDegree = new Map(nodes.map(n => [n, 0]));
  const adj = new Map(nodes.map(n => [n, []]));

  for (const { from, to } of edges) {
    if (inDegree.has(to)) inDegree.set(to, inDegree.get(to) + 1);
    if (adj.has(from)) adj.get(from).push(to);
  }

  const queue = nodes.filter(n => inDegree.get(n) === 0);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const neighbor of (adj.get(n) ?? [])) {
      const d = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, d);
      if (d === 0) queue.push(neighbor);
    }
  }
  return order;
}

// ── classify findings into HMM states ─────────────────────────────────────────
function classifyFindings(findings) {
  const stateFindings = new Map(Object.keys(HMM_STATES).map(s => [s, []]));

  for (const f of findings) {
    const code = (f.code ?? f.findingId ?? '').replace(/.*:/, '');
    let matched = false;
    for (const [state, { codes }] of Object.entries(HMM_STATES)) {
      if (codes.some(c => code.includes(c) || (f.findingId ?? '').includes(c.replace(/_/g, '-')))) {
        stateFindings.get(state).push(f);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Heuristic: classify by layer
      const layer = f.layer ?? '';
      if (layer.includes('drizzle') || layer.includes('postgres')) stateFindings.get('schema_mismatch').push(f);
      else if (layer.includes('superforms') || layer.includes('api-contract')) stateFindings.get('api_validation_gap').push(f);
      else if (layer.includes('ssr')) stateFindings.get('ssr_safety_violation').push(f);
      else if (layer.includes('pgvector')) stateFindings.get('vector_infra_missing').push(f);
      else if (layer.includes('env')) stateFindings.get('env_url_mismatch').push(f);
      else stateFindings.get('route_contract_mismatch').push(f);
    }
  }

  return stateFindings;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Error-Fix DAG Builder ──${C.reset}\n`);
  }

  // Load findings from contract audit report
  let findings = [];
  if (existsSync(CONTRACT_REPORT)) {
    try {
      const raw = JSON.parse(readFileSync(CONTRACT_REPORT, 'utf8'));
      findings = raw.findings ?? [];
      if (!JSON_OUT) {
        console.log(`  ${C.gray}Loaded ${findings.length} findings from contract-error-map-report.json${C.reset}`);
      }
    } catch (e) {
      if (!JSON_OUT) console.warn(`  ${C.yellow}Warning: could not parse contract-error-map-report.json: ${e.message}${C.reset}`);
    }
  } else {
    if (!JSON_OUT) {
      console.log(`  ${C.yellow}Warning: contract-error-map-report.json not found — run npm run audit:contracts first${C.reset}`);
      console.log(`  ${C.gray}Building DAG from zero findings${C.reset}`);
    }
  }

  // Also try to pick up form contracts report if available
  const formReport = join(REPORTS_DIR, 'sveltekit-form-contracts-report.json');
  if (existsSync(formReport)) {
    try {
      const raw = JSON.parse(readFileSync(formReport, 'utf8'));
      const formFindings = raw.findings ?? [];
      findings = [...findings, ...formFindings];
      if (!JSON_OUT) {
        console.log(`  ${C.gray}+ ${formFindings.length} form contract findings${C.reset}`);
      }
    } catch { /* skip */ }
  }

  // Deduplicate by findingId
  const seen = new Set();
  findings = findings.filter(f => {
    if (seen.has(f.findingId)) return false;
    seen.add(f.findingId);
    return true;
  });

  // Informational findings do not participate in the error-fix DAG.
  findings = findings.filter(f => (f.severity ?? 'medium') !== 'info');

  // Classify into HMM states
  const stateFindings = classifyFindings(findings);

  // Active states (have at least 1 finding)
  const activeStates = [...stateFindings.entries()]
    .filter(([, fs]) => fs.length > 0)
    .map(([s]) => s);

  // Build DAG edges among active states
  const dagEdges = ROOT_CAUSE_DEPS.filter(
    e => activeStates.includes(e.from) && activeStates.includes(e.to),
  );

  // Topological fix order
  const allStateNodes = Object.keys(HMM_STATES);
  const topoOrder = topologicalSort(allStateNodes, ROOT_CAUSE_DEPS);

  // KAG recall
  if (!JSON_OUT && !NO_REDIS) console.log(`  ${C.gray}Querying Redis for KAG pattern recall…${C.reset}`);
  const recalls = await kagRecall(activeStates);

  // Build DAG nodes
  const dagNodes = activeStates.map((state, idx) => {
    const stateFinds = stateFindings.get(state) ?? [];
    const fixOrder = topoOrder.indexOf(state) + 1;
    const downstreamStates = dagEdges.filter(e => e.from === state).map(e => e.to);
    const highSev = stateFinds.filter(f => f.severity === 'high');
    const rootCauseScore = highSev.length > 0
      ? Math.min(0.99, 0.60 + (dagEdges.filter(e => e.from === state).length * 0.10) + (highSev.length * 0.05))
      : Math.min(0.59, 0.20 + (dagEdges.filter(e => e.from === state).length * 0.05));

    return {
      errorId: `contract:${state}`,
      hmmState: state,
      hmmLabel: HMM_STATES[state]?.label ?? state,
      hmmDescription: HMM_STATES[state]?.description ?? '',
      rootCauseScore: Math.round(rootCauseScore * 100) / 100,
      findingCount: stateFinds.length,
      severity: highSev.length > 0 ? 'high' : stateFinds.some(f => f.severity === 'medium') ? 'medium' : 'low',
      downstreamErrors: downstreamStates.map(s => `contract:${s}`),
      kagRecall: recalls[state] ?? [],
      recommendedOrder: fixOrder,
      validationCommands: VALIDATION_COMMANDS[state] ?? [],
      agentCommandKeys: AGENT_COMMAND_KEYS[state] ?? [],
      findings: stateFinds.map(f => f.findingId),
      trustTier: 'canonical_local_code_plus_official_docs',
    };
  });

  // Sort by recommended fix order (root causes first)
  dagNodes.sort((a, b) => a.recommendedOrder - b.recommendedOrder);

  if (!JSON_OUT) {
    console.log(`\n  ${C.bold}Fix Order (root causes first):${C.reset}\n`);
    for (const node of dagNodes) {
      const sevColor = node.severity === 'high' ? C.red : node.severity === 'medium' ? C.yellow : C.gray;
      const dsStr = node.downstreamErrors.length > 0
        ? ` → [${node.downstreamErrors.map(s => s.replace('contract:', '')).join(', ')}]`
        : '';
      console.log(
        `  ${String(node.recommendedOrder).padStart(2)}. ` +
        `${sevColor}${node.hmmLabel.padEnd(30)}${C.reset} ` +
        `${node.findingCount} finding(s)  rootScore=${node.rootCauseScore}${C.gray}${dsStr}${C.reset}`,
      );
      if (node.kagRecall.length > 0) {
        console.log(`      ${C.cyan}KAG recall:${C.reset} ${JSON.stringify(node.kagRecall).slice(0, 80)}`);
      }
    }
    console.log();
  }

  // Build the contract-error-map graph JSON (nodes + edges for visualization)
  const graphNodes = dagNodes.map(n => ({
    id: n.errorId,
    label: n.hmmLabel,
    state: n.hmmState,
    severity: n.severity,
    findingCount: n.findingCount,
    rootCauseScore: n.rootCauseScore,
    fixOrder: n.recommendedOrder,
  }));

  const graphEdges = dagEdges.map(e => ({
    from: `contract:${e.from}`,
    to:   `contract:${e.to}`,
    weight: e.weight,
    label: `${Math.round(e.weight * 100)}% cascade`,
  }));

  const graph = {
    generatedAt: new Date().toISOString(),
    totalFindings: findings.length,
    nodes: graphNodes,
    edges: graphEdges,
  };

  // Build the full DAG report
  const report = {
    generatedAt: new Date().toISOString(),
    inputFindings: findings.length,
    activeStates: activeStates.length,
    topoOrder,
    dagNodes,
    dagEdges,
    redisKagAvailable: !NO_REDIS && Object.keys(recalls).length > 0,
    summary: {
      high:   dagNodes.filter(n => n.severity === 'high').length,
      medium: dagNodes.filter(n => n.severity === 'medium').length,
      low:    dagNodes.filter(n => n.severity === 'low').length,
      totalFindings: findings.length,
    },
    status: dagNodes.some(n => n.severity === 'high') ? 'action-required' : 'ok',
  };

  // Markdown report
  const md = [
    '# Error-Fix DAG Report',
    `_Generated: ${report.generatedAt}_`,
    '',
    `**Total findings:** ${report.inputFindings}  |  **Active error states:** ${report.activeStates}`,
    '',
    '## Recommended Fix Order',
    '',
    '| Order | State | Severity | Findings | Root Score | Downstream |',
    '|-------|-------|----------|----------|------------|------------|',
    ...dagNodes.map(n =>
      `| ${n.recommendedOrder} | **${n.hmmLabel}** | ${n.severity} | ${n.findingCount} | ${n.rootCauseScore} | ${n.downstreamErrors.map(s => s.replace('contract:', '')).join(', ') || '—'} |`,
    ),
    '',
    '## HMM States',
    '',
    ...dagNodes.map(n => [
      `### ${n.recommendedOrder}. ${n.hmmLabel}`,
      '',
      n.hmmDescription,
      '',
      `**Validation commands:**`,
      ...n.validationCommands.map(c => `- \`${c}\``),
      '',
      n.findings.length > 0 ? `**Findings (${n.findings.length}):**` : '',
      ...n.findings.slice(0, 5).map(fid => `- \`${fid}\``),
      n.findings.length > 5 ? `- _… ${n.findings.length - 5} more_` : '',
      '',
    ].filter(l => l !== undefined)).flat(),
  ].join('\n');

  if (!DRY_RUN) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    mkdirSync(GRAPH_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, 'error-fix-dag-report.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(REPORTS_DIR, 'error-fix-dag-report.md'), md);
    writeFileSync(join(GRAPH_DIR, 'contract-error-map.json'), JSON.stringify(graph, null, 2));

    if (!JSON_OUT) {
      console.log(`  ${C.gray}Reports → docs/reports/error-fix-dag-report.{json,md}${C.reset}`);
      console.log(`  ${C.gray}Graph   → docs/graph/contract-error-map.json${C.reset}\n`);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'action-required' ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
