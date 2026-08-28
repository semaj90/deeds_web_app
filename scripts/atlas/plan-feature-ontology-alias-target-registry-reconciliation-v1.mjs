#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-alias-target-registry-reconciliation-v1.json');
const text = (v) => String(v ?? '').trim();
const readJson = (file) => { try { return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch { return {}; } };
const pool = new pg.Pool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5434), database: process.env.DB_NAME || 'legal_ai_db', user: process.env.DB_USER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

async function main() {
  const approval = readJson('docs/reports/feature-ontology-explicit-alias-v1.json');
  const observation = readJson('docs/reports/workspace-source-binding-observation.json');
  const candidates = (approval.candidates ?? []).filter((row) => row.classification === 'EXPLICIT_ALIAS_REVIEW_READY');
  const refs = candidates.map((row) => text(row.canonicalSourceRef));
  const registry = await pool.query(`SELECT source_ref_key, repo_id, content_hash, commit_sha, corpus_version FROM public.atlas_source_refs WHERE source_ref_key = ANY($1::text[])`, [refs]);
  await pool.end();
  const observed = new Map((observation.bindings ?? []).map((row) => [text(row.sourceRef), row]));
  const rows = candidates.map((candidate) => {
    const target = text(candidate.canonicalSourceRef);
    const binding = observed.get(target);
    const matches = registry.rows.filter((row) => text(row.source_ref_key) === target);
    return { aliasSourceRef: candidate.aliasSourceRef, canonicalSourceRef: target, repoId: text(binding?.repositoryId || binding?.repoId) || null, sourceRefKey: target, sourceRevision: text(binding?.sourceRevision) || null, workspaceRevision: text(binding?.workspaceRevision) || text(observation.record?.workspaceRevision) || null, contentDigest: text(binding?.contentDigest) || null, byteLength: binding?.byteLength ?? null, commitSha: text(binding?.commitSha || binding?.commit) || null, registryMatchCount: matches.length, classification: matches.length === 0 && binding ? 'REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY' : matches.length === 1 ? 'ALREADY_REGISTERED' : matches.length > 1 ? 'REGISTRY_DUPLICATE' : 'OBSERVATION_MISSING' };
  });
  const report = { schema: 'atlas.feature-ontology-alias-target-registry-reconciliation.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PLAN', readOnly: true, postgresWrites: false, canonicalAuthorityChanged: false, aliasApprovalRequired: true, aliasSelectionChecksum: approval.selectionChecksum ?? null, workspaceRevision: observation.record?.workspaceRevision ?? null, counts: { selectedTargets: rows.length, registryInsertCandidates: rows.filter((row) => row.classification === 'REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY').length, alreadyRegistered: rows.filter((row) => row.classification === 'ALREADY_REGISTERED').length, observationMissing: rows.filter((row) => row.classification === 'OBSERVATION_MISSING').length, duplicates: rows.filter((row) => row.classification === 'REGISTRY_DUPLICATE').length }, rows, nextGate: rows.every((row) => row.classification === 'REGISTRY_INSERT_CANDIDATE_REVIEW_ONLY') ? 'EXPLICIT_AUTHORIZATION_REQUIRED_FOR_REGISTRY_INSERT' : 'RECONCILE_TARGET_CLASSIFICATIONS' };
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ schema: report.schema, status: report.nextGate, counts: report.counts, report: REPORT }, null, 2));
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[alias-target-registry-reconciliation] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
