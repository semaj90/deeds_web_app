import type { WikiCard, WikiGap, GapReport } from './types.js';
import { ENV } from '$lib/server/env.server.js';

// ─────────────────────────────────────────────────────────────────────────────
// wiki-couchdb-client.ts
//
// Writes wiki cards and gap reports to CouchDB.
// CouchDB = human-readable wiki documents layer.
// ─────────────────────────────────────────────────────────────────────────────

const COUCHDB_URL = ENV.COUCHDB_URL;
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASS ?? 'password';
const WIKI_DB = process.env.COUCHDB_WIKI_DB ?? 'wiki';

function authHeader(): string {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

async function couchFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return fetch(`${COUCHDB_URL}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: authHeader(),
			...(init.headers as Record<string, string> | undefined),
		},
	});
}

async function ensureDb(): Promise<void> {
	const res = await couchFetch(`/${WIKI_DB}`, { method: 'PUT' });
	// 201 = created, 412 = already exists — both are fine
	if (res.status !== 201 && res.status !== 412) {
		throw new Error(`CouchDB: failed to ensure db ${WIKI_DB}: ${res.status}`);
	}
}

async function upsertDoc(id: string, doc: Record<string, unknown>): Promise<void> {
	// Fetch current rev to avoid update conflict
	const getRes = await couchFetch(`/${WIKI_DB}/${encodeURIComponent(id)}`);
	let rev: string | undefined;
	if (getRes.status === 200) {
		const existing = (await getRes.json()) as { _rev?: string };
		rev = existing._rev;
	}

	const body = rev ? { ...doc, _id: id, _rev: rev } : { ...doc, _id: id };
	const putRes = await couchFetch(`/${WIKI_DB}/${encodeURIComponent(id)}`, {
		method: 'PUT',
		body: JSON.stringify(body),
	});

	if (!putRes.ok) {
		const err = await putRes.text();
		throw new Error(`CouchDB upsert failed for ${id}: ${putRes.status} ${err}`);
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function writeWikiCards(cards: WikiCard[]): Promise<{ written: number; errors: string[] }> {
	await ensureDb();
	let written = 0;
	const errors: string[] = [];

	for (const card of cards) {
		try {
			await upsertDoc(card.id, card as unknown as Record<string, unknown>);
			written++;
		} catch (e) {
			errors.push(`${card.id}: ${String(e)}`);
		}
	}

	return { written, errors };
}

export async function writeGapDocs(gaps: WikiGap[]): Promise<{ written: number; errors: string[] }> {
	await ensureDb();
	let written = 0;
	const errors: string[] = [];

	for (const gap of gaps) {
		const docId = `gap:${gap.id}`;
		try {
			await upsertDoc(docId, gap as unknown as Record<string, unknown>);
			written++;
		} catch (e) {
			errors.push(`${docId}: ${String(e)}`);
		}
	}

	return { written, errors };
}

export async function writeGapReport(report: GapReport): Promise<void> {
	await ensureDb();
	const docId = `run:gap-report:${report.runId}`;
	await upsertDoc(docId, report as unknown as Record<string, unknown>);
}

export async function readWikiCard(id: string): Promise<WikiCard | null> {
	const res = await couchFetch(`/${WIKI_DB}/${encodeURIComponent(id)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`CouchDB get failed for ${id}: ${res.status}`);
	return res.json() as Promise<WikiCard>;
}

export async function readGapDoc(gapId: string): Promise<WikiGap | null> {
	const docId = `gap:${gapId}`;
	const res = await couchFetch(`/${WIKI_DB}/${encodeURIComponent(docId)}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`CouchDB get failed for ${docId}: ${res.status}`);
	return res.json() as Promise<WikiGap>;
}
