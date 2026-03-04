import { db } from '$lib/server/db/client';
import { poiPhotos, personsOfInterest } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { uploadFile } from '$lib/server/minio-client';
import { createHash } from 'crypto';
import sharp from 'sharp';
import type { RequestHandler } from './$types';

const BUCKET = 'poi-photos';
const THUMB_BUCKET = 'poi-photos';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const VLM_MODEL = 'gemma3-legal:latest';
const EMBED_MODEL = 'embeddinggemma:latest';
const VLM_TIMEOUT = 60_000; // 60s for vision analysis

/**
 * GET /api/persons-of-interest/[id]/photos
 * List all photos for a POI (most recent first)
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const photos = await db
			.select()
			.from(poiPhotos)
			.where(eq(poiPhotos.poiId, params.id))
			.orderBy(desc(poiPhotos.uploadedAt));

		return json({ success: true, photos });
	} catch (err) {
		console.error('[poi-photos] GET error:', err);
		return json({ success: true, photos: [] });
	}
};

/**
 * POST /api/persons-of-interest/[id]/photos
 * Upload a photo for a POI — immediate response, background VLM analysis
 *
 * Pipeline:
 * 1. Validate + hash + upload original to MinIO
 * 2. Generate thumbnail via Sharp → upload to MinIO
 * 3. Insert DB record (returns immediately to client)
 * 4. Background: Gemma3 VLM analysis (caption + tags + forensics)
 * 5. Background: EmbeddingGemma → caption embedding → Qdrant
 * 6. Background: Auto-tag + mirror to stores
 * 7. Background: LangExtract OCR for any text in image
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const poiId = params.id;

	try {
		// Verify POI exists
		const [poi] = await db
			.select({ id: personsOfInterest.id, name: personsOfInterest.name })
			.from(personsOfInterest)
			.where(eq(personsOfInterest.id, poiId))
			.limit(1);

		if (!poi) {
			return json({ error: 'Person of interest not found' }, { status: 404 });
		}

		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file || !(file instanceof File)) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		if (!ALLOWED_TYPES.includes(file.type)) {
			return json(
				{ error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
				{ status: 400 }
			);
		}

		if (file.size > MAX_SIZE) {
			return json({ error: 'File too large. Max 10MB.' }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
		const ext = file.name.split('.').pop() || 'jpg';
		const minioKey = `${poiId}/${hash}.${ext}`;
		const thumbKey = `${poiId}/${hash}_thumb.webp`;

		// 1. Upload original to MinIO
		await uploadFile(BUCKET, minioKey, buffer, {
			'Content-Type': file.type,
			'X-POI-Id': poiId,
			'X-Original-Name': file.name,
		});

		const url = `/minio/${BUCKET}/${minioKey}`;

		// 2. Generate thumbnail via Sharp (300px wide, webp)
		let thumbnailUrl: string | null = null;
		try {
			const thumbBuffer = await sharp(buffer)
				.resize(300, 300, { fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 80 })
				.toBuffer();

			await uploadFile(THUMB_BUCKET, thumbKey, thumbBuffer, {
				'Content-Type': 'image/webp',
				'X-POI-Id': poiId,
			});
			thumbnailUrl = `/minio/${THUMB_BUCKET}/${thumbKey}`;
		} catch (err) {
			console.warn('[poi-photos] Thumbnail generation failed (non-fatal):', err);
		}

		// 3. Insert DB record — return to client immediately
		const [photo] = await db
			.insert(poiPhotos)
			.values({
				poiId,
				minioKey,
				thumbnailKey: thumbnailUrl ? thumbKey : null,
				url,
				thumbnailUrl,
				originalName: file.name,
				mimeType: file.type,
				size: file.size,
			})
			.returning();

		// 4. Fire-and-forget: VLM analysis pipeline
		runVLMAnalysisPipeline(photo.id, buffer, poi.name ?? 'Unknown').catch((err) =>
			console.warn('[poi-photos] Background VLM pipeline failed:', err)
		);

		return json({ success: true, photo }, { status: 201 });
	} catch (err) {
		console.error('[poi-photos] POST error:', err);
		return json({ error: 'Failed to upload photo' }, { status: 500 });
	}
};

/**
 * DELETE /api/persons-of-interest/[id]/photos
 * Remove a photo by photoId in JSON body
 * Body: { photoId: string }
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const photoId = body.photoId;

		if (!photoId) {
			return json({ error: 'photoId required' }, { status: 400 });
		}

		const [deleted] = await db
			.delete(poiPhotos)
			.where(eq(poiPhotos.id, photoId))
			.returning();

		if (!deleted) {
			return json({ error: 'Photo not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('[poi-photos] DELETE error:', err);
		return json({ error: 'Failed to delete photo' }, { status: 500 });
	}
};

// ─── Background VLM Analysis Pipeline ─────────────────────────────────

/**
 * Runs the full VLM analysis pipeline after photo upload:
 *   Gemma3 VLM → caption + tags + forensic flags
 *   EmbeddingGemma → 768-dim caption embedding
 *   Qdrant → store in evidence_items for vector search
 *   LangExtract → OCR any text in image
 *   Auto-tag → mirror to CouchDB + Qdrant + pgvector
 */
async function runVLMAnalysisPipeline(
	photoId: string,
	imageBuffer: Buffer,
	poiName: string
): Promise<void> {
	const t0 = Date.now();
	console.log(`[poi-photos] Starting VLM pipeline for photo ${photoId}...`);

	// Resize for VLM input (max 1024px, keeps aspect ratio)
	let vlmBuffer: Buffer;
	try {
		vlmBuffer = await sharp(imageBuffer)
			.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 85 })
			.toBuffer();
	} catch {
		vlmBuffer = imageBuffer; // fallback to original
	}

	const base64Image = vlmBuffer.toString('base64');

	// ── Step 1: Gemma3 VLM Analysis ──
	let aiCaption = '';
	let aiTags: string[] = [];
	let forensicData: Record<string, unknown> = {};

	try {
		const vlmPrompt = `Analyze this photo of a person of interest named "${poiName}" for a legal investigation.

Provide your analysis in JSON format:
{
  "caption": "Detailed description of what's visible in the photo (person, setting, attire, distinguishing features)",
  "tags": ["tag1", "tag2", ...],
  "forensicFlags": {
    "hasText": false,
    "hasSignature": false,
    "hasDocument": false,
    "hasVehicle": false,
    "hasWeapon": false,
    "hasUniform": false,
    "estimatedLocation": "indoor/outdoor/unknown",
    "estimatedTimeOfDay": "day/night/unknown",
    "distinguishingFeatures": ["feature1", "feature2"]
  }
}

Return ONLY valid JSON.`;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), VLM_TIMEOUT);

		const vlmRes = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: VLM_MODEL,
				prompt: vlmPrompt,
				images: [base64Image],
				stream: false,
				options: { temperature: 0.1, num_predict: 1024 },
			}),
			signal: controller.signal,
		});

		clearTimeout(timeout);

		if (vlmRes.ok) {
			const vlmData = await vlmRes.json();
			const responseText = vlmData.response ?? '';
			const jsonMatch = responseText.match(/\{[\s\S]*\}/);

			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				aiCaption = parsed.caption ?? responseText.slice(0, 500);
				aiTags = Array.isArray(parsed.tags) ? parsed.tags : [];
				if (parsed.forensicFlags) {
					forensicData = parsed.forensicFlags;
				}
			} else {
				aiCaption = responseText.slice(0, 500);
			}
		}
	} catch (err) {
		console.warn('[poi-photos] VLM analysis failed (non-fatal):', err);
	}

	const vlmMs = Date.now() - t0;
	console.log(`[poi-photos] VLM analysis: ${vlmMs}ms, caption=${aiCaption.length}ch, tags=${aiTags.length}`);

	// ── Step 2: LangExtract OCR (if available) ──
	let ocrText = '';
	try {
		const langextractRes = await fetch('http://localhost:8095/extract', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				image_base64: base64Image,
				extract_type: 'ocr',
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (langextractRes.ok) {
			const ocrData = await langextractRes.json();
			ocrText = ocrData.text ?? ocrData.extracted_text ?? '';
			if (ocrText.length > 10) {
				forensicData = { ...forensicData, ocrText: ocrText.slice(0, 2000) };
			}
		}
	} catch {
		// LangExtract unavailable — non-fatal
	}

	// ── Step 3: EmbeddingGemma → 768-dim caption embedding ──
	let captionEmbedding: number[] = [];
	const textToEmbed = [aiCaption, ...aiTags, ocrText].filter(Boolean).join(' ').slice(0, 4000);

	if (textToEmbed.length > 20) {
		try {
			const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: EMBED_MODEL, input: textToEmbed }),
				signal: AbortSignal.timeout(15_000),
			});

			if (embedRes.ok) {
				const embedData = await embedRes.json();
				if (embedData.embeddings?.[0]?.length === 768) {
					captionEmbedding = embedData.embeddings[0];
				}
			}
		} catch {
			// Embedding failed — non-fatal
		}
	}

	// ── Step 4: Store caption embedding in Qdrant (evidence_items collection) ──
	if (captionEmbedding.length === 768) {
		try {
			const { QdrantClient } = await import('@qdrant/js-client-rest');
			const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

			// Deterministic point ID from photoId
			const pointId = parseInt(
				createHash('md5').update(photoId).digest('hex').slice(0, 8),
				16
			) % 2147483647;

			await qdrant.upsert('evidence_items', {
				wait: true,
				points: [
					{
						id: pointId,
						vector: captionEmbedding,
						payload: {
							type: 'poi_photo',
							photo_id: photoId,
							poi_name: poiName,
							caption: aiCaption.slice(0, 1000),
							tags: aiTags,
							ocr_text: ocrText.slice(0, 500),
							has_forensic_flags: Object.keys(forensicData).length > 0,
						},
					},
				],
			});
			console.log(`[poi-photos] Qdrant stored: pointId=${pointId}`);
		} catch (err) {
			console.warn('[poi-photos] Qdrant store failed (non-fatal):', err);
		}
	}

	// ── Step 5: Auto-tag via existing tag pipeline (mirror to CouchDB + Qdrant + pgvector) ──
	if (aiTags.length > 0 || textToEmbed.length > 50) {
		try {
			const { autoTagDocument } = await import('$lib/server/ace/auto-tagger');
			await autoTagDocument({
				documentId: photoId,
				text: `POI Photo: ${poiName}. ${aiCaption}. Tags: ${aiTags.join(', ')}. ${ocrText}`,
				maxTags: 20,
			});
			console.log(`[poi-photos] Auto-tagged photo ${photoId}`);
		} catch (err) {
			console.warn('[poi-photos] Auto-tag failed (non-fatal):', err);
		}
	}

	// ── Step 6: Update DB record with analysis results ──
	try {
		await db
			.update(poiPhotos)
			.set({
				aiCaption: aiCaption || null,
				aiTags: aiTags.length > 0 ? aiTags : [],
				forensicData: Object.keys(forensicData).length > 0 ? forensicData : null,
				faceEmbedding:
					captionEmbedding.length === 768 ? JSON.stringify(captionEmbedding) : null,
			})
			.where(eq(poiPhotos.id, photoId));
	} catch (err) {
		console.warn('[poi-photos] DB update with analysis failed:', err);
	}

	const totalMs = Date.now() - t0;
	console.log(
		`[poi-photos] VLM pipeline complete: ${totalMs}ms (vlm=${vlmMs}ms, caption=${aiCaption.length}ch, tags=${aiTags.length}, embedding=${captionEmbedding.length}d, ocr=${ocrText.length}ch)`
	);
}