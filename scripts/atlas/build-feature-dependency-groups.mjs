// scripts/atlas/build-feature-dependency-groups.mjs
/**
 * Builds Feature Dependency Group packets for Parent Atlas.
 * Dry-run by default. --apply writes additive atlas_packets rows only.
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
  intentAliases: 'docs/reports/implementation-intent-aliases.json',
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
  'pnpm-lock.yaml',
];

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
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

function sha16(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 16);
}

function cleanPath(p) {
  return String(p || '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
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
  if (f.includes('redis') || f.includes('valkey') || f.includes('cache'))
    return 'redis_bitfrost_cache';
  if (f.includes('gpu') || f.includes('libtorch') || f.includes('turbovec'))
    return 'gpu_turbovec_libtorch';
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
    .replace(/\.(ts|svelte|js|mjs|json|md)$/, '')
    .split('/')
    .slice(-3)
    .join('_')
    .replace(/[^a-zA-Z0-9_:-]/g, '_')
    .toLowerCase();

  return base || 'unknown_feature';
}

function labelFromFeatureId(id) {
  return String(id)
    .replace(/[_:-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function getGraphFiles(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes
    .map((n) => n.file_path || n.path || n.source_ref || n.id)
    .map(cleanPath)
    .filter(isAllowedFile);
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

function buildGroups() {
  const graph = readJson(INPUTS.graph, {});
  const atlas = readJson(INPUTS.atlas, {});
  const dirs = readJson(INPUTS.dirs, {});
  const aliases = readJson(INPUTS.intentAliases, { intents: [] });

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
        feature_id,
        feature_label,
        domain,
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
        confidence: 0,
      });
    }

    const g = byFeature.get(feature_id);
    g.root_files.push(file);

    const deps = edges.get(file) || [];
    g.dependency_files.push(...deps);

    if (file.includes('/tests/') || file.includes('.spec.') || file.includes('.test.')) {
      g.test_files.push(file);
    }

    if (file.includes('/routes/') || file.includes('/api/')) {
      g.route_files.push(file);
    }

    g.redis_keys.push(`feature:deps:${feature_id}`);
    g.neo4j_nodes.push(`Feature:${feature_id}`);
  }

  // Attach intent alias likely files.
  const intentRows = Array.isArray(aliases?.intents)
    ? aliases.intents
    : Array.isArray(aliases)
      ? aliases
      : [];

  for (const intent of intentRows) {
    const likely = intent.likely_files || [];
    const feature_id =
      intent.feature_id ||
      String(intent.feature_label || intent.intent || 'intent_alias')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
    const feature_label = intent.feature_label || labelFromFeatureId(feature_id);
    const domain = intent.domain || 'implementation_intent';

    if (!byFeature.has(feature_id)) {
      byFeature.set(feature_id, {
        packet_kind: 'feature_dependency_group',
        packet_key: `feature_group:${sha16(feature_id)}`,
        feature_id,
        feature_label,
        domain,
        root_files: [],
        dependency_files: [],
        test_files: [],
        route_files: [],
        rpc_methods: [],
        tool_names: [],
        packet_keys: [],
        qdrant_point_ids: [],
        neo4j_nodes: [],
        redis_keys: [`feature:deps:${feature_id}`],
        kanban_tasks: [],
        confidence: 0,
      });
    }

    const g = byFeature.get(feature_id);
    g.root_files.push(...likely.filter(isAllowedFile));
    g.tool_names.push(...(intent.aliases || []));
  }

  const groups = [...byFeature.values()].map((g) => {
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
    if (g.root_files.length) score += 0.3;
    if (g.dependency_files.length) score += 0.15;
    if (g.test_files.length) score += 0.1;
    if (g.route_files.length) score += 0.1;
    if (g.tool_names.length) score += 0.1;
    g.confidence = Math.min(1, Number(score.toFixed(3)));

    return g;
  });

  return groups
    .filter((g) => g.feature_id || g.feature_label)
    .filter((g) => g.root_files.length || g.packet_keys.length)
    .sort((a, b) => b.confidence - a.confidence);
}

function validate(groups) {
  const seen = new Set();
  const failures = [];
  const warnings = [];

  for (const g of groups) {
    if (!g.feature_id && !g.feature_label)
      failures.push(`missing feature identity: ${g.packet_key}`);
    if (!g.root_files.length && !g.packet_keys.length)
      failures.push(`empty group: ${g.packet_key}`);
    if (seen.has(g.packet_key)) failures.push(`duplicate packet_key: ${g.packet_key}`);
    seen.add(g.packet_key);

    const bad = [...g.root_files, ...g.dependency_files, ...g.test_files, ...g.route_files].filter(
      (f) => !isAllowedFile(f)
    );
    if (bad.length)
      failures.push(`excluded paths in ${g.packet_key}: ${bad.slice(0, 3).join(', ')}`);

    if (g.confidence < 0.5) warnings.push(`low confidence ${g.confidence}: ${g.feature_label}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    gates: {
      groups_total: groups.length,
      duplicate_packet_keys: failures.filter((f) => f.includes('duplicate')).length,
      low_confidence: warnings.length,
    },
  };
}

function writeReports(groups, validation) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const report = {
    ok: validation.ok,
    generated_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    apply: APPLY,
    inputs: Object.fromEntries(
      Object.entries(INPUTS).map(([k, v]) => [k, { path: v, exists: exists(v) }])
    ),
    validation,
    groups,
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
    ...groups
      .slice(0, 25)
      .map(
        (g) =>
          `- **${g.feature_label}** (${g.feature_id}) — confidence ${g.confidence}, root ${g.root_files.length}, deps ${g.dependency_files.length}, routes ${g.route_files.length}`
      ),
    '',
    '## Warnings',
    '',
    ...(validation.warnings.length
      ? validation.warnings.slice(0, 50).map((w) => `- ${w}`)
      : ['- none']),
    '',
    '## Failures',
    '',
    ...(validation.failures.length ? validation.failures.map((f) => `- ${f}`) : ['- none']),
    '',
  ].join('\n');

  fs.writeFileSync(MD_REPORT, md);
  return report;
}

async function applyToPostgres(groups) {
  let pg;
  try {
    const mod = await import('pg');
    pg = mod.default || mod;
  } catch {
    console.warn('[warn] pg package unavailable; skipping Postgres apply');
    return { postgres: 'skipped_pg_missing', count: 0 };
  }

  const connectionString = process.env.DATABASE_URL;
  const client = connectionString
    ? new pg.Client({ connectionString })
    : new pg.Client({
        host: process.env.POSTGRES_HOST || '127.0.0.1',
        port: Number(process.env.POSTGRES_PORT || 5434),
        database: process.env.POSTGRES_DB || 'legal_ai_db',
        user: process.env.POSTGRES_USER || 'legal_admin',
        password: process.env.POSTGRES_PASSWORD || 'legal',
      });

  await client.connect();
  let count = 0;

  for (const g of groups) {
    const payload = {
      ...g,
      metadata: {
        path: `feature-groups/${g.feature_id}.json`,
        hash: `sha256:${sha16(JSON.stringify(g))}`,
        indexed_at: new Date().toISOString(),
      },
    };

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
        `feature-group:${g.feature_id}`,
        g.feature_id,
        null,
        `Feature dependency group for ${g.feature_label}: ${g.root_files.length} root files, ${g.dependency_files.length} dependency files.`,
        JSON.stringify(payload),
        'feature_dependency_group',
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
  const report = writeReports(groups, validation);

  console.log(`Feature dependency groups: ${groups.length}`);
  console.log(`Report: ${path.relative(ROOT, JSON_REPORT)}`);
  console.log(`Gate: ${validation.ok ? 'PASS' : 'FAIL'}`);

  if (validation.warnings.length) {
    console.log(`Warnings: ${validation.warnings.length}`);
  }

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
