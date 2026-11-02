import { describe, expect, it } from 'vitest';
import { actions } from '../../../routes/(app)/evidence/+page.server.js';
import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { isSafeEvidenceUploadE2ESetup } from './evidence-upload-e2e-safety-v1.js';

const safeTarget = isSafeEvidenceUploadE2ESetup({
  e2eDatabaseUrl: process.env.EVIDENCE_E2E_DATABASE_URL,
  applicationDatabaseUrl: ENV.DATABASE_URL,
  e2eStorageEndpoint: process.env.EVIDENCE_E2E_STORAGE_ENDPOINT,
  applicationStorageEndpoint: ENV.SEAWEED_ENDPOINT ?? ENV.MINIO_ENDPOINT,
  applicationStoragePort: ENV.SEAWEED_S3_PORT ?? ENV.MINIO_PORT,
});
const describeSafeTarget = safeTarget ? describe : describe.skip;

describeSafeTarget('Isolated evidence upload and durable-queue smoke test', () => {
	  it('persists an authenticated upload and its normalized PostgreSQL 18 analysis job', async () => {
    const schemaPreflight = await pool.query(`
      SELECT current_setting('server_version_num')::integer AS server_version_num,
             EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_pgvector,
             (SELECT format_type(a.atttypid, a.atttypmod)
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'evidence_vectors'
                 AND a.attname = 'embedding' AND NOT a.attisdropped) AS embedding_type,
             EXISTS (
               SELECT 1
                 FROM pg_index x
                 JOIN pg_class t ON t.oid = x.indrelid
                 JOIN pg_namespace n ON n.oid = t.relnamespace
                 JOIN pg_class i ON i.oid = x.indexrelid
                WHERE n.nspname = 'public' AND t.relname = 'evidence_vectors'
                  AND i.relname = 'evidence_vectors_hnsw_idx'
                  AND x.indisvalid AND x.indisready AND x.indislive
             ) AS has_valid_hnsw
    `);
    const schema = schemaPreflight.rows[0];
    expect(schema.server_version_num).toBeGreaterThanOrEqual(180000);
    expect(schema.has_pgvector).toBe(true);
    expect(schema.embedding_type).toBe('vector(768)');
    expect(schema.has_valid_hnsw).toBe(true);

    const fileContent = 'EXHIBIT 104: Managing member fiduciary obligation agreement pursuant to California Corporations Code.';
    const file = new File([fileContent], 'fiduciary-exhibit-104.txt', { type: 'text/plain' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', 'Fiduciary Agreement Exhibit 104');
    formData.append('description', 'Authentic contractual agreement between managing partners.');

    const mockRequest = new Request('http://localhost/evidence?/upload', {
      method: 'POST',
      body: formData,
    });

    const mockLocals = {
      user: {
        id: 1,
        email: 'admin@legal-ai.local',
      },
    };

    // Execute the live server action
    const actionResult = await actions.upload({
      request: mockRequest,
      locals: mockLocals,
    } as never);

    expect(actionResult).toBeDefined();
    const result = actionResult as {
      success: boolean;
      evidence: { id: string; title: string; fileName: string; uploadedBy: number };
      jobId: string;
      previewUrl: string;
    };

    expect(result.success).toBe(true);
    expect(result.evidence).toBeDefined();
    expect(result.evidence.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.evidence.uploadedBy).toBe(1);
    expect(result.evidence.title).toBe('Fiduciary Agreement Exhibit 104');
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);

    const evidenceId = result.evidence.id;
    const jobId = result.jobId;

    try {
      // 1. Readback from PostgreSQL 18 evidence table
      const evidenceQuery = await pool.query(
        `SELECT id, title, file_name, file_url, uploaded_by, status FROM evidence WHERE id = $1`,
        [evidenceId]
      );
      expect(evidenceQuery.rows).toHaveLength(1);
      const evRow = evidenceQuery.rows[0];
      expect(evRow.title).toBe('Fiduciary Agreement Exhibit 104');
      expect(evRow.file_name).toBe('fiduciary-exhibit-104.txt');
      expect(evRow.uploaded_by).toBe(1);
      expect(evRow.status).toBe('processing_queued');
      expect(evRow.file_url).toContain(`evidence/1/`);

      // 2. Readback from PostgreSQL 18 analysis_jobs table
      const jobQuery = await pool.query(
        `SELECT id, evidence_id, job_type, status, progress, result FROM analysis_jobs WHERE id = $1`,
        [jobId]
      );
      expect(jobQuery.rows).toHaveLength(1);
      const jobRow = jobQuery.rows[0];
      expect(jobRow.evidence_id).toBe(evidenceId);
      expect(jobRow.job_type).toBe('upload_pipeline');
      expect(jobRow.status).toBe('queued');
      expect(jobRow.progress).toBe('0');

      // Verify PersistedPayloadEnvelope structure inside result
      const envelope = jobRow.result as Record<string, unknown>;
      expect(envelope.validatorTag).toBe('protocol/PersistedPayloadEnvelope@v1');
      expect(envelope.source).toBe('analysis_jobs');
      expect(envelope.lane).toBe('upload_pipeline');
      const payloadData = (envelope.payload ?? envelope) as Record<string, unknown>;
      expect(payloadData.uploadedBy).toBe(1);
      expect(payloadData.fileName).toBe('fiduciary-exhibit-104.txt');
    } finally {
      // Clean up test rows to preserve database hygiene
      await pool.query(`DELETE FROM analysis_jobs WHERE id = $1`, [jobId]);
      await pool.query(`DELETE FROM evidence WHERE id = $1`, [evidenceId]);
    }
  });
});
