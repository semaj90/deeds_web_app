/**
 * Phase A4 — Qdrant payload backfill for codebase_chunks_768.
 *
 * For every Qdrant chunk whose `file_path` (or `path`) payload field starts
 * with the card's dirPath, set/merge:
 *   - agents_card_id = card.id  (the agents:dir:<slug> handle)
 *   - feature_keys   = card.featureKeys
 *
 * Uses Qdrant HTTP `set_payload` with a filter — single round-trip per card,
 * no scrolling needed. Skips entirely when `enabled: false` (dry-run path).
 *
 * Hard rule: this is a payload UPDATE, not a re-index — vector data is
 * untouched. No identity-strategy intersection.
 */

import type { AgentsDirectoryCard } from '../../agents-card-store.js';
import { ENV } from '../../../env.server.js';

const DEFAULT_QDRANT_URL = ENV.QDRANT_URL;
const DEFAULT_COLLECTION = process.env.QDRANT_CODEBASE_COLLECTION ?? 'codebase_chunks_768';
const REQUEST_TIMEOUT_MS = 10_000;

export interface QdrantBackfillOptions {
	enabled?:    boolean;
	url?:        string;
	collection?: string;
	fetchImpl?:  typeof fetch;
	/** Belt-and-braces test-env override. Default: live writes blocked under
	 *  VITEST / NODE_ENV=test so payload merges cannot leak into the real
	 *  codebase_chunks_768 collection. */
	allowLiveWritesInTests?: boolean;
}

export interface QdrantBackfillResult {
	wrote:        boolean;          // true if Qdrant accepted the set_payload call
	skipped:      'disabled' | 'empty-feature-keys' | 'test-env-blocked' | null;
	pointsTouched: number;          // best-effort from Qdrant response (0 if unknown)
	error?:       string;
}

function isTestEnv(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

export async function backfillQdrantPayload(
	card: AgentsDirectoryCard,
	opts: QdrantBackfillOptions = {},
): Promise<QdrantBackfillResult> {
	if (!opts.enabled) {
		return { wrote: false, skipped: 'disabled', pointsTouched: 0 };
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return { wrote: false, skipped: 'test-env-blocked', pointsTouched: 0 };
	}

	// Qdrant set_payload requires a filter — if the card has nothing useful to
	// project (no dirPath that scopes points), refuse rather than touching all
	// chunks. dirPath is mandatory per the Zod schema, so this is mostly defensive.
	if (!card.dirPath || card.dirPath.length === 0) {
		return { wrote: false, skipped: null, pointsTouched: 0, error: 'card.dirPath empty' };
	}

	const baseUrl    = (opts.url ?? DEFAULT_QDRANT_URL).replace(/\/+$/, '');
	const collection = opts.collection ?? DEFAULT_COLLECTION;
	const fetcher    = opts.fetchImpl ?? fetch;
	const url        = `${baseUrl}/collections/${encodeURIComponent(collection)}/points/payload?wait=true`;

	// Match either `file_path` (graphify convention) OR `path` (legacy chunks).
	// `match_prefix` would be cleaner but isn't on every Qdrant version — use
	// a regex match instead, anchored at the start of the path field.
	const prefix = card.dirPath.endsWith('/') ? card.dirPath : `${card.dirPath}/`;
	const body = {
		payload: {
			agents_card_id: card.id,
			feature_keys:   card.featureKeys,
		},
		filter: {
			should: [
				{ key: 'file_path', match: { text: prefix } },
				{ key: 'path',      match: { text: prefix } },
			],
		},
	};

	try {
		const res = await fetcher(url, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify(body),
			signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!res.ok) {
			let reason = `HTTP ${res.status}`;
			try {
				const errBody = await res.json() as { status?: { error?: string } };
				if (errBody.status?.error) reason = errBody.status.error;
			} catch {
				// keep HTTP fallback
			}
			return { wrote: false, skipped: null, pointsTouched: 0, error: reason };
		}
		let pointsTouched = 0;
		try {
			const data = await res.json() as { result?: { status?: string }; usage?: { points?: number } };
			pointsTouched = data.usage?.points ?? 0;
		} catch {
			// keep 0 — set_payload doesn't always include a count
		}
		return { wrote: true, skipped: null, pointsTouched };
	} catch (err) {
		return { wrote: false, skipped: null, pointsTouched: 0, error: (err as Error)?.message ?? String(err) };
	}
}
