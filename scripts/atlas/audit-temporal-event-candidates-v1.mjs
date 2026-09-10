#!/usr/bin/env node

/** Read-only compiler of temporal observation candidates from current ledgers. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-event-candidates-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 20000 });
const checksum = (value) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const report = { schema: 'atlas.temporal-event-candidates.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY', authority: false, writesPerformed: false, workspaceRevisionPolicy: 'NULL_ALLOWED_UNTIL_SNAPSHOT_TOURNAMENT_ADMISSION', candidates: [], summary: null, status: 'UNKNOWN' };
try {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='atlas_packets' ORDER BY ordinal_position`);
  const available = new Set(cols.rows.map((row) => row.column_name));
  const required = ['packet_key', 'source_ref', 'source_revision', 'workspace_revision'];
  const missing = required.filter((column) => !available.has(column));
  if (missing.length) {
    report.status = 'CANDIDATES_BLOCKED_SCHEMA';
    report.summary = { missingColumns: missing, candidateCount: 0, supersessionClaims: 0, authority: false };
  } else {
    const optional = available.has('representation_revision') ? ', representation_revision' : ', NULL::text AS representation_revision';
    const updated = available.has('updated_at') ? ', updated_at' : ', NULL::timestamptz AS updated_at';
    const result = await pool.query(`SELECT packet_key::text, source_ref::text, source_revision::text, workspace_revision::text${optional}${updated}
      FROM public.atlas_packets WHERE packet_key IS NOT NULL ORDER BY packet_key::text LIMIT 100000`);
    report.candidates = result.rows.map((row) => {
      const body = { eventType: 'OBSERVED', logicalCanonicalId: `packet:${row.packet_key}`, versionCanonicalId: `packet:${row.packet_key}:${row.source_revision ?? 'unbound'}`, priorVersionCanonicalId: undefined, workspaceRevision: row.workspace_revision ?? null, sourceRevision: row.source_revision ?? undefined, representationRevision: row.representation_revision ?? undefined, actor: 'GRAPHIFY', evidenceRefs: [`packet:${row.packet_key}`], occurredAt: row.updated_at?.toISOString?.() ?? report.generatedAt };
      return { ...body, eventId: `observation:${checksum(body).slice(0, 32)}`, eventChecksum: checksum(body) };
    });
    const uniqueLogical = new Set(report.candidates.map((row) => row.logicalCanonicalId));
    report.summary = { sourceRows: result.rowCount, candidateCount: report.candidates.length, logicalArtifactCount: uniqueLogical.size, revisionBoundCount: report.candidates.filter((row) => row.workspaceRevision).length, revisionUnboundCount: report.candidates.filter((row) => !row.workspaceRevision).length, supersessionClaims: 0, authority: false, boundedLimit: 100000 };
    report.status = 'OBSERVATION_CANDIDATES_COMPILED_NOT_ADMITTED';
  }
} catch (error) {
  report.status = 'CANDIDATES_UNAVAILABLE';
  report.databaseError = error instanceof Error ? error.message : String(error);
} finally { await pool.end(); }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, summary: report.summary, databaseError: report.databaseError ?? null, reportPath }, null, 2));
