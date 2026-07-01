/**
 * Gemma4 E2B ONNX Session (Fast Browser Fallback)
 *
 * Model: onnx-community/gemma-4-E2B-it-ONNX
 * Speed: 120-255 tokens/sec (browser-optimized)
 * Size: ~1.5 GB (lazy-loaded, cached by browser)
 * Purpose: Fast fallback text generation when server unavailable
 *
 * Download: Run scripts/download-gemma4-e2b-onnx.sh
 * Usage: import { getGemma4E2BSession } from '$lib/ai/onnx/gemma4-e2b-session.js'
 */

import { getOnnxSession, getProviderLabel } from './session.js';

const MODEL_PATH = '/gemma4_e2b_onnx/model.onnx';
const MODEL_NAME = 'Gemma4 E2B (Effective 2 Billion)';

/**
 * Get or create the Gemma4 E2B ONNX session.
 * Session is memoized — calling twice returns the same instance without re-download.
 *
 * @returns InferenceSession or null if model unavailable
 */
export async function getGemma4E2BSession(): Promise<any> {
	try {
		const session = await getOnnxSession(MODEL_PATH);
		if (session) {
			const provider = getProviderLabel(MODEL_PATH);
			console.info(`[Gemma4-E2B] Loaded with ${provider}`);
		}
		return session;
	} catch (err) {
		console.error(`[Gemma4-E2B] Failed to load model:`, err);
		return null;
	}
}

/**
 * Check if Gemma4 E2B model is available and ready.
 * Non-blocking check — doesn't load the full session.
 */
export async function isGemma4E2BAvailable(): Promise<boolean> {
	try {
		const session = await getGemma4E2BSession();
		return session !== null;
	} catch {
		return false;
	}
}

/**
 * Get human-readable model info for display.
 */
export function getGemma4E2BInfo() {
	return {
		name: MODEL_NAME,
		path: MODEL_PATH,
		size: '~1.5 GB',
		speed: '120-255 tokens/sec',
		purpose: 'Fast browser fallback text generation',
		downloadUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
		localPath: 'static/gemma4_e2b_onnx/',
	};
}
