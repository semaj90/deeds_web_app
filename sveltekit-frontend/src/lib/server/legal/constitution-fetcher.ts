/**
 * Constitution Fetcher
 *
 * Stage B of the constitution pipeline:
 * - Fetch HTML or PDF from official state URL
 * - Hash the content (SHA-256) — skip if unchanged (etag/hash match)
 * - Save raw artifact to MinIO (legal-library/constitutions/raw/<state>/)
 * - Save normalized text to MinIO   (legal-library/constitutions/normalized/<state>/)
 * - Return FetchResult for the pipeline to continue
 *
 * Rate-limiting: max 1 request/second per host, with randomized jitter.
 * Respects 429s with exponential backoff.
 */

import { createHash } from 'crypto';
import { ensureBucket, putObject } from '$lib/server/minio-client.js';
import { normalizeConstitutionHtml, normalizePlainText, type NormalizeResult } from './html-normalizer';
import type { StateConstitutionSource } from './constitution-registry';

const BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';
const USER_AGENT = 'LegalAI-Researcher/1.0 (educational; contact: admin@deeds.internal)';

// Inter-request delay: 1000–1500ms to be polite
const REQUEST_DELAY_MS = 1000;
const REQUEST_JITTER_MS = 500;

/** Shared per-host rate-limit tracker */
const lastRequestAt = new Map<string, number>();

async function politeDelay(url: string) {
	const host = new URL(url).hostname;
	const last = lastRequestAt.get(host) ?? 0;
	const elapsed = Date.now() - last;
	const delay = REQUEST_DELAY_MS + Math.random() * REQUEST_JITTER_MS;
	if (elapsed < delay) {
		await new Promise((r) => setTimeout(r, delay - elapsed));
	}
	lastRequestAt.set(host, Date.now());
}

export interface FetchResult {
	stateCode: string;
	url: string;
	format: 'html' | 'pdf';
	hash: string;
	skipped: boolean; // true if hash matches last known — no reprocessing needed
	rawMinioKey: string;
	normalizedMinioKey: string;
	normalized: NormalizeResult;
	rawSizeBytes: number;
}

/**
 * Fetch a state constitution from its official (or discovery) URL.
 *
 * @param source - Registry entry for the state
 * @param lastKnownHash - SHA-256 of the last successful ingestion (optional)
 * @param maxRetries - Number of 5xx / 429 retries
 */
export async function fetchConstitution(
	source: StateConstitutionSource,
	lastKnownHash: string | null = null,
	maxRetries = 2
): Promise<FetchResult> {
	const fetchUrl = source.sourceUrl ?? source.discoveryUrl;
	await politeDelay(fetchUrl);

	let lastErr: Error | null = null;
	let rawBuffer: Buffer | null = null;
	let finalUrl = fetchUrl;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (attempt > 0) {
			const backoff = Math.min(2 ** attempt * 3000, 30_000);
			await new Promise((r) => setTimeout(r, backoff));
		}

		try {
			const res = await fetch(fetchUrl, {
				headers: {
					'User-Agent': USER_AGENT,
					Accept: 'text/html,application/xhtml+xml,application/pdf,*/*',
				},
				redirect: 'follow',
				signal: AbortSignal.timeout(30_000),
			});

			finalUrl = res.url || fetchUrl;

			if (res.status === 429 || res.status >= 500) {
				lastErr = new Error(`HTTP ${res.status} from ${fetchUrl}`);
				continue; // retry
			}

			if (!res.ok) {
				throw new Error(`HTTP ${res.status} from ${fetchUrl}`);
			}

			rawBuffer = Buffer.from(await res.arrayBuffer());
			break;
		} catch (err) {
			lastErr = err instanceof Error ? err : new Error(String(err));
		}
	}

	if (!rawBuffer) {
		throw lastErr ?? new Error(`Failed to fetch ${fetchUrl}`);
	}

	// Hash
	const hash = createHash('sha256').update(rawBuffer).digest('hex');

	// Check if content is unchanged
	if (lastKnownHash && hash === lastKnownHash) {
		return {
			stateCode: source.stateCode,
			url: finalUrl,
			format: source.format,
			hash,
			skipped: true,
			rawMinioKey: `constitutions/raw/${source.stateCode}/constitution.${source.format}`,
			normalizedMinioKey: `constitutions/normalized/${source.stateCode}/constitution.txt`,
			normalized: { title: '', fullText: '', textClean: '', sections: [], wordCount: 0 },
			rawSizeBytes: rawBuffer.length,
		};
	}

	// Normalize content
	let normalized: NormalizeResult;
	if (source.format === 'html') {
		const html = rawBuffer.toString('utf-8');
		normalized = normalizeConstitutionHtml(html, finalUrl);
	} else {
		// PDF — raw text extraction is done in the main pipeline via pdf-parse/OCR
		// Store a placeholder here; the pipeline will extract from MinIO
		normalized = normalizePlainText('');
	}

	// Save raw artifact to MinIO
	await ensureBucket(BUCKET);
	const rawKey = `constitutions/raw/${source.stateCode}/constitution.${source.format}`;
	await putObject(BUCKET, rawKey, rawBuffer, rawBuffer.length, {
		'Content-Type': source.format === 'html' ? 'text/html' : 'application/pdf',
		'x-state-code': source.stateCode,
		'x-fetch-url': finalUrl,
		'x-sha256': hash,
	});

	// Save normalized text to MinIO
	const normalizedKey = `constitutions/normalized/${source.stateCode}/constitution.txt`;
	if (normalized.textClean) {
		const normalizedBuf = Buffer.from(normalized.textClean, 'utf-8');
		await putObject(BUCKET, normalizedKey, normalizedBuf, normalizedBuf.length, {
			'Content-Type': 'text/plain; charset=utf-8',
			'x-state-code': source.stateCode,
			'x-word-count': String(normalized.wordCount),
		});
	}

	return {
		stateCode: source.stateCode,
		url: finalUrl,
		format: source.format,
		hash,
		skipped: false,
		rawMinioKey: rawKey,
		normalizedMinioKey: normalizedKey,
		normalized,
		rawSizeBytes: rawBuffer.length,
	};
}
