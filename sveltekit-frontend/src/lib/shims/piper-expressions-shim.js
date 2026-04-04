/**
 * Shim for piper-wasm's missing expressions.js
 *
 * piper-wasm v0.1.4 publishes api.js which imports ./expressions.js,
 * but the file is not included in the npm package (missing from "files" array).
 * This shim provides the Expressions class so the module loads without errors.
 *
 * The Expressions class handles facial expression inference from phoneme data —
 * optional for our TTS-only usage (we only use synthesize(), not expressions).
 */

export class Expressions {
	constructor(_opts) {
		this.faceExpressions = null;
	}

	static async inferEmotionsFromText(_text) {
		return null;
	}
}
