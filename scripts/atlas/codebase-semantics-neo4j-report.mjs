#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, readJson, readText, resolveRepoPath, parentAtlasMarkdown, topEntries } from './_atlas-utils.mjs';

const config = loadConfig();

const ROUTE_ATLAS_PATH = resolveRepoPath('docs/graph/repo-sveltekit-route-atlas.json');
const IMPORT_MAP_PATH = resolveRepoPath('docs/graph/repo-import-map.json');
const REPORTS_DIR = resolveRepoPath('docs/reports');
const GRAPH_DIR = resolveRepoPath('docs/graph');

const ARGS = new Set(process.argv.slice(2));
const JSON_ONLY = ARGS.has('--json');

const LABEL_RULES = [
  { key: 'api-route', patterns: ['route', 'api', 'endpoint', '+server.ts', 'server'] },
  { key: 'ui-component', patterns: ['svelte', 'component', 'page', 'view', 'screen'] },
  { key: 'svelte-inspector', patterns: ['inspector', 'inspecter', 'memory-inspector', 'route-inspector'] },
  { key: 'svelte-realtime', patterns: ['realtime', 'real-time', 'sse', 'streaming', 'progress-stream'] },
  { key: 'evidence', patterns: ['evidence', 'document', 'citation', 'case', 'pdf'] },
  { key: 'graph', patterns: ['graph', 'neo4j', 'topology', 'cluster', 'gds', 'hypergraph'] },
  { key: 'database', patterns: ['db', 'sql', 'drizzle', 'postgres', 'jsonb', 'schema'] },
  { key: 'retrieval', patterns: ['search', 'retrieval', 'rag', 'semantic', 'qdrant', 'embed'] },
  { key: 'agent', patterns: ['mcp', 'agent', 'workflow', 'tool', 'orchestrate'] },
  { key: 'cache', patterns: ['redis', 'cache', 'prompt-cache', 'semantic-cache'] },
  { key: 'symbol', patterns: ['symbol', 'function', 'method', 'class', 'ast'] },
];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-/+.]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function classifyLabel(routePath, imports = [], fileText = '') {
  const haystack = normalize([routePath, ...imports, fileText].join(' '));
  if (haystack.includes('memory-inspector') || haystack.includes('/admin/atlas')) return 'svelte-inspector';
  if (haystack.includes('/evidence/realtime') || haystack.includes('realtime') || haystack.includes('sse')) return 'svelte-realtime';
  for (const rule of LABEL_RULES) {
    if (rule.patterns.some((pattern) => haystack.includes(normalize(pattern)))) return rule.key;
  }
  return 'general';
}

function dynamicImportCount(text) {
  const matches = text.match(/\bimport\s*\(\s*['"`][^'"`]+['"`]\s*\)/g);
  return matches ? matches.length : 0;
}

function extractDynamicImports(text) {
  return [...String(text ?? '').matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function routeFiles(route) {
  const files = route.files ?? {};
  return Object.values(files).filter(Boolean).map((file) => String(file));
}

function readRouteText(relPath) {
  const abs = resolveRepoPath(join('sveltekit-frontend', relPath));
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf8');
}

async function probeNeo4j(routes) {
  const neo4jFallbackPath = resolveRepoPath('sveltekit-frontend/node_modules/neo4j-driver/lib/index.js');
  const neo4jModule = await import('neo4j-driver').catch(async () => {
    if (existsSync(neo4jFallbackPath)) {
      return import(pathToFileURL(neo4jFallbackPath).href).catch(() => null);
    }
    return null;
  });
  const neo4j = neo4jModule?.default ?? neo4jModule;
  if (!neo4j?.driver) {
    return {
      available: false,
      orphanCount: null,
      orphanPaths: [],
      relationshipCount: null,
      notes: ['neo4j-driver unavailable'],
    };
  }

  const uri = process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASS || 'deeds123';
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const session = driver.session({ database: 'neo4j' });

  try {
    const orphanResult = await session.run(`
      MATCH (n:CodeArtifact)
      WHERE NOT (n)--()
      RETURN count(n) AS orphanCount, collect(n.path)[0..20] AS orphanPaths
    `);
    const relResult = await session.run(`
      MATCH (:CodeArtifact)-[r:IMPORTS]->(:CodeArtifact)
      RETURN count(r) AS relationshipCount
    `);

    return {
      available: true,
      orphanCount: Number(orphanResult.records[0]?.get('orphanCount') ?? 0),
      orphanPaths: (orphanResult.records[0]?.get('orphanPaths') ?? []).filter(Boolean),
      relationshipCount: Number(relResult.records[0]?.get('relationshipCount') ?? 0),
      notes: [],
    };
  } catch (err) {
    return {
      available: false,
      orphanCount: null,
      orphanPaths: [],
      relationshipCount: null,
      notes: [`neo4j query failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  } finally {
    await session.close().catch(() => {});
    await driver.close().catch(() => {});
  }
}

function buildReport(routes, importMap, neo4j) {
  const routeRows = [];
  const labelCounts = new Map();
  const statusCounts = new Map();
  const dynamicHeavyRoutes = [];
  const fallbackRoutes = [];
  const unlabeledRoutes = [];
  const featureConsolidation = new Map();
  const dependencyTargetMap = new Map();
  const staticDependencyTargetMap = new Map();
  const dynamicDependencyTargetMap = new Map();
  const labelRouteGroups = new Map();

  for (const route of routes) {
    const imports = route.imports ?? [];
    const texts = routeFiles(route).map(readRouteText).filter(Boolean);
    const dynamicCount = texts.reduce((sum, text) => sum + dynamicImportCount(text), 0);
    const label = classifyLabel(route.routePath, imports, texts.join('\n'));
    const status = route.status ?? 'UNKNOWN';
    const tests = route.tests ?? [];

    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);

    if (label === 'general') unlabeledRoutes.push(route.routePath);
    if (dynamicCount > 0) {
      dynamicHeavyRoutes.push({
        routePath: route.routePath,
        dynamicCount,
        imports: imports.length,
      });
    }

    if (!labelRouteGroups.has(label)) labelRouteGroups.set(label, []);
    labelRouteGroups.get(label).push(route.routePath);

    if ((route.failOpen || status !== 'SHIPPED') && tests.length === 0) {
      fallbackRoutes.push(route.routePath);
    }

    const consolidationKey = `${label}:${route.routePath.split('/').slice(0, 3).join('/')}`;
    if (!featureConsolidation.has(consolidationKey)) featureConsolidation.set(consolidationKey, []);
    featureConsolidation.get(consolidationKey).push(route.routePath);

    for (const dep of imports.filter((imp) => imp.startsWith('$lib/') || imp.startsWith('./') || imp.startsWith('../'))) {
      if (!dependencyTargetMap.has(dep)) dependencyTargetMap.set(dep, []);
      dependencyTargetMap.get(dep).push(route.routePath);
      if (!staticDependencyTargetMap.has(dep)) staticDependencyTargetMap.set(dep, []);
      staticDependencyTargetMap.get(dep).push(route.routePath);
    }

    for (const dep of [...new Set(texts.flatMap(extractDynamicImports))]) {
      if (!dynamicDependencyTargetMap.has(dep)) dynamicDependencyTargetMap.set(dep, []);
      dynamicDependencyTargetMap.get(dep).push(route.routePath);
    }

    routeRows.push({
      routePath: route.routePath,
      label,
      status,
      serverOnly: Boolean(route.serverOnly),
      authRequired: Boolean(route.authRequired),
      staticImports: imports.length,
      dynamicImports: dynamicCount,
      tests: tests.length,
      datastoreCount: (route.datastores ?? []).length,
      files: route.files ?? {},
    });
  }

  const consolidationCandidates = [...featureConsolidation.entries()]
    .map(([key, entries]) => ({ key, entries }))
    .filter(({ entries }) => entries.length >= 3)
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, 15);

  const appConsolidationCandidates = [...labelRouteGroups.entries()]
    .map(([label, entries]) => ({
      label,
      entries: [...new Set(entries)],
    }))
    .filter(({ entries }) => entries.length >= 2)
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, 10);

  const dependencyChainTargets = [...dependencyTargetMap.entries()]
    .map(([target, routesForTarget]) => ({
      target,
      routes: [...new Set(routesForTarget)],
      count: new Set(routesForTarget).size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const staticDependencyChains = [...staticDependencyTargetMap.entries()]
    .map(([target, routesForTarget]) => ({
      target,
      routes: [...new Set(routesForTarget)],
      count: new Set(routesForTarget).size,
      kind: 'static',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const dynamicDependencyChains = [...dynamicDependencyTargetMap.entries()]
    .map(([target, routesForTarget]) => ({
      target,
      routes: [...new Set(routesForTarget)],
      count: new Set(routesForTarget).size,
      kind: 'dynamic',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  const report = {
    generatedAt: new Date().toISOString(),
    repo: config.repoName,
    source: {
      routeAtlas: 'docs/graph/repo-sveltekit-route-atlas.json',
      importMap: 'docs/graph/repo-import-map.json',
      neo4j: neo4j.available ? 'live' : 'fallback',
      seaweedfs: 'handled by api/health, not mutated by this report',
    },
    stats: {
      routes: routes.length,
      shipped: routeRows.filter((r) => r.status === 'SHIPPED').length,
      failOpen: routeRows.filter((r) => r.status !== 'SHIPPED' || fallbackRoutes.includes(r.routePath)).length,
      unlabeled: unlabeledRoutes.length,
      dynamicHeavy: dynamicHeavyRoutes.length,
      importTargets: importMap?.topTargets?.length ?? 0,
    },
    byStatus: Object.fromEntries([...statusCounts.entries()].sort((a, b) => b[1] - a[1])),
    byLabel: Object.fromEntries([...labelCounts.entries()].sort((a, b) => b[1] - a[1])),
    neo4j: neo4j,
    unlabeledRoutes,
    fallbackRoutes,
    dynamicHeavyRoutes: dynamicHeavyRoutes.slice(0, 50),
    consolidationCandidates,
    appConsolidationCandidates,
    dependencyChainTargets,
    staticDependencyChains,
    dynamicDependencyChains,
    routeRows,
    recommendations: [],
  };

  const recs = [];
  if (neo4j.available && typeof neo4j.orphanCount === 'number' && neo4j.orphanCount > 0) {
    recs.push({
      priority: 'high',
      title: 'Project orphaned Neo4j nodes back into route/implementation edges',
      details: `${neo4j.orphanCount} CodeArtifact nodes have no relationships. This usually means the Neo4j projection is missing import edges or a subset of files was skipped.`,
      nextAction: 'Rerun atlas:neo4j:ingest with a workspace limit, then inspect orphan paths before writing more labels.',
      sourceRefs: [...new Set(neo4j.orphanPaths)].slice(0, 10),
    });
  }

  if (unlabeledRoutes.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Add feature labels for unlabeled routes',
      details: `${unlabeledRoutes.length} routes resolved to the general label. This weakens feature-path mapping and makes graph recommendations noisier.`,
      nextAction: 'Extend label heuristics or add explicit route labels for the largest unlabeled groups.',
      sourceRefs: unlabeledRoutes.slice(0, 10),
    });
  }

  if (dynamicHeavyRoutes.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Review dynamic-import heavy routes for consolidation',
      details: `${dynamicHeavyRoutes.length} routes use dynamic imports in their route files. These are candidates for loader/util extraction or feature-folder consolidation.`,
      nextAction: 'Move repeated dynamic import logic into shared server helpers, then keep route files thin.',
      sourceRefs: [...new Set(dynamicHeavyRoutes.map((row) => row.routePath))].slice(0, 10),
    });
  }

  if (appConsolidationCandidates.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Consolidate app-file families under label-aware buckets',
      details: `${appConsolidationCandidates.length} label groups have multiple app files that can be treated as one dependency family for feature mapping.`,
      nextAction: 'Use the label registry to cluster related app files, then keep dependency chains stable as the graph matures.',
      sourceRefs: appConsolidationCandidates.flatMap((group) => group.entries).slice(0, 10),
    });
  }

  const chainSignals = [...staticDependencyChains, ...dynamicDependencyChains].filter((row) =>
    row.target.includes('inspector') || row.target.includes('realtime') || row.target.includes('stream') || row.target.includes('svelte')
  );
  if (chainSignals.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Map static and dynamic dependency chains for label upgrades',
      details: `${chainSignals.length} shared dependency targets show up across inspector/realtime or Svelte-heavy routes. These are the edges to pin before graph analysis is promoted from audit to enforcement.`,
      nextAction: 'Keep shared imports and dynamic loading paths centralized so feature-label upgrades do not fan out across multiple files.',
      sourceRefs: chainSignals.slice(0, 10).flatMap((row) => row.routes),
    });
  }

  const inspectorRealtimeTargets = dependencyChainTargets.filter((row) =>
    row.target.includes('memory-inspector') || row.target.includes('realtime') || row.target.includes('api/evidence')
  );
  if (inspectorRealtimeTargets.length > 0) {
    recs.push({
      priority: 'medium',
      title: 'Map shared dependency chains for inspector and realtime lanes',
      details: `${inspectorRealtimeTargets.length} dependency targets are shared across the inspector/realtime surfaces and should be tracked as upgrade candidates.`,
      nextAction: 'Keep shared imports centralized so future svelte-inspector and svelte-realtime upgrades only touch one chain at a time.',
      sourceRefs: inspectorRealtimeTargets.slice(0, 10).map((row) => row.target),
    });
  }

  if (fallbackRoutes.length > 0) {
    recs.push({
      priority: 'low',
      title: 'Track fail-open routes separately from shipped routes',
      details: `${fallbackRoutes.length} routes are not fully shipped or explicitly fail-open. Keep them visible so they do not get folded into production-critical labels.`,
      nextAction: 'Annotate fallback routes in the route atlas and keep their Neo4j edges out of the core production path.',
      sourceRefs: [...new Set(fallbackRoutes)].slice(0, 10),
    });
  }

  report.recommendations = recs;
  return report;
}

function writeReports(report) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  mkdirSync(GRAPH_DIR, { recursive: true });

  const jsonPath = join(REPORTS_DIR, 'codebase-semantics-neo4j-report.json');
  const mdPath = join(REPORTS_DIR, 'codebase-semantics-neo4j-report.md');
  const graphPath = join(GRAPH_DIR, 'codebase-semantics-neo4j-report.json');

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const dependencyTargetNodes = [...new Map([
    ...(report.staticDependencyChains ?? []).map((row) => [row.target, row.kind]),
    ...(report.dynamicDependencyChains ?? []).map((row) => [row.target, row.kind]),
  ]).entries()].map(([target, kind]) => ({
    id: `import:${target}`,
    label: kind === 'dynamic' ? 'dynamic-import-target' : 'static-import-target',
    target,
    kind,
  }));
  const dependencyEdges = [
    ...(report.staticDependencyChains ?? []).flatMap((row) =>
      row.routes.map((routePath) => ({
        from: `route:${routePath}`,
        to: `import:${row.target}`,
        type: 'STATIC_IMPORTS',
      }))
    ),
    ...(report.dynamicDependencyChains ?? []).flatMap((row) =>
      row.routes.map((routePath) => ({
        from: `route:${routePath}`,
        to: `import:${row.target}`,
        type: 'DYNAMIC_IMPORTS',
      }))
    ),
  ];
  writeFileSync(graphPath, `${JSON.stringify({
    generatedAt: report.generatedAt,
    nodes: [
      ...report.routeRows.map((row) => ({
        id: `route:${row.routePath}`,
        label: row.label,
        status: row.status,
        dynamicImports: row.dynamicImports,
        staticImports: row.staticImports,
      })),
      ...dependencyTargetNodes,
    ],
    edges: report.consolidationCandidates.flatMap((group) =>
      group.entries.slice(1).map((routePath) => ({
        from: `route:${group.entries[0]}`,
        to: `route:${routePath}`,
        type: 'CONSOLIDATE_WITH',
      }))
    ).concat(dependencyEdges),
  }, null, 2)}\n`, 'utf8');

  const md = [
    '# Codebase Semantics and Neo4j Missing Links Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Routes: ${report.stats.routes}  |  Shipped: ${report.stats.shipped}  |  Fail-open: ${report.stats.failOpen}  |  Unlabeled: ${report.stats.unlabeled}  |  Dynamic-heavy: ${report.stats.dynamicHeavy}`,
    '',
    '## Top Labels',
    '',
    ...topEntries(new Map(Object.entries(report.byLabel)), 10).map(({ key, value }) => `- ${key}: ${value}`),
    '',
    '## Dependency Chains',
    '',
    ...report.staticDependencyChains.slice(0, 8).map((row) => `- static: ${row.target} (${row.count})`),
    ...report.dynamicDependencyChains.slice(0, 8).map((row) => `- dynamic: ${row.target} (${row.count})`),
    '',
    '## Recommendations',
    '',
    ...report.recommendations.flatMap((rec) => [
      `### ${rec.title}`,
      `- priority: ${rec.priority}`,
      `- details: ${rec.details}`,
      `- nextAction: ${rec.nextAction}`,
      rec.sourceRefs.length ? `- sourceRefs: ${rec.sourceRefs.map((ref) => `\`${ref}\``).join(', ')}` : '',
      '',
    ].filter(Boolean)),
  ].join('\n');

  writeFileSync(mdPath, md, 'utf8');
  return { jsonPath, mdPath, graphPath };
}

async function main() {
  const routeAtlas = readJson(ROUTE_ATLAS_PATH, null);
  if (!routeAtlas?.routes) {
    throw new Error(`Missing route atlas: ${ROUTE_ATLAS_PATH}`);
  }

  const importMap = readJson(IMPORT_MAP_PATH, null);
  const neo4j = await probeNeo4j(routeAtlas.routes);
  const report = buildReport(routeAtlas.routes, importMap, neo4j);

  if (!JSON_ONLY) {
    console.log(`Codebase semantics routes: ${report.stats.routes}`);
    console.log(`Neo4j: ${neo4j.available ? 'live' : 'fallback'}`);
    console.log(`Unlabeled routes: ${report.stats.unlabeled}`);
    console.log(`Dynamic-heavy routes: ${report.stats.dynamicHeavy}`);
  }

  const outputs = writeReports(report);
  if (JSON_ONLY) {
    console.log(JSON.stringify({ ...report, outputs }, null, 2));
  } else {
    console.log(`Reports written to ${outputs.jsonPath} and ${outputs.mdPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
