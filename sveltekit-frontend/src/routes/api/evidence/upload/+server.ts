import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { uploadFile } from '$lib/server/minio-client';
import db from '$lib/server/db';
import { evidence, evidenceVectors } from '$lib/server/db/schema';
import { createJob, updateJob } from '$lib/server/evidence-progress';

const BUCKET = process.env.MINIO_EVIDENCE_BUCKET ?? 'legal-evidence';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * POST /api/evidence/upload
 * Real upload pipeline: MinIO → PostgreSQL → Ollama embeddings
 */
export async function POST({ request }: RequestEvent) {
	const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const caseId = formData.get('caseId')?.toString() || null;
		const title = formData.get('title')?.toString() || '';
		const description = formData.get('description')?.toString() || null;
		const evidenceType = (formData.get('evidenceType')?.toString() || 'UNKNOWN').toUpperCase();

		if (!file || typeof file.arrayBuffer !== 'function') {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE) {
			return json({ error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` }, { status: 400 });
		}

		// Register job for progress tracking
		createJob(jobId);
		updateJob(jobId, { step: 'uploading', progress: 10, message: `Uploading ${file.name}...` });

		// 1. Read file into buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 2. Compute SHA-256 hash
		updateJob(jobId, { step: 'hashing', progress: 20, message: 'Computing file hash...' });
		const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

		// 3. Upload to MinIO
		updateJob(jobId, { step: 'storing', progress: 30, message: 'Storing in MinIO...' });
		const ext = file.name.split('.').pop() ?? 'bin';
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const objectKey = `evidence/${caseId ?? 'default'}/${timestamp}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

		await uploadFile(BUCKET, objectKey, buffer, {
			'Content-Type': file.type || 'application/octet-stream',
			'X-Evidence-Hash': fileHash,
		});

		const minioUrl = `minio://${BUCKET}/${objectKey}`;

		// 4. Insert into PostgreSQL
		updateJob(jobId, { step: 'db-insert', progress: 50, message: 'Saving to database...' });

		const [inserted] = await db
			.insert(evidence)
			.values({
				caseId: caseId,
				title: title || file.name,
				description: description,
				filePath: minioUrl,
				fileType: file.type,
				fileSize: file.size,
				hash: `sha256:${fileHash}`,
				source: 'upload',
				dateObtained: new Date(),
				metadata: {
					kind: evidenceType,
					uploadedAt: new Date().toISOString(),
					fileSize: file.size,
					minioKey: objectKey,
					minioBucket: BUCKET,
				},
				evidenceType: evidenceType as any,
				fileUrl: minioUrl,
				fileName: file.name,
				uploadedAt: new Date().toISOString(),
				canvasPosition: {},
			})
			.returning();

		const evidenceId = inserted.id;
		updateJob(jobId, { evidenceId, step: 'db-insert', progress: 60, message: 'Database record created' });

		// 5. Fire off embedding generation (non-blocking)
		generateEmbedding(jobId, evidenceId, file.name, buffer).catch((err) => {
			console.error('[Upload] Background embedding failed:', err);
			updateJob(jobId, { step: 'error', progress: 60, message: 'Embedding generation failed (upload succeeded)', error: String(err) });
		});

		return json({
			id: evidenceId,
			jobId,
			status: 'uploaded',
			fileName: file.name,
			minioKey: objectKey,
			hash: fileHash,
		}, { status: 201 });

	} catch (err) {
		console.error('[Upload] Pipeline error:', err);
		updateJob(jobId, { step: 'error', progress: 0, message: 'Upload failed', error: String(err) });
		return json({ error: 'Upload failed', jobId }, { status: 500 });
	}
}

/**
 * Background embedding generation — runs after the upload response is sent.
 */
async function generateEmbedding(jobId: string, evidenceId: string, fileName: string, buffer: Buffer): Promise<void> {
	updateJob(jobId, { step: 'embedding', progress: 70, message: 'Generating embeddings...' });

	// Extract text for embedding (use first 50KB for PDFs/text, filename for images)
	let textForEmbedding: string;
	const isTextBased = fileName.match(/\.(pdf|txt|md|docx|html|csv|json)$/i);

	if (isTextBased) {
		// Use raw text content (good enough for txt/md/csv — PDF would need OCR for full extraction)
		textForEmbedding = buffer.toString('utf-8').slice(0, 50_000);
	} else {
		// For images/video/audio, embed the filename + metadata
		textForEmbedding = `Evidence file: ${fileName}`;
	}

	if (!textForEmbedding.trim()) {
		updateJob(jobId, { step: 'complete', progress: 100, message: 'Upload complete (no text to embed)' });
		return;
	}

	try {
		// Call Ollama directly (avoid HTTP round-trip through own API)
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: textForEmbedding }),
		});

		if (!response.ok) {
			// Try fallback model
			const fallback = await fetch(`${OLLAMA_URL}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'nomic-embed-text:latest', prompt: textForEmbedding }),
			});

			if (!fallback.ok) {
				throw new Error(`Ollama embedding failed: ${response.status}`);
			}

			const data = await fallback.json();
			await storeVector(evidenceId, data.embedding, 'nomic-embed-text:latest');
		} else {
			const data = await response.json();
			await storeVector(evidenceId, data.embedding, 'embeddinggemma:latest');
		}

		updateJob(jobId, { step: 'complete', progress: 100, message: 'Upload and embedding complete' });
	} catch (err) {
		console.warn('[Upload] Embedding failed (non-critical):', err);
		updateJob(jobId, { step: 'complete', progress: 100, message: 'Upload complete (embedding unavailable)' });
	}
}

async function storeVector(evidenceId: string, vector: number[], model: string): Promise<void> {
	await db.insert(evidenceVectors).values({
		evidenceId,
		vector: JSON.stringify(vector),
		model,
	});
}
