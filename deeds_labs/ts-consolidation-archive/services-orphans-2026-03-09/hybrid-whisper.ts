/**
 * Hybrid Whisper Service — Smart client/server routing
 *
 * Routes short utterances to browser Whisper (fast, offline)
 * Routes long utterances to GPU backend (faster for >10s audio)
 *
 * Usage:
 *   import { hybridWhisper } from '$lib/services/hybrid-whisper';
 *   const result = await hybridWhisper.transcribe(audioBlob);
 */

import { whisperSTT } from './whisper-stt';
import type { WhisperTranscriptResult } from './whisper-stt';

interface TranscriptionConfig {
	preferGPU?: boolean;           // Force GPU backend
	maxClientDuration?: number;    // Max duration for client (default: 10s)
	language?: string;             // 'en' | 'es' | 'auto'
}

export interface HybridTranscriptResult extends WhisperTranscriptResult {
	backend: 'client-wasm' | 'gpu-server';
	reason: string;
}

class HybridWhisperService {
	private readonly GPU_ENDPOINT = '/api/audio/transcribe';
	private readonly MAX_CLIENT_DURATION = 10_000; // 10 seconds

	/**
	 * Smart transcription with client/server routing
	 */
	async transcribe(
		audioBlob: Blob,
		config: TranscriptionConfig = {}
	): Promise<HybridTranscriptResult> {
		const {
			preferGPU = false,
			maxClientDuration = this.MAX_CLIENT_DURATION,
			language = 'en'
		} = config;

		// Estimate audio duration (rough heuristic: 1MB ≈ 10s for typical voice)
		const estimatedDuration = (audioBlob.size / 100_000) * 1000; // ms
		const isShort = estimatedDuration < maxClientDuration;

		// Decision logic
		if (preferGPU) {
			return this.transcribeGPU(audioBlob, language, 'user-preference');
		}

		if (isShort) {
			try {
				const result = await this.transcribeClient(audioBlob);
				return {
					...result,
					backend: 'client-wasm',
					reason: `short-audio-${Math.round(estimatedDuration / 1000)}s`
				};
			} catch (error) {
				console.warn('[HybridWhisper] Client failed, falling back to GPU:', error);
				return this.transcribeGPU(audioBlob, language, 'client-fallback');
			}
		} else {
			// Long audio → GPU is faster
			return this.transcribeGPU(audioBlob, language, `long-audio-${Math.round(estimatedDuration / 1000)}s`);
		}
	}

	/**
	 * Client-side Whisper (WASM)
	 */
	private async transcribeClient(audioBlob: Blob): Promise<WhisperTranscriptResult> {
		const startTime = performance.now();
		const result = await whisperSTT.transcribe(audioBlob);
		const duration = performance.now() - startTime;

		return {
			text: result.text,
			confidence: result.confidence || 1.0,
			duration
		};
	}

	/**
	 * GPU-accelerated Whisper (FastAPI)
	 */
	private async transcribeGPU(
		audioBlob: Blob,
		language: string,
		reason: string
	): Promise<HybridTranscriptResult> {
		const startTime = performance.now();

		// Create FormData with audio file
		const formData = new FormData();
		formData.append('file', audioBlob, 'audio.webm');

		// Call FastAPI endpoint
		const response = await fetch(
			`${this.GPU_ENDPOINT}?evidence_id=voice-chat&language=${language}`,
			{
				method: 'POST',
				body: formData
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`GPU transcription failed: ${response.status} ${errorText}`);
		}

		const data = await response.json();
		const duration = performance.now() - startTime;

		return {
			text: data.text,
			confidence: 0.95, // GPU Whisper is highly accurate
			duration,
			backend: 'gpu-server',
			reason
		};
	}

	/**
	 * Get service statistics
	 */
	getStats() {
		return {
			clientAvailable: typeof window !== 'undefined',
			gpuEndpoint: this.GPU_ENDPOINT,
			maxClientDuration: this.MAX_CLIENT_DURATION / 1000 // seconds
		};
	}
}

export const hybridWhisper = new HybridWhisperService();