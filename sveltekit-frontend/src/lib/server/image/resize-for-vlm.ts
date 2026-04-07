/**
 * resize-for-vlm.ts
 *
 * Gemma 4 VLM image preprocessing utility.
 *
 * Gemma 4 uses variable-resolution tokenisation (70–1120 tokens per image).
 * Community testing (gemma4-ocr) confirms --max-edge 2048 @ 300 DPI fills the
 * 1120-token budget for dense documents without exceeding it.
 *
 * Strategy: fit within 2048×2048 while preserving aspect ratio via `contain`,
 * then pad with mid-grey (127) so the model doesn't false-positive on borders.
 *
 * Reference:
 *   https://huggingface.co/google/gemma-4-e4b-it
 *   https://github.com/BitcoinerRay/gemma4-ocr (--dpi 300 --max-edge 2048)
 */
import sharp from 'sharp';

/** Gemma 4 variable-resolution max edge (fills 1120-token budget) */
export const GEMMA4_VLM_MAX_EDGE = 2048;
/** @deprecated Use GEMMA4_VLM_MAX_EDGE */
export const GEMMA3_VLM_SIZE = GEMMA4_VLM_MAX_EDGE;

export interface ResizeResult {
	buffer: Buffer;
	originalWidth: number;
	originalHeight: number;
	resized: boolean;
	/** Output format: always jpeg for Ollama compat (smaller than png for photos) */
	mimeType: 'image/jpeg';
}

/**
 * Resize + pad any image to GEMMA4_VLM_MAX_EDGE × GEMMA4_VLM_MAX_EDGE for VLM inference.
 *
 * - Does nothing (returns original bytes) if the image already fits within
 *   the target bounds AND is already jpeg — avoids double-transcoding small images.
 * - Converts PNG/WebP/TIFF → JPEG (quality 92) so Ollama doesn't need to decode
 *   exotic formats itself.
 * - Pads with mid-grey (127) to avoid introducing hard black bars that SigLIP
 *   may mistake for document borders.
 */
export async function resizeForVLM(input: Buffer): Promise<ResizeResult> {
	const meta = await sharp(input).metadata();
	const w = meta.width ?? 0;
	const h = meta.height ?? 0;

	const alreadyFits = w <= GEMMA4_VLM_MAX_EDGE && h <= GEMMA4_VLM_MAX_EDGE;
	const isJpeg = meta.format === 'jpeg';

	if (alreadyFits && isJpeg) {
		return {
			buffer: input,
			originalWidth: w,
			originalHeight: h,
			resized: false,
			mimeType: 'image/jpeg',
		};
	}

	const buffer = await sharp(input)
		.resize(GEMMA4_VLM_MAX_EDGE, GEMMA4_VLM_MAX_EDGE, {
			fit: 'contain',
			background: { r: 127, g: 127, b: 127, alpha: 1 },
		})
		.jpeg({ quality: 92, mozjpeg: false })
		.toBuffer();

	return {
		buffer,
		originalWidth: w,
		originalHeight: h,
		resized: true,
		mimeType: 'image/jpeg',
	};
}

/**
 * Compute a cheap preview thumbnail (256×256) for UI display.
 * Separate from VLM resize so we don't confuse the two.
 */
export async function resizeForThumbnail(input: Buffer, size = 256): Promise<Buffer> {
	return sharp(input)
		.resize(size, size, { fit: 'cover' })
		.jpeg({ quality: 75 })
		.toBuffer();
}
