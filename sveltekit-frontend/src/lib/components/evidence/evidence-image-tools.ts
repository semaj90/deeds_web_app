export interface EvidenceImageAnalysis {
	cacheHit: boolean;
	hash: string;
	analysis: {
		summary: string;
		keyFindings: string[];
		suggestedTags: string[];
	};
}

export type StoredEvidenceImageAnalysis = Pick<EvidenceImageAnalysis, 'analysis'>;

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

	const payload = await response.json() as { analysis?: { summary?: unknown; keyFindings?: unknown; suggestedTags?: unknown } };
	if (typeof payload.analysis?.summary !== 'string') {
		throw new Error('Image analysis returned an invalid response');
	}

	return {
		analysis: {
			summary: payload.analysis.summary,
			keyFindings: Array.isArray(payload.analysis.keyFindings) ? payload.analysis.keyFindings as string[] : [],
			suggestedTags: Array.isArray(payload.analysis.suggestedTags) ? payload.analysis.suggestedTags as string[] : [],
		},
	};
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
