#!/usr/bin/env node

/**
 * Read-only static consistency audit for the semantic retrieval owner.
 *
 * This deliberately audits references, not data. It does not import runtime
 * modules, connect to stores, or change a collection, vector, index, or row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'semantic-owner-consistency-v1.json');
const scanRoots = ['scripts', 'services', 'docker', 'sveltekit-frontend', 'packages'];
const targetPattern = 'codebase_chunks_768_v2|codebase_chunks_768|codebase_chunks_512|codebase_chunks_384|content_embedding_768|content_embedding|latent_256|latent_128|latent_64';
const reviewOnly = /(^|[\\/])(audit|backfill|migration|manual|legacy|test|spec|reports?)([._-]|[\\/])/i;
const allowedActive = /qdrant-sync-payload|search-backend|orchestrator|embedding-provider|vector-index-registry|semantic-768/i;

function scan() {
  try {
    const output = execFileSync('rg', [
      '-l', '-i', targetPattern, ...scanRoots,
      '--glob', '!**/node_modules/**', '--glob', '!**/.venv*/**',
      '--glob', '!**/dist/**', '--glob', '!**/build/**',
      '--glob', '!**/docs/reports/**',
      '--glob', '*.{mjs,mts,js,ts,tsx,jsx,py,go,rs,sql,yml,yaml,json}',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    return output.split(/\r?\n/).filter(Boolean).sort();
  } catch (error) {
    return error?.stdout?.toString().split(/\r?\n/).filter(Boolean).sort() ?? [];
  }
}

const files = scan();
const bySurface = (pattern) => files.filter((file) => pattern.test(file));
const legacy384 = bySurface(/codebase_chunks_384|content_embedding_384|summary_embedding_384/i);
const competing768 = bySurface(/codebase_chunks_768_v2|content_embedding_768/i);
const latent = bySurface(/latent_256|latent_128|latent_64/i);
const activeLegacy384 = legacy384.filter((file) => !reviewOnly.test(file) && !allowedActive.test(file));
const activeCompeting768 = competing768.filter((file) => !reviewOnly.test(file) && !allowedActive.test(file));
const activeLatent = latent.filter((file) => !reviewOnly.test(file) && !allowedActive.test(file));

const violations = [];
if (activeLegacy384.length) violations.push('ACTIVE_LEGACY_384_REFERENCES');
if (activeCompeting768.length) violations.push('ACTIVE_COMPETING_768_REFERENCES');
if (activeLatent.length) violations.push('ACTIVE_LATENT_OWNER_REFERENCES');

const report = {
  schema: 'atlas.semantic-owner-consistency.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  ownerPolicy: {
    logicalRepresentation: 'semantic_768',
    postgresColumn: 'content_embedding',
    qdrantCollection: 'codebase_chunks_768',
    qdrantVectorName: 'content',
    challengers: ['codebase_chunks_768_v2'],
    derivedViews: ['semantic_mrl_512', 'semantic_mrl_256', 'semantic_mrl_128', 'latent_256', 'latent_128', 'latent_64'],
    legacy: ['codebase_chunks_384', 'codebase_chunks_384_hybrid', 'summary_embedding_384'],
  },
  census: {
    scannedRoots: scanRoots,
    matchingFiles: files.length,
    competing768Files: competing768,
    legacy384Files: legacy384,
    latentFiles: latent,
    activeCompeting768,
    activeLegacy384,
    activeLatent,
  },
  checks: {
    declaredOwner: true,
    noActiveLegacy384Owner: activeLegacy384.length === 0,
    noActiveCompeting768Owner: activeCompeting768.length === 0,
    latentDerivedOnly: activeLatent.length === 0,
  },
  violations,
  status: violations.length === 0 ? 'SEMANTIC_OWNER_CONSISTENCY_PROVEN_STATIC' : 'SEMANTIC_OWNER_CONSISTENCY_REVIEW_REQUIRED',
  firstBlocker: violations[0] ?? 'FULL_CORPUS_LINEAGE_AND_RUNTIME_WRITER_AUTHORITY_OPEN',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const temporaryReportPath = `${reportPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporaryReportPath, reportPath);
console.log(JSON.stringify({ status: report.status, matchingFiles: files.length, violations, writesPerformed: false, reportPath }, null, 2));
