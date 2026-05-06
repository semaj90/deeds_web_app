/**
 * Obsidian Local REST API Client
 *
 * Bridges the legal AI platform with Obsidian notebooks via the
 * obsidian-local-rest-api plugin (https://github.com/coddingtonbear/obsidian-local-rest-api).
 *
 * Features:
 *   - Read/write/search Obsidian vault notes
 *   - Sync case research notes bidirectionally
 *   - Export graph analysis results as Obsidian markdown
 *   - Import Obsidian research into knowledge base (auto-backfill)
 *
 * Requires: Obsidian running with Local REST API plugin enabled
 * Default: https://127.0.0.1:27124 (HTTPS with self-signed cert)
 */

import { ENV } from '$lib/server/env.server.js';

const OBSIDIAN_URL = ENV.OBSIDIAN_URL ?? 'https://127.0.0.1:27124';
const OBSIDIAN_API_KEY = ENV.OBSIDIAN_API_KEY ?? '';

// Plugin's HTTPS listener uses a self-signed cert. Build a permissive undici
// Agent ONLY for loopback HTTPS (so prod HTTPS calls still validate normally).
// Lazy-loaded singleton — keeps import cost off the cold path.
const IS_LOOPBACK_HTTPS = /^https:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(OBSIDIAN_URL);
let _agentPromise: Promise<unknown> | null = null;
async function loopbackAgent(): Promise<unknown> {
	if (!IS_LOOPBACK_HTTPS) return undefined;
	if (!_agentPromise) {
		_agentPromise = import('undici').then(({ Agent }) => new Agent({
			connect: { rejectUnauthorized: false },
		}));
	}
	return _agentPromise;
}

/**
 * Fetch wrapper that injects the loopback-HTTPS dispatcher when needed.
 * Uses native fetch + undici dispatcher option.
 */
async function obsidianFetch(input: string, init: RequestInit = {}): Promise<Response> {
	const dispatcher = await loopbackAgent();
	const opts = dispatcher
		? ({ ...init, dispatcher } as RequestInit & { dispatcher: unknown })
		: init;
	return fetch(input, opts);
}

interface ObsidianNote {
	path: string;
	content: string;
	tags?: string[];
	frontmatter?: Record<string, unknown>;
}

interface ObsidianSearchResult {
	filename: string;
	score: number;
	matches?: Array<{ match: { start: number; end: number }; context: string }>;
}

/** Check if Obsidian is reachable */
export async function isObsidianAvailable(): Promise<boolean> {
	if (!OBSIDIAN_API_KEY) return false;
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/`, {
			headers: { Authorization: `Bearer ${OBSIDIAN_API_KEY}` },
			signal: AbortSignal.timeout(3_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Fetch headers with auth */
function headers(): Record<string, string> {
	return {
		Authorization: `Bearer ${OBSIDIAN_API_KEY}`,
		'Content-Type': 'application/json',
	};
}

/**
 * Read a note from Obsidian vault by path.
 * Path is relative to vault root (e.g. "Cases/Smith v Johnson.md")
 */
export async function readNote(path: string): Promise<ObsidianNote | null> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/vault/${encodeURIComponent(path)}`, {
			headers: { Authorization: `Bearer ${OBSIDIAN_API_KEY}`, Accept: 'application/vnd.olrapi.note+json' },
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) return null;
		const data = await res.json();
		return {
			path,
			content: data.content ?? '',
			tags: data.tags,
			frontmatter: data.frontmatter,
		};
	} catch {
		return null;
	}
}

/**
 * Write/create a note in Obsidian vault.
 * Creates parent folders automatically.
 * Marks the path in the vault watcher write-guard so the bidirectional watcher
 * doesn't echo this server-originated write back to CouchDB.
 */
export async function writeNote(path: string, content: string): Promise<boolean> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/vault/${encodeURIComponent(path)}`, {
			method: 'PUT',
			headers: { ...headers(), 'Content-Type': 'text/markdown' },
			body: content,
			signal: AbortSignal.timeout(5_000),
		});
		if (res.ok && ENV.OBSIDIAN_VAULT_PATH) {
			// Notify the watcher that we just wrote this path so it ignores the FS event
			import('$lib/server/obsidian/wiki-vault-watcher.js')
				.then(({ markServerWrite }) => {
					const absPath = `${ENV.OBSIDIAN_VAULT_PATH}/${path}`.replace(/\\/g, '/');
					markServerWrite(absPath);
				})
				.catch(() => { /* watcher not loaded — no-op */ });
		}
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Append content to an existing note (or create if it doesn't exist).
 */
export async function appendToNote(path: string, content: string): Promise<boolean> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/vault/${encodeURIComponent(path)}`, {
			method: 'POST',
			headers: { ...headers(), 'Content-Type': 'text/markdown' },
			body: content,
			signal: AbortSignal.timeout(5_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Search Obsidian vault for notes matching a query.
 * Uses Obsidian's built-in search via the REST API.
 */
export async function searchNotes(query: string): Promise<ObsidianSearchResult[]> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/search/simple/`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ query }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

/**
 * List all notes in a folder.
 */
export async function listFolder(folder: string): Promise<string[]> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/vault/${encodeURIComponent(folder)}/`, {
			headers: headers(),
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data.files) ? data.files : [];
	} catch {
		return [];
	}
}

/**
 * Delete a note from the vault.
 */
export async function deleteNote(path: string): Promise<boolean> {
	try {
		const res = await obsidianFetch(`${OBSIDIAN_URL}/vault/${encodeURIComponent(path)}`, {
			method: 'DELETE',
			headers: headers(),
			signal: AbortSignal.timeout(5_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}

// ── High-Level Integration Functions ──────────────────────────────────

/**
 * Export a case analysis to Obsidian as a structured note.
 */
export async function exportCaseToObsidian(
	caseTitle: string,
	analysis: {
		pageRank?: Array<{ title: string; score: number; label: string }>;
		communities?: Array<{ communityId: number; size: number; members: Array<{ title: string }> }>;
		summary?: string;
	}
): Promise<boolean> {
	const date = new Date().toISOString().split('T')[0];
	const safeTitle = caseTitle.replace(/[/\\:*?"<>|]/g, '-');

	let md = `---\ntype: case-analysis\ndate: ${date}\nsource: legal-ai-platform\n---\n\n`;
	md += `# ${caseTitle}\n\n`;

	if (analysis.summary) {
		md += `## Summary\n${analysis.summary}\n\n`;
	}

	if (analysis.pageRank && analysis.pageRank.length > 0) {
		md += `## PageRank Analysis\n`;
		md += `| Rank | Node | Type | Score |\n|------|------|------|-------|\n`;
		analysis.pageRank.slice(0, 20).forEach((node, i) => {
			md += `| ${i + 1} | ${node.title || '(untitled)'} | ${node.label} | ${node.score.toFixed(4)} |\n`;
		});
		md += '\n';
	}

	if (analysis.communities && analysis.communities.length > 0) {
		md += `## Communities Detected\n`;
		const meaningful = analysis.communities.filter((c) => c.size > 1);
		for (const community of meaningful.slice(0, 10)) {
			md += `### Community ${community.communityId} (${community.size} members)\n`;
			for (const member of community.members.slice(0, 10)) {
				md += `- ${member.title || '(untitled)'}\n`;
			}
			md += '\n';
		}
	}

	md += `\n---\n*Generated by Legal AI Platform on ${new Date().toISOString()}*\n`;

	return writeNote(`Legal AI/Cases/${safeTitle}.md`, md);
}

/**
 * Import research notes from Obsidian into the knowledge base.
 * Reads notes from a folder and returns them for embedding + indexing.
 */
export async function importResearchNotes(
	folder: string
): Promise<Array<{ path: string; content: string; title: string }>> {
	const files = await listFolder(folder);
	const notes: Array<{ path: string; content: string; title: string }> = [];

	for (const file of files.slice(0, 50)) {
		if (!file.endsWith('.md')) continue;
		const note = await readNote(`${folder}/${file}`);
		if (note && note.content.length > 50) {
			notes.push({
				path: `${folder}/${file}`,
				content: note.content,
				title: file.replace('.md', ''),
			});
		}
	}

	return notes;
}
