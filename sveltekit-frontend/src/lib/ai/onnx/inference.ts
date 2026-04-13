/**
 * ONNX Runtime Inference (Gemma 3 270M - Legacy Fallback)
 *
 * This module provides inference via ONNX Runtime for the Gemma 3 270M model.
 * This is a legacy fallback when E2B WebGPU and LiteRT are unavailable.
 *
 * Model: static/gemma3_270m_onnx/ (418MB, local-only)
 * Embedding: static/embeddinggemma_300m_onnx/ (768-dim)
 */

import { getOnnxSession } from './session.js';

export interface OnnxInferenceOptions {
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
}

export interface OnnxInferenceResult {
	text: string;
	tokensGenerated: number;
	latencyMs: number;
}

/**
 * Run text generation inference using ONNX Runtime.
 * Returns null if ONNX session is not available.
 */
export async function runOnnxInference(
	prompt: string,
	options: OnnxInferenceOptions = {}
): Promise<string | null> {
	const {
		maxTokens = 200,
		temperature = 0.7,
		topP = 0.9,
		topK = 40,
	} = options;

	const startTime = performance.now();

	try {
		const session = await getOnnxSession();
		if (!session) {
			console.warn('[onnx-inference] ONNX session not available');
			return null;
		}

		// Simple text generation (this is a stub - actual implementation would need tokenizer)
		// For now, return null to indicate not implemented
		console.warn('[onnx-inference] ONNX inference not fully implemented - use E2B or LiteRT instead');
		return null;

		// TODO: Implement actual ONNX inference with tokenizer
		// const inputIds = await tokenize(prompt);
		// const outputs = await session.run({ input_ids: inputIds });
		// const generatedText = await detokenize(outputs.logits);
		// return generatedText;

	} catch (error) {
		console.error('[onnx-inference] Error during inference:', error);
		return null;
	}
}

/**
 * Check if ONNX inference is available.
 * This is a lightweight check that doesn't load the full session.
 */
export async function isOnnxAvailable(): Promise<boolean> {
	try {
		const session = await getOnnxSession();
		return session !== null;
	} catch {
		return false;
	}
}
