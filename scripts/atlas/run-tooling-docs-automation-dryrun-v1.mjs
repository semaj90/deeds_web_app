#!/usr/bin/env node
/**
 * End-to-end read-only automation dry-run for TOOLING-DOCS + DOC-26 + SEMANTIC-DOC-01 + OAKLIB-WIRE-01.
 * Never mutates Postgres, Qdrant, Valkey, Neo4j, or Graphify.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const FRONTEND = resolve(ROOT, 'sveltekit-frontend');
const REPORT_PATH = resolve(ROOT, 'docs/reports/tooling-docs-e2e-automation-dryrun-v1.json');

function runCmd(cmd, args, cwd) {
  const stdout = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return stdout.trim();
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    return { raw: text };
  }
}

const requiredArtifacts = [
  'docs/.okf/dev/tooling-docs.manifest.json',
  'docs/.okf/dev/pinned-plus-tooling-docs.manifest.json',
  'docs/reports/doc-26-pinned-plus-tooling-delta-plan-v1.json',
  'docs/reports/doc-26-pinned-plus-tooling-plan-only-v1.json',
  'docs/.okf/dev/pinned-plus-tooling-tooling-docs.admission-envelopes-v2.json',
];

const artifactStatus = Object.fromEntries(
  requiredArtifacts.map((rel) => [rel, existsSync(resolve(ROOT, rel))]),
);

const planOnlyReceipt = existsSync(resolve(ROOT, 'docs/reports/doc-26-pinned-plus-tooling-plan-only-v1.json'))
  ? JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/doc-26-pinned-plus-tooling-plan-only-v1.json'), 'utf8'))
  : null;

const embedDryRunRaw = runCmd(
  process.platform === 'win32' ? 'cmd.exe' : 'npx',
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx tsx scripts/atlas/populate-external-doc-embeddings-v1.mts']
    : ['tsx', 'scripts/atlas/populate-external-doc-embeddings-v1.mts'],
  FRONTEND,
);
const embedDryRun = tryJson(embedDryRunRaw);

const composePath = resolve(ROOT, 'docker/miniforge-nlp-sidecar/docker-compose.yml');
const composeText = existsSync(composePath) ? readFileSync(composePath, 'utf8') : '';
const hasDefaultOakPassword = /POSTGRES_PASSWORD:-123456/.test(composeText);

const pgCountsRaw = runCmd(
  'C:\\Python313\\python.exe',
  [
    '-c',
    "import json, os, psycopg; from dotenv import load_dotenv; load_dotenv('sveltekit-frontend/.env'); conn=psycopg.connect(os.environ.get('DATABASE_URL','postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db')); cur=conn.cursor(); print(json.dumps({t: cur.execute('SELECT count(*) FROM public.'+t).fetchone()[0] for t in ('atlas_external_doc_pages','atlas_external_doc_chunks','atlas_ontology_concepts','atlas_ontology_relations')}))",
  ],
  ROOT,
);
const pgCounts = tryJson(pgCountsRaw);

const report = {
  schema: 'atlas.tooling-docs-e2e-automation-dryrun.v1',
  generatedAt: new Date().toISOString(),
  artifactsPresent: artifactStatus,
  postgresCounts: pgCounts,
  doc26PlanOnly: {
    present: planOnlyReceipt !== null,
    result: planOnlyReceipt?.result ?? null,
    safeToAdmit: planOnlyReceipt?.safeToAdmit ?? null,
  },
  semanticDoc01DryRun: embedDryRun,
  oaklibWire01Checks: {
    atlasOntologyConcepts: pgCounts.atlas_ontology_concepts ?? null,
    atlasOntologyRelations: pgCounts.atlas_ontology_relations ?? null,
    defaultPasswordInCompose: hasDefaultOakPassword,
  },
  operatorGatedNextSteps: [
    {
      step: 'TOOLING-DOCS-ADMIT-01 / DOC-26-APPLY',
      envRequired: 'ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED=I_AUTHORIZE_DOC_VERSIONED_RECRAWL',
      command:
        'cd sveltekit-frontend && npx tsx scripts/atlas/run-external-doc-versioned-recrawl-v2.mts --delta-plan ../docs/reports/doc-26-pinned-plus-tooling-delta-plan-v1.json --prior-envelopes ../docs/.okf/dev/pinned-plus-tooling-tooling-docs.admission-envelopes-v2.json --current-envelopes ../docs/.okf/dev/pinned-plus-tooling-tooling-docs.admission-envelopes-v2.json --apply',
    },
    {
      step: 'TOOLING-DOCS-EMBED-01',
      envRequired: 'ATLAS_DOC_EMBED_AUTHORIZED=I_AUTHORIZE_SEMANTIC_DOC_01 (plus executor parity receipt for selected executor)',
      command: 'cd sveltekit-frontend && npx tsx scripts/atlas/populate-external-doc-embeddings-v1.mts --apply',
    },
  ],
  canonicalAuthority: false,
  writesPerformed: false,
};

mkdirSync(resolve(ROOT, 'docs/reports'), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  allArtifactsPresent: Object.values(artifactStatus).every(Boolean),
  postgresCounts: report.postgresCounts,
  doc26PlanOnlyResult: report.doc26PlanOnly.result,
  embedDryRunResult: report.semanticDoc01DryRun.result,
  embedExecutor: report.semanticDoc01DryRun.executor,
  oaklibDefaultPasswordInCompose: hasDefaultOakPassword,
  reportPath: 'docs/reports/tooling-docs-e2e-automation-dryrun-v1.json',
}, null, 2));
