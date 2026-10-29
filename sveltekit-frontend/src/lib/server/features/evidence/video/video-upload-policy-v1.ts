export const MAX_VIDEO_UPLOAD_BYTES_V1 = 100 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BODY_BYTES_V1 = MAX_VIDEO_UPLOAD_BYTES_V1 + 1024 * 1024;

export type VideoUploadSizeDecisionV1 =
	| { ok: true }
	| { ok: false; reason: 'invalid_size' | 'too_large'; maxBytes: number };

export function checkVideoUploadSizeV1(size: number): VideoUploadSizeDecisionV1 {
	if (!Number.isSafeInteger(size) || size < 0) {
		return { ok: false, reason: 'invalid_size', maxBytes: MAX_VIDEO_UPLOAD_BYTES_V1 };
	}
	if (size > MAX_VIDEO_UPLOAD_BYTES_V1) {
		return { ok: false, reason: 'too_large', maxBytes: MAX_VIDEO_UPLOAD_BYTES_V1 };
	}
	return { ok: true };
}

export function isVideoUploadContentLengthAllowedV1(contentLength: string | null): boolean {
	if (contentLength === null) return true;
	if (!/^\d+$/.test(contentLength)) return false;
	const size = Number(contentLength);
	return Number.isSafeInteger(size) && size <= MAX_VIDEO_UPLOAD_BODY_BYTES_V1;
}
