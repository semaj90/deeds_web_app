import type { WikiCard, WikiGap, GapReport } from './types.js';
import { getRedis } from '$lib/server/redis.js';

// ─────────────────────────────────────────────────────────────────────────────
// wiki-redis-cache.ts
//
// Caches hot wiki/gap paths in Redis for fast ACE lookups.
//
// Key schema:
//   wiki:page:{slug}          — WikiCard JSON (TTL 1h)
//   wiki:gap:{gapId}          — WikiGap JSON (TTL 1h)
//   wiki:file:{filePath}      — JSON array of gap IDs affecting this file (TTL 1h)
//   wiki:symbol:{symbol}      — JSON array of gap IDs affecting this symbol (TTL 1h)
//   wiki:cluster:{clusterId}  — JSON array of card IDs for this cluster (TTL 1h)
//   wiki:gap:report:latest    — Latest GapReport summary (TTL 10min)
// ─────────────────────────────────────────────────────────────────────────────

const CARD_TTL = 3600;       // 1h
const REPORT_TTL = 600;      // 10min

function slugFromCardId(id: string): string {
	// "wiki:ace-multi-lane-retrieval" → "ace-multi-lane-retrieval"
	return id.replace(/^wiki:/, '');
}

export async function cacheWikiCards(cards: WikiCard[]): Promise<void> {
	const redis = getRedis();
	const pipe = redis.pipeline();

	for (const card of cards) {
		const slug = slugFromCardId(card.id);
		pipe.setex(`wiki:page:${slug}`, CARD_TTL, JSON.stringify(card));
	}

	await pipe.exec();
}

export async function cacheGapDocs(gaps: WikiGap[]): Promise<{
	gapsWritten: number;
	fileIndexEntries: number;
	symbolIndexEntries: number;
}> {
	const redis = getRedis();
	const pipe = redis.pipeline();

	// Build reverse indexes: file → [gapId], symbol → [gapId]
	const fileIndex = new Map<string, string[]>();
	const symbolIndex = new Map<string, string[]>();

	for (const gap of gaps) {
		if (gap.status !== 'open') continue; // Only cache open gaps for ACE lookup

		pipe.setex(`wiki:gap:${gap.id}`, CARD_TTL, JSON.stringify(gap));

		for (const f of gap.affectedFiles) {
			const list = fileIndex.get(f) ?? [];
			list.push(gap.id);
			fileIndex.set(f, list);
		}
		for (const s of gap.affectedSymbols) {
			const list = symbolIndex.get(s) ?? [];
			list.push(gap.id);
			symbolIndex.set(s, list);
		}
	}

	for (const [filePath, gapIds] of fileIndex) {
		pipe.setex(`wiki:file:${filePath}`, CARD_TTL, JSON.stringify(gapIds));
	}
	for (const [symbol, gapIds] of symbolIndex) {
		pipe.setex(`wiki:symbol:${symbol}`, CARD_TTL, JSON.stringify(gapIds));
	}

	await pipe.exec();

	return {
		gapsWritten: gaps.filter((g) => g.status === 'open').length,
		fileIndexEntries: fileIndex.size,
		symbolIndexEntries: symbolIndex.size,
	};
}

export async function cacheGapReportSummary(report: GapReport): Promise<void> {
	const redis = getRedis();
	await redis.setex('wiki:gap:report:latest', REPORT_TTL, JSON.stringify(report.summary));
}

// ── Lookup helpers for ACE context assembly ──────────────────────────────────

export async function getWikiCardForSlug(slug: string): Promise<WikiCard | null> {
	const redis = getRedis();
	const raw = await redis.get(`wiki:page:${slug}`).catch(() => null);
	if (!raw) return null;
	try { return JSON.parse(raw) as WikiCard; } catch { return null; }
}

export async function getGapIdsForFile(filePath: string): Promise<string[]> {
	const redis = getRedis();
	const raw = await redis.get(`wiki:file:${filePath}`).catch(() => null);
	if (!raw) return [];
	try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function getGapIdsForSymbol(symbol: string): Promise<string[]> {
	const redis = getRedis();
	const raw = await redis.get(`wiki:symbol:${symbol}`).catch(() => null);
	if (!raw) return [];
	try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function getOpenGapDoc(gapId: string): Promise<WikiGap | null> {
	const redis = getRedis();
	const raw = await redis.get(`wiki:gap:${gapId}`).catch(() => null);
	if (!raw) return null;
	try { return JSON.parse(raw) as WikiGap; } catch { return null; }
}

export async function getGapReportSummary(): Promise<GapReport['summary'] | null> {
	const redis = getRedis();
	const raw = await redis.get('wiki:gap:report:latest').catch(() => null);
	if (!raw) return null;
	try { return JSON.parse(raw) as GapReport['summary']; } catch { return null; }
}

// ── ACE context injection ────────────────────────────────────────────────────

export async function fetchWikiContextForFile(filePath: string): Promise<string> {
	const gapIds = await getGapIdsForFile(filePath);
	if (gapIds.length === 0) return '';

	const gaps = await Promise.all(gapIds.map(getOpenGapDoc));
	const open = gaps.filter(Boolean) as WikiGap[];
	if (open.length === 0) return '';

	const lines = ['\n## Wiki Gap Context'];
	for (const g of open.slice(0, 3)) {
		lines.push(`### [${g.severity}] ${g.id}: ${g.title}`);
		lines.push(g.summary);
		lines.push(`**Patch**: ${g.patch.slice(0, 200)}`);
	}
	return lines.join('\n');
}
