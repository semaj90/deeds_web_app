import { createHash } from 'node:crypto';
import type {
	ClusterNote, DirectoryNote, PlaybookNote, ResearchNote, RetrievalNote, WikiNote,
} from '$lib/server/indexer/karpathy-wiki.js';

export interface ParsedWikiNote {
	note: WikiNote;
	contentHash: string;
	filePath: string;
	parsedAt: string;
}

export function parseMarkdownWikiNote(rawContent: string, filePath: string): ParsedWikiNote | null {
	const contentHash = sha1(rawContent);
	const { frontmatter, body } = splitFrontmatter(rawContent);
	const type = str(frontmatter.type);
	if (!type) return null;
	let note: WikiNote | null = null;
	switch (type) {
		case 'cluster':   note = parseCluster(frontmatter, body);   break;
		case 'retrieval': note = parseRetrieval(frontmatter, body); break;
		case 'playbook':  note = parsePlaybook(frontmatter, body);  break;
		case 'research':  note = parseResearch(frontmatter, body);  break;
		case 'directory': note = parseDirectory(frontmatter, body); break;
		default: return null;
	}
	if (!note) return null;
	return { note, contentHash, filePath, parsedAt: new Date().toISOString() };
}

type Fm = Record<string, unknown>;

function parseCluster(fm: Fm, body: string): ClusterNote {
	return {
		type: 'cluster',
		clusterId: num(fm.clusterId, 0),
		clusterType: fm.clusterType === 'som' ? 'som' : 'gpu',
		purpose: extractSection(body, 'Purpose') || str(fm.purpose) || '',
		summary: extractSection(body, 'Summary') || str(fm.summary) || '',
		dominantTags: arr(fm.tags).filter((t) => !['cluster', 'karpathy-wiki'].includes(t)),
		representativeFiles: extractWikiLinks(body, 'Representative Files'),
		topologicalNeighbors: extractNeighborIds(body),
		relatedErrors: extractBulletList(body, 'Related Errors'),
		patterns: extractBulletList(body, 'Patterns'),
		warnings: extractBulletList(body, 'Warnings'),
		pageRankTop5: extractPageRankTable(body),
		generatedAt: str(fm.generated) || new Date().toISOString(),
		version: num(fm.version, 1),
	};
}

function parseRetrieval(fm: Fm, body: string): RetrievalNote {
	return {
		type: 'retrieval',
		query: str(fm.query) || extractH1(body) || '',
		queryHash: str(fm.queryHash) || '',
		topChunks: extractChunkTable(body),
		topClusters: extractNeighborIds(body),
		cacheHit: parseCacheHit(str(fm.cacheHit)),
		pipeline: str(fm.pipeline) || '',
		actionItems: extractBulletList(body, 'Action Items'),
		overlapWithEdited: extractBulletList(body, 'Overlap with Edited Files'),
		durationMs: num(fm.durationMs, 0),
		generatedAt: str(fm.generated) || new Date().toISOString(),
	};
}

function parsePlaybook(fm: Fm, body: string): PlaybookNote {
	return {
		type: 'playbook',
		symptom: str(fm.symptom) || extractH1(body) || '',
		likelyCluster: fm.likelyCluster != null ? num(fm.likelyCluster, 0) : null,
		likelyDomain: str(fm.likelyDomain) || '',
		retrievalRoute: extractSection(body, 'Retrieval Route') || str(fm.retrievalRoute) || '',
		fixAttempts: extractFixAttempts(body),
		resolution: extractSection(body, 'Resolution') || '',
		fallbackLogic: extractSection(body, 'Fallback Logic') || '',
		generatedAt: str(fm.generated) || new Date().toISOString(),
		version: num(fm.version, 1),
	};
}

function parseResearch(fm: Fm, body: string): ResearchNote {
	return {
		type: 'research',
		query: str(fm.query) || extractH1(body) || '',
		topic: str(fm.topic) || '',
		source: str(fm.source) || '',
		trustTier: str(fm.trustTier) || 'unverified',
		gainScore: num(fm.gainScore, 0),
		externalFinding: extractSection(body, 'External Finding') || '',
		internalAlignment: extractSection(body, 'Internal Alignment') || '',
		recommendedAction: extractSection(body, 'Recommended Action') || '',
		linkedFiles: extractWikiLinks(body, 'Linked Files'),
		linkedClusters: extractBulletList(body, 'Linked Clusters'),
		tags: arr(fm.tags).filter((t) => !['research', 'karpathy-wiki'].includes(t)),
		generatedAt: str(fm.generated) || new Date().toISOString(),
	};
}

function parseDirectory(fm: Fm, body: string): DirectoryNote {
	return {
		type: 'directory',
		path: str(fm.dirPath) || str(fm.path) || '',
		summary: extractSection(body, 'Summary') || str(fm.summary) || '',
		dominantTags: arr(fm.tags).filter((t) => !['directory', 'karpathy-wiki'].includes(t)),
		fileCount: num(fm.fileCount, 0),
		auditScore: num(fm.auditScore, 0),
		warnings: extractBulletList(body, 'Warnings'),
		representativeFiles: extractWikiLinks(body, 'Representative Files'),
		generatedAt: str(fm.generated) || new Date().toISOString(),
		version: num(fm.version, 1),
	};
}

function splitFrontmatter(raw: string): { frontmatter: Fm; body: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: raw };
	const fm: Fm = {};
	for (const line of match[1].split('\n')) {
		const colon = line.indexOf(':');
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const val = line.slice(colon + 1).trim();
		fm[key] = parseYamlValue(val);
	}
	return { frontmatter: fm, body: match[2] };
}

function parseYamlValue(val: string): unknown {
	if (val.startsWith('[') && val.endsWith(']')) {
		return val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
	}
	if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
		return val.slice(1, -1);
	}
	if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
	if (val === 'true') return true;
	if (val === 'false') return false;
	if (val === 'null' || val === '~' || val === '') return null;
	return val;
}

function extractH1(body: string): string | null {
	const m = body.match(/^#\s+(.+)$/m);
	return m ? m[1].trim() : null;
}

function extractSection(body: string, heading: string): string | null {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp('^#{2,3}\\s+' + escaped + '\\s*$', 'm');
	const start = body.search(re);
	if (start === -1) return null;
	const afterHeading = body.slice(body.indexOf('\n', start) + 1);
	const nextHeading = afterHeading.search(/^#{2,3}\s+/m);
	const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
	return section.trim() || null;
}

function extractBulletList(body: string, heading: string): string[] {
	const section = extractSection(body, heading);
	if (!section) return [];
	return section.split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean);
}

function extractWikiLinks(body: string, heading: string): string[] {
	const section = extractSection(body, heading) ?? body;
	const matches = [...section.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)];
	return matches.map((m) => m[1].trim());
}

function extractNeighborIds(body: string): number[] {
	const matches = [...body.matchAll(/cluster-(?:gpu|som)-(\d+)/g)];
	return [...new Set(matches.map((m) => parseInt(m[1], 10)))];
}

function extractPageRankTable(body: string): Array<{ path: string; score: number }> {
	const section = extractSection(body, 'Top Files by PageRank') ?? '';
	const rows: Array<{ path: string; score: number }> = [];
	for (const line of section.split('\n')) {
		const m = line.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\].*?(\d+\.\d+)/);
		if (m) rows.push({ path: m[1], score: parseFloat(m[2]) });
	}
	return rows.slice(0, 5);
}

function extractChunkTable(body: string): Array<{ path: string; score: number; tags: string[] }> {
	const section = extractSection(body, 'Top Chunks') ?? '';
	const rows: Array<{ path: string; score: number; tags: string[] }> = [];
	for (const line of section.split('\n')) {
		const m = line.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\].*?(\d+\.\d+)/);
		if (m) rows.push({ path: m[1], score: parseFloat(m[2]), tags: [] });
	}
	return rows;
}

function extractFixAttempts(body: string): Array<{ attempt: string; outcome: 'success' | 'failure'; detail: string }> {
	const section = extractSection(body, 'Fix Attempts') ?? '';
	const results: Array<{ attempt: string; outcome: 'success' | 'failure'; detail: string }> = [];
	for (const line of section.split('\n')) {
		const m = line.match(/[-*]\s+(.+?)\s*[-—–]\s*(success|failure)[:\s]*(.*)$/i);
		if (m) results.push({ attempt: m[1].trim(), outcome: m[2].toLowerCase() as 'success' | 'failure', detail: m[3].trim() });
	}
	return results;
}

function str(v: unknown): string { if (v == null) return ''; return String(v).trim(); }
function num(v: unknown, fallback: number): number { const n = Number(v); return isNaN(n) ? fallback : n; }
function arr(v: unknown): string[] { if (Array.isArray(v)) return v.map(String); if (typeof v === 'string' && v) return [v]; return []; }
function parseCacheHit(v: string): 'L1' | 'L2' | 'L3' | 'miss' { if (v === 'L1' || v === 'L2' || v === 'L3') return v; return 'miss'; }
function sha1(content: string): string { return createHash('sha1').update(content, 'utf8').digest('hex'); }