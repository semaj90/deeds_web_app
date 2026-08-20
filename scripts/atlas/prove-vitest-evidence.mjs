#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const PACKAGE = path.join(ROOT, 'packages', 'parent-atlas');
const GENERATE = process.argv.includes('--generate');
const APPLY = process.argv.includes('--apply');
const ALLOW_CREATE = process.argv.includes('--allow-create-tests');
const DATABASE_URL = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL || '';
if (APPLY && !DATABASE_URL) { console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required with --apply'); process.exit(2); }
if (ALLOW_CREATE && !APPLY) { console.error('--allow-create-tests requires --apply'); process.exit(2); }

function arg(name, fallback) { const item = process.argv.find((v) => v.startsWith(`${name}=`)); return item ? item.slice(name.length + 1) : fallback; }
function gitHead() { try { return execFileSync('git', ['rev-parse','HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown-source-revision'; } }

const sourceRevision = arg('--source-revision', gitHead());
const runRevision = arg('--run-revision', `vitest:${Date.now()}`);
const registryRevision = arg('--registry-revision', runRevision);
const workspaceRevision = arg('--workspace-revision', sourceRevision);
const producerRevision = arg('--producer-revision', 'vitest-proof-r1');
const reportPath = path.resolve(ROOT, arg('--report', `.atlas/proof/vitest/${runRevision.replace(/[^a-zA-Z0-9_.-]+/g,'_')}.json`));

execFileSync(process.execPath, [path.join(ROOT,'node_modules','typescript','bin','tsc'), '-p', path.join(PACKAGE,'tsconfig.json')], { stdio:'inherit', cwd:ROOT });
if (GENERATE) {
  await mkdir(path.dirname(reportPath), { recursive:true });
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['vitest','run','--reporter=json',`--outputFile=${reportPath}`], { cwd:FRONTEND, stdio:'inherit' });
}
const report = JSON.parse(await readFile(reportPath,'utf8'));
const atlas = await import(pathToFileURL(path.join(PACKAGE,'dist','index.js')).href);
const materializers = await import(pathToFileURL(path.join(PACKAGE,'dist','core','canonical-evidence-materializers.js')).href);
const compiled = atlas.compileVitestJsonReport({ report, source_revision:sourceRevision, run_revision:runRevision, producer_revision:producerRevision, repo_root:ROOT });

const receipt = {
  schema:'atlas.vitest-evidence-proof.v1',
  generated_at:new Date().toISOString(),
  report_path:path.relative(ROOT,reportPath).replaceAll('\\','/'),
  generate_requested:GENERATE,
  apply_requested:APPLY,
  allow_create_tests:ALLOW_CREATE,
  compiler_receipt:compiled.receipt,
  canonical:0, ambiguous:0, unresolved:0, created:0, materialized:0,
  rows:[],
};

if (!APPLY) {
  receipt.unresolved = compiled.nominations.length;
  receipt.rows = compiled.nominations.map((nomination,index)=>({ nomination, execution:compiled.executions[index], status:'NOT_RESOLVED_DRY_RUN' }));
  receipt.status='COMPILED_UNAPPLIED';
  console.log(JSON.stringify(receipt,null,2));
  process.exit(0);
}

const pool = new Pool({ connectionString:DATABASE_URL, max:2 });
try {
  const registry = atlas.createTestCaseRegistryRepository(pool);
  for (let index=0; index<compiled.nominations.length; index+=1) {
    const nomination = compiled.nominations[index];
    const execution = compiled.executions[index];
    let resolution = await registry.resolveNomination({ nomination, registry_revision:registryRevision });
    let created=false;
    if (resolution.status==='unresolved' && ALLOW_CREATE) {
      const promoted = await registry.promoteNomination({ nomination, registry_revision:registryRevision, producer_revision:producerRevision, allow_create:true, evidence_refs:[`vitest-report:${compiled.receipt.report_checksum}`] });
      resolution=promoted.resolution; created=true; receipt.created+=1;
    }
    receipt[resolution.status]+=1;
    if (resolution.status==='canonical') {
      const result = await materializers.materializeCanonicalTestExecution(pool,{ nomination,resolution,execution,workspace_revision:workspaceRevision,producer_revision:producerRevision });
      receipt.materialized+=1;
      receipt.rows.push({ nomination_id:nomination.nomination_id, stable_test_id:resolution.stable_test_id, created, execution_receipt_id:result.execution_receipt_id, evidence_id:result.evidence_id, fact_count:result.fact_count });
    } else {
      receipt.rows.push({ nomination_id:nomination.nomination_id, created:false, resolution, warning:'Apply reviewed rename/move alias before using --allow-create-tests for an existing logical test.' });
    }
  }
  receipt.status = receipt.ambiguous===0 && receipt.unresolved===0 ? 'OBSERVED' : 'REVIEW_REQUIRED';
  console.log(JSON.stringify(receipt,null,2));
  if (receipt.status==='REVIEW_REQUIRED') process.exitCode=2;
} finally { await pool.end(); }
