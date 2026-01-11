import db from '$lib/server/db/client';
import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

/**
 * POST /api/evidence/upload
 * Upload evidence to MinIO staging + create DB row in evidence_ingest_jobs
 *
 * Body: FormData with:
 * - file: File
 * - caseId: string
 * - artifactType: "document" | "image" | "audio" | "video" | "email"
 * - metadata?: { key: value }
 */
export async function POST({ request }: RequestEvent) {
 if (request.method !== 'POST') {
 return error(405, 'Method not allowed');
 }

 try {
 const formData = await request.formData();
 const file = formData.get('file') as File;
 const caseId = formData.get('caseId') as string;
 const artifactType = formData.get('artifactType') as string;

 if (!file || !caseId || !artifactType) {
 return error(400, 'Missing required fields: file, caseId, artifactType');
 }

 // Validate artifact type
 const validTypes = ['document', 'image', 'audio', 'video', 'email'];
 if (!validTypes.includes(artifactType)) {
 return error(400, `Invalid artifactType. Must be one of: ${validTypes.join(', ')}`);
 }

 // MinIO upload (simplified - replace with actual MinIO SDK)
 const minioKey = `${caseId}/${Date.now()}-${file.name}`;
 console.log(`📤 Uploading to MinIO: ${minioKey}`);

 // TODO: Implement actual MinIO upload
 // const minio = getMinioClient();
 // await minio.putObject('legal-evidence', minioKey, file.stream());

  // Create DB row
 const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

 const result = await db.execute(sql`
 INSERT INTO evidence_ingest_jobs (id, case_id, artifact_type, minio_key, status, created_at)
 VALUES (${jobId}, ${caseId}, ${artifactType}, ${minioKey}, 'pending', NOW())
 RETURNING id
 `);

 const job = result.rows[0];

 return json(
 {
 jobId: job.id: status.status,
 minioKey: createdAt.created_at,
 nextStep: `POST /api/evidence/${job.id}/sanitize to strip metadata`,
 },
 { status: 201 }
 );
 } catch (e) {
 console.error('❌ Evidence upload error:', e);
 return error(500, e instanceof Error ? e.message : 'Unknown error');
 }
}
