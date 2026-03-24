/**
 * resize-for-vlm.ts
 *
 * Gemma 3 VLM image preprocessing utility.
 *
 * Google's official spec (from the Gemma 3 model card on Hugging Face):
 *   "Images normalized to 896 × 896 resolution, encoded to 256 tokens each"
 *
 * The SigLIP vision encoder inside Gemma 3 operates at a fixed 896×896 grid.
 * Sending oversized images wastes VRAM (Ollama still has to rescale internally)
 * and increases base64 payload size dramatically.
 *
 * Strategy: fit within 896×896 while preserving aspect ratio via `contain`,
 * then pad to exactly 896×896 with a neutral background (127,127,127 = mid-grey).
 * This matches what the Gemma preprocessor does before SigLIP tokenisation.
 *
 * Reference: https://huggingface.co/google/gemma-3-12b-it
 */
import sharp from 'sharp';

/** Gemma 3 SigLIP encoder native resolution */
export const GEMMA3_VLM_SIZE = 896;

export interface ResizeResult {
	buffer: Buffer;
	originalWidth: number;
	originalHeight: number;
	resized: boolean;
	/** Output format: always jpeg for Ollama compat (smaller than png for photos) */
	mimeType: 'image/jpeg';
}

/**
 * Resize + pad any image to GEMMA3_VLM_SIZE × GEMMA3_VLM_SIZE for VLM inference.
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

	const alreadyFits = w <= GEMMA3_VLM_SIZE && h <= GEMMA3_VLM_SIZE;
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
		.resize(GEMMA3_VLM_SIZE, GEMMA3_VLM_SIZE, {
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
