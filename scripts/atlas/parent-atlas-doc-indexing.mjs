#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const APP_REPO_ROOT = path.resolve(REPO_ROOT, 'sveltekit-frontend');

function resolveFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function main() {
  const e = loadRepoEnv(process.env);

  // App-generated reports (prioritize APP_REPO_ROOT)
  const appReports = {
    featureLineage: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'feature-lineage-report.json'),
    ]),
    runtimePacketDensity: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'runtime-packet-density-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'runtime-packet-density-report.json'),
    ]),
    hiddenPacketPathmap: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-report.json'),
    ]),
    hiddenPacketPathmapDuckdb: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-duckdb-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'hidden-packet-pathmap-duckdb-report.json'),
    ]),
    postgresContractMirrors: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'postgres-contract-mirrors-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'postgres-contract-mirrors-report.json'),
    ]),
    contextualTreeReadiness: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'contextual-tree-readiness-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'contextual-tree-readiness-report.json'),
    ]),
    liveServiceEnv: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'live-service-env-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'live-service-env-report.json'),
    ]),
    postgres18PromotionContract: resolveFirstExisting([
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'postgres18-promotion-contract-report.json'),
      path.join(REPO_ROOT, 'docs', 'reports', 'postgres18-promotion-contract-report.json'),
    ]),
  };

  // Docs/index-only reports (prioritize REPO_ROOT)
  const docsReports = {
    featureRegistry: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'atlas', 'feature-registry.json'),
      path.join(APP_REPO_ROOT, 'docs', 'atlas', 'feature-registry.json'),
    ]),
    featureGapRegistryBootstrap: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'feature-gap-registry-bootstrap-2026-05-25.json'),
      path.join(APP_REPO_ROOT, 'docs', 'feature-gap-registry-bootstrap-2026-05-25.json'),
    ]),
    repoDirtyTreeClassification: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'repo-dirty-tree-classification-2026-06-01.json'),
      path.join(APP_REPO_ROOT, 'docs', 'repo-dirty-tree-classification-2026-06-01.json'),
    ]),
    repoArchiveMovePlan: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'repo-archive-move-plan-2026-06-01.json'),
      path.join(APP_REPO_ROOT, 'docs', 'repo-archive-move-plan-2026-06-01.json'),
    ]),
    docFeatureCrosswalk: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'doc-feature-crosswalk-2026-06-01.json'),
      path.join(APP_REPO_ROOT, 'docs', 'doc-feature-crosswalk-2026-06-01.json'),
    ]),
    parentAtlasWorkstationTodo: resolveFirstExisting([
      path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-workstation-todo.md'),
      path.join(APP_REPO_ROOT, 'docs', 'reports', 'parent-atlas-workstation-todo.md'),
    ]),
  };

  console.log('--- Parent Atlas Document Indexing Paths ---');
  console.log('App-Generated Reports:');
  for (const [key, value] of Object.entries(appReports)) {
    console.log(`  ${key}: ${value ?? 'NOT FOUND'}`);
  }
  console.log('\nDocs/Index-Only Reports:');
  for (const [key, value] of Object.entries(docsReports)) {
    console.log(`  ${key}: ${value ?? 'NOT FOUND'}`);
  }
}

main().catch(console.error);
