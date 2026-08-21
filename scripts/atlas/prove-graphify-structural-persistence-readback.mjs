import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { loadRuntimeEnv } from '../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });
loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });

const reportPath = path.join(process.cwd(), 'docs', 'reports', 'graphify-structural-persistence-readback-proof.json');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const report = {
  schema: 'atlas.graphify.structural.persistence.readback.v1',
  generatedAt: new Date().toISOString(),
  status: 'PERSISTENCE_OWNER_NOT_READY',
  persistenceOwner: 'PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER',
  canonicalTable: 'atlas_evidence',
  tableExists: false,
  requiredColumnsPresent: false,
  sourceRevisionNotNull: false,
  sourceRevisionIndexPresent: false,
  structuralRowCount: 0,
  suspiciousPseudoRevisionCount: 0,
  sampleEvidenceId: null,
  repositoryReadbackStatus: 'NOT_RUN',
  revisionOwnerProven: false,
  canonicalWriteAttempted: false,
  canonicalPersistenceAuthorized: false,
  diagnostics: [],
};

try {
  const table = await pool.query(`SELECT to_regclass('public.atlas_evidence') IS NOT NULL AS exists`);
  report.tableExists = Boolean(table.rows[0]?.exists);
  if (!report.tableExists) {
    report.status = 'PERSISTENCE_OWNER_NOT_READY';
  } else {
    const columns = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_evidence'
        AND column_name IN ('evidence_id', 'evidence_kind', 'source_ref', 'source_revision', 'evidence_revision', 'producer_revision', 'payload')
    `);
    const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
    const required = ['evidence_id', 'evidence_kind', 'source_ref', 'source_revision', 'evidence_revision', 'producer_revision', 'payload'];
    report.requiredColumnsPresent = required.every((name) => byName.has(name));
    report.sourceRevisionNotNull = byName.get('source_revision')?.is_nullable === 'NO';
    const indexes = await pool.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'atlas_evidence'
    `);
    report.sourceRevisionIndexPresent = indexes.rows.some((row) => /source_revision/i.test(String(row.indexdef)));
    if (report.requiredColumnsPresent) {
      const structural = await pool.query(`
        SELECT evidence_id, source_revision
        FROM public.atlas_evidence
        WHERE evidence_kind ILIKE '%structur%'
        ORDER BY evidence_id
        LIMIT 1000
      `);
      report.structuralRowCount = structural.rows.length;
      report.sampleEvidenceId = structural.rows[0]?.evidence_id ?? null;
      report.suspiciousPseudoRevisionCount = structural.rows.filter((row) => /^sha256:[0-9a-f]{64}$/i.test(String(row.source_revision ?? ''))).length;
    }
    report.status = report.suspiciousPseudoRevisionCount > 0
      ? 'PERSISTENCE_OWNER_IDENTIFIED_PSEUDOREVISION_DETECTED'
      : report.requiredColumnsPresent && report.sourceRevisionNotNull
        ? 'PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED'
        : 'PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED';
  }
} catch (error) {
  report.status = 'PERSISTENCE_OWNER_IDENTIFIED_READBACK_FAILED';
  report.diagnostics = [error instanceof Error ? error.message : String(error)];
} finally {
  await pool.end();
}

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(process.cwd(), reportPath), canonicalWriteAttempted: false }, null, 2));
