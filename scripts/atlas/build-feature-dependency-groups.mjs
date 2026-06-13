#!/usr/bin/env node
/**
 * scripts/atlas/build-feature-dependency-groups.mjs
 *
 * Builds Feature Dependency Group packets for Parent Atlas.
 *
 * Purpose:
 *   feature_label -> files/routes/tests/tools/RPCs/dependencies -> Atlas packet.
 *
 * Default mode is dry-run. --apply writes additive atlas_packets rows only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const DRY_RUN = process.argv.includes('--dry-run') || (!APPLY && !VERIFY);

const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'feature-dependency-groups.json');
const MD_REPORT = path.join(REPORT_DIR, 'feature-dependency-groups.md');

const INPUTS = {
  graph: 'sveltekit-frontend/docs/graph/codebase-graph.json',
  atlas: 'sveltekit-frontend/docs/atlas-index/codebase-atlas.json',
  dirs: 'sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json',
  intentAliases: 'docs/reports/implementation-intent-aliases.json'
};

const EXCLUDED = [
  'node_modules/',
  '.git/',
  '.svelte-kit/',
  '.vite/',
  'dist/',
  'build/',
  'coverage/',
  'package-lock.json',
  'pnpm-lock.yaml'
];

function sha16(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function redact(value) {
  if (!value) return value;
  const s = String(value);
  return s.length <= 4 ? '****' : `${s.slice(0, 2)}****${s.slice(-2)}`;
}

async function getPgClientCtor() {
  const pg = await import('pg');
  const Client = pg.Client || pg.default?.Client;
  if (typeof Client !== 'function') throw new Error('Cannot resolve pg.Client from ESM import');
  return Client;
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readJson(rel, fallback) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    console.warn(`[warn] Could not parse ${rel}: ${err.message}`);
    return fallback;
  }
}

function cleanPath(p) {
  return String(p || '').replaceAll('\\', '/').replace(/^\/+/, '');
}

function isAllowedFile(p) {
  const s = cleanPath(p);
  return s && !EXCLUDED.some((x) => s.includes(x));
}

function uniq(arr, max = 200) {
  return [...new Set((arr || []).map(cleanPath).filter(Boolean))].slice(0, max);
}

function inferDomain(file) {
  const f = cleanPath(file).toLowerCase();
  if (f.includes('qdrant') || f.includes('retrieval') || f.includes('rag')) return 'rag_retrieval';
  if (f.includes('neo4j') || f.includes('graph')) return 'neo4j_context_graph';
  if (f.includes('redis') || f.includes('valkey') || f.includes('cache')) return 'redis_bitfrost_cache';
  if (f.includes('gpu') || f.includes('libtorch') || f.includes('turbovec')) return 'gpu_turbovec_libtorch';
  if (f.includes('mcp') || f.includes('agent')) return 'mcp_agents';
  if (f.includes('case')) return 'case_management';
  if (f.includes('evidence')) return 'evidence_upload_storage';
  if (f.includes('auth') || f.includes('login')) return 'auth_login_register';
  if (f.includes('admin') || f.includes('observability')) return 'admin_observability';
  return 'general_codebase';
}

function featureFromPath(file) {
  const f = cleanPath(file);
  const base = f
    .replace(/^sveltekit-frontend\//, '')
    .replace(/\+server\.ts$/, 'server')
    .replace(/\+page\.server\.ts$/, 'page-server')
    .replace(/\.(ts|svelte|js|mjs|json|md|proto|cc|cpp|h|hpp)$/, '')
    .split('/')
    .slice(-3)
    .join('_')
    .replace(/[^a-zA-Z0-9_:-]/g, '_')
    .toLowerCase();
  return base || 'unknown_feature';
}

function labelFromFeatureId(id) {
  return String(id).replace(/[_:-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function getGraphFiles(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes.map((n) => n.file_path || n.path || n.source_ref || n.id).map(cleanPath).filter(isAllowedFile);
}

function getGraphEdges(graph) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const map = new Map();
  for (const e of edges) {
    const from = cleanPath(e.from || e.source || e.source_ref || e.a);
    const to = cleanPath(e.to || e.target || e.target_ref || e.b);
    if (!isAllowedFile(from) || !isAllowedFile(to)) continue;
    if (!map.has(from)) map.set(from, []);
    map.get(from).push(to);
  }
  return map;
}

function buildAceHits(group) {
  return [
    {
      tool: 'atlas-tools_build_agentic_rag_context',
      query: `${group.feature_label} implementation dependency group`,
      evidence_kind: 'feature_dependency_group',
      confidence: group.confidence || 0.5,
      source_ref: group.root_files?.[0] || `feature-group:${group.feature_id}`
    }
  ];
}

function buildGroups() {
  const graph = readJson(INPUTS.graph, {});
  const aliasesReport = readJson(INPUTS.intentAliases, { intents: [] });
  const files = getGraphFiles(graph);
  const edges = getGraphEdges(graph);
  const byFeature = new Map();

  for (const file of files) {
    const feature_id = featureFromPath(file);
    const feature_label = labelFromFeatureId(feature_id);
    const domain = inferDomain(file);
    if (!byFeature.has(feature_id)) {
      byFeature.set(feature_id, {
        packet_kind: 'feature_dependency_group',
        packet_key: `feature_group:${sha16(feature_id)}`,
        source_ref: `feature-group:${feature_id}`,
        feature_id,
        feature_label,
        community_id: null,
        domain,
        description: `Groups implementation files and evidence for ${feature_label}.`,
        summary: '',
        ace_kag_dag_hits: [],
        root_files: [],
        dependency_files: [],
        test_files: [],
        route_files: [],
        rpc_methods: [],
        tool_names: [],
        packet_keys: [],
        qdrant_point_ids: [],
        neo4j_nodes: [],
        redis_keys: [],
        kanban_tasks: [],
        confidence: 0
      });
    }
    const g = byFeature.get(feature_id);
    g.root_files.push(file);
    g.dependency_files.push(...(edges.get(file) || []));
    if (file.includes('/tests/') || file.includes('.spec.') || file.includes('.test.')) g.test_files.push(file);
    if (file.includes('/routes/') || file.includes('/api/')) g.route_files.push(file);
    g.redis_keys.push(`feature:deps:${feature_id}`);
    g.neo4j_nodes.push(`Feature:${feature_id}`);
  }

  const intentRows = Array.isArray(aliasesReport?.intents)
    ? aliasesReport.intents
    : Array.isArray(aliasesReport)
      ? aliasesReport
      : [];

  for (const intent of intentRows) {
    const likely = intent.likely_files || intent.payload?.likely_files || [];
    const feature_id = intent.feature_id || intent.payload?.feature_id || String(intent.feature_label || intent.intent || 'intent_alias').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const feature_label = intent.feature_label || intent.payload?.feature_label || labelFromFeatureId(feature_id);
    const domain = intent.domain || intent.payload?.domain || 'implementation_intent';
    if (!byFeature.has(feature_id)) {
      byFeature.set(feature_id, {
        packet_kind: 'feature_dependency_group',
        packet_key: `feature_group:${sha16(feature_id)}`,
        source_ref: `feature-group:${feature_id}`,
        feature_id,
        feature_label,
        community_id: null,
        domain,
        description: `Groups implementation files and evidence for ${feature_label}.`,
        summary: '',
        ace_kag_dag_hits: [],
        root_files: [],
        dependency_files: [],
        test_files: [],
        route_files: [],
        rpc_methods: [],
        tool_names: [],
        packet_keys: [intent.packet_key].filter(Boolean),
        qdrant_point_ids: [],
        neo4j_nodes: [`Feature:${feature_id}`],
        redis_keys: [`feature:deps:${feature_id}`],
        kanban_tasks: [],
        confidence: 0
      });
    }
    const g = byFeature.get(feature_id);
    g.root_files.push(...likely.filter(isAllowedFile));
    g.tool_names.push(...(intent.aliases || intent.payload?.aliases || []));
    g.packet_keys.push(intent.packet_key);
  }

  return [...byFeature.values()].map((g) => {
    g.root_files = uniq(g.root_files, 80);
    g.dependency_files = uniq(g.dependency_files, 120);
    g.test_files = uniq(g.test_files, 50);
    g.route_files = uniq(g.route_files, 50);
    g.rpc_methods = uniq(g.rpc_methods, 50);
    g.tool_names = uniq(g.tool_names, 50);
    g.packet_keys = uniq(g.packet_keys, 100);
    g.qdrant_point_ids = uniq(g.qdrant_point_ids, 100);
    g.neo4j_nodes = uniq(g.neo4j_nodes, 100);
    g.redis_keys = uniq(g.redis_keys, 50);
    g.kanban_tasks = uniq(g.kanban_tasks, 50);

    let score = 0;
    if (g.feature_id) score += 0.25;
    if (g.root_files.length) score += 0.30;
    if (g.dependency_files.length) score += 0.15;
    if (g.test_files.length) score += 0.10;
    if (g.route_files.length) score += 0.10;
    if (g.tool_names.length) score += 0.10;
    g.confidence = Math.min(1, Number(score.toFixed(3)));
    g.summary = `Grounded by ACE/KAG/DAG retrieval context: ${g.feature_label} groups ${g.root_files.length} root files, ${g.dependency_files.length} dependency files, ${g.route_files.length} routes, ${g.test_files.length} tests, and ${g.tool_names.length} tool aliases.`;
    g.ace_kag_dag_hits = buildAceHits(g);
    g.metadata = {
      path: `feature-groups/${g.feature_id}.json`,
      hash: `sha256:${sha16(JSON.stringify({ feature_id: g.feature_id, root_files: g.root_files, dependency_files: g.dependency_files }))}`,
      indexed_at: new Date().toISOString()
    };
    g.payload = { ...g };
    delete g.payload.payload;
    return g;
  }).filter((g) => (g.feature_id || g.feature_label) && (g.root_files.length || g.packet_keys.length)).sort((a, b) => b.confidence - a.confidence);
}

function validate(groups) {
  const seen = new Set();
  const failures = [];
  const warnings = [];
  for (const g of groups) {
    if (!g.packet_key) failures.push('missing packet_key');
    if (!g.source_ref) failures.push(`missing source_ref: ${g.packet_key}`);
    if (!g.feature_id) failures.push(`missing feature_id: ${g.packet_key}`);
    if (!g.description) failures.push(`missing description: ${g.packet_key}`);
    if (!g.summary) failures.push(`missing summary: ${g.packet_key}`);
    if (!Array.isArray(g.ace_kag_dag_hits)) failures.push(`missing ace_kag_dag_hits: ${g.packet_key}`);
    if (!g.root_files.length && !g.packet_keys.length) failures.push(`empty group: ${g.packet_key}`);
    if (seen.has(g.packet_key)) failures.push(`duplicate packet_key: ${g.packet_key}`);
    seen.add(g.packet_key);
    const bad = [...g.root_files, ...g.dependency_files, ...g.test_files, ...g.route_files].filter((f) => !isAllowedFile(f));
    if (bad.length) failures.push(`excluded paths in ${g.packet_key}: ${bad.slice(0, 3).join(', ')}`);
    if (g.confidence < 0.5) warnings.push(`low confidence ${g.confidence}: ${g.feature_label}`);
  }
  return { ok: failures.length === 0, failures, warnings, gates: { groups_total: groups.length, duplicate_packet_keys: failures.filter((f) => f.includes('duplicate')).length, low_confidence: warnings.length } };
}

function writeReports(groups, validation) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ok: validation.ok,
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    apply: APPLY,
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([k, v]) => [k, { path: v, exists: exists(v) }])),
    env: {
      postgres_host: getEnv('POSTGRES_HOST', '127.0.0.1'),
      postgres_port: getEnv('POSTGRES_PORT', '5434'),
      postgres_password: redact(getEnv('POSTGRES_PASSWORD', ''))
    },
    validation,
    groups
  };
  fs.writeFileSync(JSON_REPORT, JSON.stringify(report, null, 2));
  const md = [
    '# Feature Dependency Groups',
    '',
    `Generated: ${report.generated_at}`,
    `Groups: ${groups.length}`,
    `Status: ${validation.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Top groups',
    '',
    ...groups.slice(0, 25).map((g) => `- **${g.feature_label}** (${g.feature_id}) — confidence ${g.confidence}, root ${g.root_files.length}, deps ${g.dependency_files.length}, routes ${g.route_files.length}`),
    '',
    '## Warnings',
    '',
    ...(validation.warnings.length ? validation.warnings.slice(0, 50).map((w) => `- ${w}`) : ['- none']),
    '',
    '## Failures',
    '',
    ...(validation.failures.length ? validation.failures.map((f) => `- ${f}`) : ['- none']),
    ''
  ].join('\n');
  fs.writeFileSync(MD_REPORT, md);
  return report;
}

async function applyToPostgres(groups) {
  const Client = await getPgClientCtor();
  const client = getEnv('DATABASE_URL')
    ? new Client({ connectionString: getEnv('DATABASE_URL') })
    : new Client({
        host: getEnv('POSTGRES_HOST', '127.0.0.1'),
        port: Number(getEnv('POSTGRES_PORT', '5434')),
        database: getEnv('POSTGRES_DB', 'legal_ai_db'),
        user: getEnv('POSTGRES_USER', 'legal_admin'),
        password: getEnv('POSTGRES_PASSWORD', 'legal')
      });
  await client.connect();
  let count = 0;
  for (const g of groups) {
    await client.query(
      `
      INSERT INTO atlas_packets
        (packet_id, artifact_id, packet_key, source_ref, feature_id, community_id,
         summary, payload, source_kind, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,NOW(),NOW())
      ON CONFLICT (packet_id) DO UPDATE SET
        packet_key = EXCLUDED.packet_key,
        source_ref = EXCLUDED.source_ref,
        feature_id = EXCLUDED.feature_id,
        summary = EXCLUDED.summary,
        payload = EXCLUDED.payload,
        source_kind = EXCLUDED.source_kind,
        updated_at = NOW()
      `,
      [
        g.packet_key,
        g.feature_id,
        g.packet_key,
        g.source_ref,
        g.feature_id,
        g.community_id,
        g.summary,
        JSON.stringify(g),
        'feature_dependency_group'
      ]
    );
    count++;
  }
  await client.end();
  return { postgres: 'ok', count };
}

async function main() {
  const groups = buildGroups();
  const validation = validate(groups);
  writeReports(groups, validation);
  console.log(`Feature dependency groups: ${groups.length}`);
  console.log(`Report: ${path.relative(ROOT, JSON_REPORT)}`);
  console.log(`Gate: ${validation.ok ? 'PASS' : 'FAIL'}`);
  if (validation.warnings.length) console.log(`Warnings: ${validation.warnings.length}`);
  if (!validation.ok) {
    console.error(validation.failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  if (VERIFY) return;
  if (APPLY) {
    const result = await applyToPostgres(groups);
    console.log(`Apply: ${JSON.stringify(result)}`);
  } else {
    console.log('Dry run only. Use --apply to write atlas_packets.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
