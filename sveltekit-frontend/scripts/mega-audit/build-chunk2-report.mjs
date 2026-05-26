#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AUDIT_DIR = path.join(ROOT, '.tmp', 'mega-audit');

function readJson(relPath, fallback) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

const dep = readJson('.tmp/mega-audit/dependency-map.json', {});
const routeMap = readJson('.tmp/mega-audit/route-service-map.json', []);
const storage = readJson('.tmp/mega-audit/storage-touchpoints.json', []);
const feature = readJson('.tmp/mega-audit/feature-labels.json', []);
const routeSchemaTests = readJson('.tmp/mega-audit/route-schema-test-map.json', {
  totalRoutes: 0,
  routeWithSchemaRefs: 0,
  routeWithTests: 0,
  schemaTablesReferencedByApiRoutes: [],
  routes: [],
});

const chunk2Report = {
  generatedAt: new Date().toISOString(),
  questions: {
    routes_call_services: routeMap,
    services_touch_storage: storage,
    files_bypass_bifrost_or_direct_llm: dep.directLlmPaths ?? [],
    schema_tables_referenced_by_api_routes:
      routeSchemaTests.schemaTablesReferencedByApiRoutes ?? dep.schemaRefs ?? [],
    feature_labels_code_vs_docs: feature,
    tests_cover_each_route_service: {
      note: 'Enhanced with route-schema-test-map linkage for explicit route-level test references.',
      routeCount: routeSchemaTests.totalRoutes ?? routeMap.length,
      routesWithTests: routeSchemaTests.routeWithTests ?? 0,
      routesWithSchemaRefs: routeSchemaTests.routeWithSchemaRefs ?? 0,
      routeCoverageMap: routeSchemaTests.routes ?? [],
      coverageHint: dep.notes ?? [],
    },
  },
  warnings: {
    conceptual_tools: [
      { name: 'attention_rank_files', status: 'contract-only', production: false, callable: false },
      { name: 'som_topology_stats', status: 'contract-only', production: false, callable: false },
      { name: 'language_distribution', status: 'contract-only', production: false, callable: false },
      { name: 'playbook_lookup_by_language', status: 'contract-only', production: false, callable: false },
    ],
  },
};

fs.mkdirSync(AUDIT_DIR, { recursive: true });
const outFile = path.join(AUDIT_DIR, 'chunk2-report.json');
fs.writeFileSync(outFile, JSON.stringify(chunk2Report, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      file: '.tmp/mega-audit/chunk2-report.json',
      routeCount: chunk2Report.questions.tests_cover_each_route_service.routeCount,
      routesWithTests: chunk2Report.questions.tests_cover_each_route_service.routesWithTests,
      routesWithSchemaRefs: chunk2Report.questions.tests_cover_each_route_service.routesWithSchemaRefs,
      schemaTables: chunk2Report.questions.schema_tables_referenced_by_api_routes.length,
    },
    null,
    2
  )
);
