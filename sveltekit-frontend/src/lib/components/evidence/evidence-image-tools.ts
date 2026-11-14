export interface EvidenceImageAnalysis {
	cacheHit: boolean;
	hash: string;
	boxes: Array<{ x: number; y: number; w: number; h: number; label: string; conf: number }>;
	detectorStatus: 'completed' | 'unavailable' | 'failed';
	vlmStatus: 'completed' | 'unavailable' | 'failed';
	warnings: string[];
	analysis: {
		summary: string;
		keyFindings: string[];
		suggestedTags: string[];
	};
}

export type StoredEvidenceImageAnalysis = Pick<EvidenceImageAnalysis, 'analysis' | 'boxes' | 'detectorStatus' | 'vlmStatus' | 'warnings'> & {
	sourceRevision: string;
	analysisRevision?: string;
	embeddingModel?: string;
	preprocessingRevision?: string;
	reviewState?: string;
};

export type CanonicalImageAnalysisReadback = {
	status: 'CURRENT' | 'NOT_ANALYZED' | 'STALE' | 'STORE_UNAVAILABLE';
	analysis: StoredEvidenceImageAnalysis | null;
	message: string | null;
};

export interface EvidenceUpscalePreview {
	blob: Blob;
	dimensions: string | null;
}

async function readError(response: Response): Promise<string> {
	const payload = await response.json().catch(() => null) as { error?: string; hint?: string } | null;
	return [payload?.error ?? `Request failed (${response.status})`, payload?.hint]
		.filter(Boolean)
		.join(' — ');
}

export async function analyzeEvidenceImage(
	file: File,
	caseId: string,
	evidenceId: string,
	fetcher: typeof fetch = fetch,
): Promise<EvidenceImageAnalysis> {
	const formData = new FormData();
	formData.append('file', file);
	formData.append('caseId', caseId);
	formData.append('evidenceId', evidenceId);

	const response = await fetcher('/api/vision/analyze', { method: 'POST', body: formData });
	if (!response.ok) throw new Error(await readError(response));

	const payload = await response.json() as Partial<EvidenceImageAnalysis>;
	if (!payload.analysis || typeof payload.analysis.summary !== 'string') {
		throw new Error('Image analysis returned an invalid response');
	}
	return {
		cacheHit: payload.cacheHit === true,
		hash: typeof payload.hash === 'string' ? payload.hash : '',
		boxes: normalizeBoxes(payload.boxes),
		detectorStatus: normalizeStage(payload.detectorStatus),
		vlmStatus: normalizeStage(payload.vlmStatus),
		warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === 'string') : [],
		analysis: {
			summary: payload.analysis.summary,
			keyFindings: Array.isArray(payload.analysis.keyFindings) ? payload.analysis.keyFindings : [],
			suggestedTags: Array.isArray(payload.analysis.suggestedTags) ? payload.analysis.suggestedTags : [],
		},
	};
}

export async function analyzeStoredEvidenceImage(
	evidenceId: string,
	fetcher: typeof fetch = fetch,
): Promise<StoredEvidenceImageAnalysis> {
	const response = await fetcher(`/api/evidence/${encodeURIComponent(evidenceId)}/vlm-analyze`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	});
	if (!response.ok) throw new Error(await readError(response));

	const payload = await response.json() as {
		analysis?: { summary?: unknown; keyFindings?: unknown; suggestedTags?: unknown };
		boxes?: unknown;
		detectorStatus?: unknown;
		vlmStatus?: unknown;
		warnings?: unknown;
		sourceRevision?: unknown;
	};
	if (typeof payload.analysis?.summary !== 'string') {
		throw new Error('Image analysis returned an invalid response');
	}

	return {
		analysis: {
			summary: payload.analysis.summary,
			keyFindings: Array.isArray(payload.analysis.keyFindings) ? payload.analysis.keyFindings as string[] : [],
			suggestedTags: Array.isArray(payload.analysis.suggestedTags) ? payload.analysis.suggestedTags as string[] : [],
		},
		boxes: normalizeBoxes(payload.boxes),
		detectorStatus: normalizeStage(payload.detectorStatus),
		vlmStatus: normalizeStage(payload.vlmStatus),
		warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === 'string') : [],
		sourceRevision: typeof payload.sourceRevision === 'string' ? payload.sourceRevision : '',
	};
}

export async function loadCanonicalStoredEvidenceImageAnalysis(
	evidenceId: string,
	fetcher: typeof fetch = fetch,
): Promise<CanonicalImageAnalysisReadback> {
	const response = await fetcher(`/api/evidence/${encodeURIComponent(evidenceId)}/multimodal-analysis`, {
		method: 'GET',
		cache: 'no-store',
		headers: { accept: 'application/json' },
	});
	const payload = await response.json().catch(() => null) as {
		status?: unknown;
		error?: unknown;
		sourceRevision?: unknown;
		analysisRevision?: unknown;
		model?: unknown;
		preprocessingRevision?: unknown;
		reviewState?: unknown;
		analysis?: Record<string, unknown> | null;
	} | null;
	if (!payload || typeof payload.status !== 'string') {
		throw new Error('Saved image analysis returned an invalid response');
	}
	if (payload.status === 'NOT_ANALYZED') return { status: 'NOT_ANALYZED', analysis: null, message: null };
	if (payload.status === 'STALE') return { status: 'STALE', analysis: null, message: 'Saved analysis belongs to an earlier evidence revision.' };
	if (payload.status === 'STORE_UNAVAILABLE' || response.status === 503) {
		return { status: 'STORE_UNAVAILABLE', analysis: null, message: 'Saved analysis storage is not available yet.' };
	}
	if (!response.ok || payload.status !== 'CURRENT' || !payload.analysis) {
		throw new Error(typeof payload.error === 'string' ? payload.error : await readError(response));
	}
	if (typeof payload.sourceRevision !== 'string' || payload.analysis.sourceRevision !== payload.sourceRevision) {
		return { status: 'STALE', analysis: null, message: 'Saved analysis does not match the selected evidence revision.' };
	}

	const rawAnalysis = payload.analysis;
	const detections = Array.isArray(rawAnalysis.objectDetections) ? rawAnalysis.objectDetections : [];
	const boxes = detections.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const detection = entry as Record<string, unknown>;
		const bbox = detection.bbox;
		if (typeof detection.class !== 'string' || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
		const [x1, y1, x2, y2] = bbox as number[];
		if (x2 <= x1 || y2 <= y1) return [];
		return [{ x: x1, y: y1, w: x2 - x1, h: y2 - y1, label: detection.class, conf: typeof detection.confidence === 'number' ? detection.confidence : 0 }];
	});
	const stageErrors = Array.isArray(rawAnalysis.stageErrors)
		? rawAnalysis.stageErrors.filter((item): item is string => typeof item === 'string')
		: [];
	const detectorError = stageErrors.find((item) => item.startsWith('detection:'));
	const visionError = stageErrors.find((item) => item.startsWith('vision:'));
	const summary = typeof rawAnalysis.visionSummary === 'string' ? rawAnalysis.visionSummary : '';
	return {
		status: 'CURRENT',
		message: null,
		analysis: {
			sourceRevision: payload.sourceRevision,
			analysisRevision: typeof payload.analysisRevision === 'string' ? payload.analysisRevision : undefined,
			embeddingModel: typeof payload.model === 'string' ? payload.model : undefined,
			preprocessingRevision: typeof payload.preprocessingRevision === 'string' ? payload.preprocessingRevision : undefined,
			reviewState: typeof payload.reviewState === 'string' ? payload.reviewState : 'UNREVIEWED_PROPOSAL',
			analysis: {
				summary,
				keyFindings: Array.isArray(rawAnalysis.visionFindings) ? rawAnalysis.visionFindings.filter((item): item is string => typeof item === 'string') : [],
				suggestedTags: Array.isArray(rawAnalysis.visionTags) ? rawAnalysis.visionTags.filter((item): item is string => typeof item === 'string') : [],
			},
			boxes,
			detectorStatus: detectorError ? 'failed' : 'completed',
			vlmStatus: visionError ? (/UNAVAILABLE|UNREACHABLE/.test(visionError) ? 'unavailable' : 'failed') : 'completed',
			warnings: stageErrors,
		},
	};
}

function normalizeStage(value: unknown): 'completed' | 'unavailable' | 'failed' {
	return value === 'completed' || value === 'failed' ? value : 'unavailable';
}

function normalizeBoxes(value: unknown): StoredEvidenceImageAnalysis['boxes'] {
	if (!Array.isArray(value)) return [];
	return value.filter((box): box is StoredEvidenceImageAnalysis['boxes'][number] => {
		if (!box || typeof box !== 'object') return false;
		const item = box as Record<string, unknown>;
		return ['x', 'y', 'w', 'h', 'conf'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]))
			&& typeof item.label === 'string';
	});
}

export async function requestEvidenceUpscale(
	evidenceId: string,
	scale: 2 | 4 = 2,
	fetcher: typeof fetch = fetch,
): Promise<EvidenceUpscalePreview> {
	const response = await fetcher(`/api/evidence/${encodeURIComponent(evidenceId)}/upscale`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ scale }),
	});
	if (!response.ok) throw new Error(await readError(response));

	const blob = await response.blob();
	if (!blob.type.startsWith('image/')) throw new Error('Upscale returned a non-image response');
	return { blob, dimensions: response.headers.get('X-Upscale-Size') };
}
