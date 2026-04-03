/**
 * Adapter Manifest — Tracks merged LoRA adapter artifacts
 *
 * The merge pipeline (scripts/merge_lora_adapter.py) writes a manifest.json
 * after merging. This module reads it so /api/infrastructure/status can report
 * which adapter is active.
 *
 * Manifest location: ADAPTER_MANIFEST_PATH env var or workspace/adapters/manifest.json
 */

import { readFileSync } from 'fs';
import { ENV } from '$lib/server/env.server.js';

/** Shape of a single adapter artifact entry */
export interface AdapterArtifact {
	id: string;
	baseModel: string;
	adapterPath: string;
	mergedPath: string;
	format: 'hf' | 'gguf' | 'tensorrt' | 'onnx';
	status: 'training' | 'merging' | 'ready' | 'failed' | 'deployed';
	createdAt: string;
	deployedAt?: string;
	metadata: {
		datasetSize?: number;
		epochs?: number;
		loraR?: number;
		loraAlpha?: number;
		quantization?: string;
		modelSizeGb?: number;
		trainingGpu?: string;
		targetGpu?: string;
	};
}

export interface AdapterManifest {
	version: 1;
	updatedAt: string;
	artifacts: AdapterArtifact[];
}

// Cache for 30 seconds to avoid re-reading disk on every status call
let cached: AdapterManifest | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

const DEFAULT_MANIFEST_PATH =
	process.env.ADAPTER_MANIFEST_PATH ?? '/workspace/adapters/manifest.json';

/**
 * Read the adapter manifest from disk. Returns null if file doesn't exist or is invalid.
 */
export function getAdapterManifest(): AdapterManifest | null {
	const now = Date.now();
	if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

	try {
		const raw = readFileSync(DEFAULT_MANIFEST_PATH, 'utf-8');
		const manifest: AdapterManifest = JSON.parse(raw);
		if (manifest.version !== 1 || !Array.isArray(manifest.artifacts)) return null;
		cached = manifest;
		cachedAt = now;
		return manifest;
	} catch {
		// File doesn't exist yet or is invalid — expected before first merge
		return null;
	}
}

/**
 * Get the currently deployed/ready adapter (if any).
 */
export function getActiveAdapter(): AdapterArtifact | null {
	const manifest = getAdapterManifest();
	if (!manifest) return null;
	return (
		manifest.artifacts.find((a) => a.status === 'deployed') ??
		manifest.artifacts.find((a) => a.status === 'ready') ??
		null
	);
}

/**
 * Summary for the infrastructure status endpoint.
 */
export function getAdapterStatus(): {
	manifestFound: boolean;
	activeAdapter: Pick<AdapterArtifact, 'id' | 'baseModel' | 'format' | 'status' | 'createdAt'> | null;
	totalArtifacts: number;
} {
	const manifest = getAdapterManifest();
	const active = getActiveAdapter();
	return {
		manifestFound: manifest !== null,
		activeAdapter: active
			? {
					id: active.id,
					baseModel: active.baseModel,
					format: active.format,
					status: active.status,
					createdAt: active.createdAt,
				}
			: null,
		totalArtifacts: manifest?.artifacts.length ?? 0,
	};
}
