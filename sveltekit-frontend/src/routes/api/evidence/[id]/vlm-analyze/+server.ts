/**
 * POST /api/evidence/[id]/vlm-analyze
 * Runs VLM (Vision Language Model) analysis on an existing evidence file.
 * Fetches the file from SeaweedFS-compatible object storage, then passes to
 * the 3-tier VLM pipeline (Triton → TurboQuant → Ollama).
 */
import { json } from '@sveltejs/kit';
import crypto from 'node:crypto';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { getSeaweedFile as getFile } from '$lib/server/seaweed-client.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';
import { getVlmState, VlmMode } from '$lib/server/inference/vlm-lifecycle.js';
import { createYOLOService, type YOLOResult } from '$lib/server/yolo.js';

const EVIDENCE_BUCKET = ENV.SEAWEED_EVIDENCE_BUCKET;

function extractObjectKey(fileUrl: string): { bucket: string; key: string } | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('seaweed://') || fileUrl.startsWith('minio://')) {
    const rest = fileUrl.slice(fileUrl.indexOf('://') + 3);
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) return null;
    return { bucket: rest.slice(0, slashIdx), key: rest.slice(slashIdx + 1) };
  }
  if (fileUrl.startsWith('http')) {
    try {
      const url = new URL(fileUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return { bucket: parts[0], key: parts.slice(1).join('/') };
    } catch {
      /* invalid URL */
    }
  }
  if (fileUrl.includes('/')) return { bucket: EVIDENCE_BUCKET, key: fileUrl };
  return null;
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const evidenceId = params.id;
  if (!isUuid(evidenceId)) return json({ error: 'Invalid evidence ID' }, { status: 400 });

  // Look up evidence record
  const userId = Number(locals.user.id);
  const [row] = await db
    .select({
      fileUrl: evidence.fileUrl,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      title: evidence.title,
      hash: evidence.hash,
    })
    .from(evidence)
    .leftJoin(cases, eq(evidence.caseId, cases.id))
    .where(and(
      eq(evidence.id, evidenceId),
      or(
        eq(evidence.userId, userId),
        eq(evidence.uploadedBy, userId),
        and(
          isNotNull(evidence.caseId),
          or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId)),
        ),
      ),
    ))
    .limit(1);

  if (!row) return json({ error: 'Evidence not found' }, { status: 404 });

  const mimeType = (row.mimeType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) return json({ error: 'Evidence is not an image' }, { status: 415 });

  const fileUrl = row.fileUrl ?? row.fileName;
  if (!fileUrl) return json({ error: 'No file associated with this evidence' }, { status: 400 });

  const parsed = extractObjectKey(fileUrl);
  if (!parsed) return json({ error: 'Cannot resolve file location' }, { status: 400 });

  // Parse optional request body
  const vlmBodySchema = z.object({
    promptOverride: z.string().max(2000).optional(),
    detectionContext: z.string().max(2000).optional(),
    skipCache: z.boolean().optional(),
  });
  let promptOverride: string | undefined;
  let detectionContext: string | undefined;
  let skipCache = false;
  try {
    const body = await request.json();
    const parsed = vlmBodySchema.safeParse(body);
    if (parsed.success) {
      promptOverride = parsed.data.promptOverride;
      detectionContext = parsed.data.detectionContext;
      skipCache = parsed.data.skipCache === true;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  try {
    const buffer = await getFile(parsed.bucket, parsed.key);
	const sourceHash = crypto.createHash('sha256').update(buffer).digest('hex');
	const expectedHash = String(row.hash ?? '').replace(/^sha256:/i, '').toLowerCase();
	if (/^[a-f0-9]{64}$/.test(expectedHash) && expectedHash !== sourceHash) {
		return json({ error: 'Stored evidence bytes do not match the admitted source hash', code: 'SOURCE_HASH_MISMATCH' }, { status: 409 });
	}

	const boxes: Array<{ x: number; y: number; w: number; h: number; label: string; conf: number }> = [];
	let detectorStatus: 'completed' | 'unavailable' | 'failed' = 'unavailable';
	let detectorWarning: string | null = null;
	try {
		const detector = createYOLOService();
		if (await detector.isModelAvailable()) {
			const detected: YOLOResult = await detector.analyzeDocument(buffer, row.fileName ?? row.title ?? 'evidence-image');
			for (const object of detected.objects ?? []) {
				const [x1, y1, x2, y2] = object.bbox;
				if ([x1, y1, x2, y2, object.confidence].every(Number.isFinite) && x2 > x1 && y2 > y1) {
					boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, label: object.class, conf: object.confidence });
				}
			}
			for (const region of detected.layout?.regions ?? []) {
				const [x1, y1, x2, y2] = region.bbox;
				if ([x1, y1, x2, y2, region.confidence].every(Number.isFinite) && x2 > x1 && y2 > y1) {
					boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, label: region.type, conf: region.confidence });
				}
			}
			detectorStatus = 'completed';
		} else {
			detectorWarning = 'No supported object-detection model is installed; visual description may still be available.';
		}
	} catch (error) {
		detectorStatus = 'failed';
		detectorWarning = error instanceof Error ? error.message.slice(0, 300) : 'Object detection failed';
	}

	let vlmStatus: 'completed' | 'unavailable' | 'failed' = 'unavailable';
	let analysis = { summary: '', keyFindings: [] as string[], suggestedTags: [] as string[] };
	let vlmWarning: string | null = null;
	let vlmState: VlmMode | null = null;
	try { vlmState = await getVlmState(); } catch { vlmWarning = 'Vision model status is unavailable.'; }
	if (vlmState === VlmMode.VISION) {
		try {
			const { analyzeEvidenceImage } = await import('$lib/server/analysis/vlm-evidence-analyzer.js');
			const result = await analyzeEvidenceImage({
				buffer,
				fileName: row.fileName ?? row.title ?? 'evidence',
				detectionContext: detectionContext ?? (boxes.map((box) => `${box.label} (${Math.round(box.conf * 100)}%)`).join(', ') || undefined),
				promptOverride,
				skipCache,
			});
			analysis = { summary: result.summary, keyFindings: result.keyFindings, suggestedTags: result.suggestedTags };
			vlmStatus = 'completed';
		} catch (error) {
			vlmStatus = 'failed';
			vlmWarning = error instanceof Error ? error.message.slice(0, 300) : 'Visual analysis failed';
		}
	} else if (!vlmWarning) {
		vlmWarning = `Vision model is not ready (current mode: ${vlmState ?? 'unknown'}). Object detection can still be used when its model is available.`;
	}

	const result = {
		...analysis,
		sourceRevision: `sha256:${sourceHash}`,
		objectDetections: boxes,
		detectorStatus,
		vlmStatus,
		warnings: [detectorWarning, vlmWarning].filter((value): value is string => Boolean(value)),
	};

    // Persist AI analysis to evidence record
    let updateQuery = db
      .update(evidence)
      .set({
        aiAnalysis: result as unknown as Record<string, unknown>,
        aiTags: result.suggestedTags,
        aiSummary: result.summary,
        updatedAt: new Date(),
      });
    // Fence the derived write to the exact source revision analyzed above.
    // If the source changed after the read, don't attach stale results to it.
    const updateCondition = /^[a-f0-9]{64}$/.test(expectedHash)
      ? and(eq(evidence.id, evidenceId), eq(evidence.hash, row.hash))
      : eq(evidence.id, evidenceId);
    await updateQuery
      .where(updateCondition)
      .catch((err) => console.warn('[VLM] DB update failed:', err));

    return json({ success: true, analysis: result, boxes, sourceRevision: result.sourceRevision, detectorStatus, vlmStatus, warnings: result.warnings });
  } catch (err) {
    console.error('[VLM] Evidence analysis failed:', err);
    return json({ error: 'VLM analysis failed' }, { status: 500 });
  }
};
