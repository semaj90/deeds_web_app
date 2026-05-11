/**
 * Loader 1 — `docs/graph/codebase-graph.json` → CodebaseGraph (in-memory).
 *
 * Phase A1.2 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * The graph JSON is the single largest input (~4 MB) and the only loader whose
 * failure aborts the regen run — a malformed JSON signals graphify itself is
 * broken upstream, which downstream cards cannot meaningfully paper over.
 *
 * Returns a typed in-memory copy with files re-indexed by `rel` path (the raw
 * JSON keys files by numeric index, which is useless for direct lookup).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
	CodebaseGraph,
	CodebaseGraphFile,
	CodebaseGraphDir,
	LoadGraphResult,
} from './types.js';

const DEFAULT_GRAPH_REL = 'docs/graph/codebase-graph.json';
const STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

export interface LoadGraphOptions {
	/** Absolute or repo-relative path to the graph JSON. Default: docs/graph/codebase-graph.json. */
	path?: string;
	/** Repo root used to resolve a relative path. Default: process.cwd(). */
	repoRoot?: string;
}

export async function loadGraph(opts: LoadGraphOptions = {}): Promise<LoadGraphResult> {
	const repoRoot = opts.repoRoot ?? process.cwd();
	const relPath  = opts.path ?? DEFAULT_GRAPH_REL;
	const absPath  = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);

	const raw = await readFile(absPath, 'utf-8');
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		// Malformed JSON is the one loader-level fatal: graphify is broken.
		throw new Error(`loadGraph: malformed JSON at ${absPath}: ${(err as Error).message}`);
	}

	const graph = normaliseGraph(parsed, absPath);

	const createdAtMs = Date.parse(graph.createdAt);
	const loadedAtMs  = Date.now();
	const staleMs     = Number.isFinite(createdAtMs) ? loadedAtMs - createdAtMs : 0;
	const staleWarning = staleMs > STALENESS_THRESHOLD_MS;

	return {
		graph,
		loadedAt:    new Date(loadedAtMs).toISOString(),
		staleMs,
		staleWarning,
		source:      absPath,
	};
}

// ── Internals ────────────────────────────────────────────────────────────────

function normaliseGraph(parsed: unknown, source: string): CodebaseGraph {
	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`loadGraph: expected object at root of ${source}`);
	}
	const root = parsed as Record<string, unknown>;

	const createdAt = typeof root.createdAt === 'string' ? root.createdAt : new Date(0).toISOString();
	const repoRoot  = typeof root.repoRoot  === 'string' ? root.repoRoot  : '';

	const files       = indexFilesByRel(root.files);
	const directories = indexDirsByRel(root.directories);

	return {
		createdAt,
		repoRoot,
		files,
		directories,
		fileCount: typeof root.fileCount === 'number' ? root.fileCount : files.size,
		dirCount:  typeof root.dirCount  === 'number' ? root.dirCount  : directories.size,
	};
}

function indexFilesByRel(input: unknown): Map<string, CodebaseGraphFile> {
	const out = new Map<string, CodebaseGraphFile>();
	if (!input) return out;

	// Two shapes seen in the wild:
	//   1. Object keyed by numeric index (current graphify output)
	//   2. Plain array (older snapshots)
	const entries: unknown[] = Array.isArray(input)
		? input
		: Object.values(input as Record<string, unknown>);

	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const f = entry as Record<string, unknown>;
		if (typeof f.rel !== 'string' || f.rel.length === 0) continue;
		out.set(f.rel, coerceFile(f));
	}
	return out;
}

function indexDirsByRel(input: unknown): Map<string, CodebaseGraphDir> {
	const out = new Map<string, CodebaseGraphDir>();
	if (!input) return out;

	// The graphify pipeline emits directories with a `dir` field (the directory
	// path) and most of its sibling metadata. Some snapshots use `rel` instead.
	// Tolerate both, plus accept either an array OR an object keyed by dirPath.
	const readKey = (d: Record<string, unknown>, fallback: string): string => {
		if (typeof d.rel === 'string' && d.rel.length > 0) return d.rel;
		if (typeof d.dir === 'string' && d.dir.length > 0) return d.dir;
		return fallback;
	};

	if (Array.isArray(input)) {
		for (const entry of input) {
			if (!entry || typeof entry !== 'object') continue;
			const d = entry as Record<string, unknown>;
			const rel = readKey(d, '');
			if (!rel) continue;
			out.set(rel, coerceDir(d, rel));
		}
		return out;
	}

	for (const [key, entry] of Object.entries(input as Record<string, unknown>)) {
		if (!entry || typeof entry !== 'object') continue;
		const d = entry as Record<string, unknown>;
		const rel = readKey(d, key);
		out.set(rel, coerceDir(d, rel));
	}
	return out;
}

function coerceFile(raw: Record<string, unknown>): CodebaseGraphFile {
	const strArr = (k: string): readonly string[] => {
		const v = raw[k];
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	};
	return {
		rel:           String(raw.rel),
		ext:           typeof raw.ext === 'string' ? raw.ext : '',
		tags:          strArr('tags'),
		summary:       typeof raw.summary === 'string' ? raw.summary : '',
		imports:       strArr('imports'),
		exports:       strArr('exports'),
		dynImports:    strArr('dynImports'),
		reExports:     strArr('reExports'),
		routeHandlers: strArr('routeHandlers'),
		drizzleRefs:   strArr('drizzleRefs'),
		isRoute:       raw.isRoute === true,
		isSvelteComp:  raw.isSvelteComp === true,
		isTest:        raw.isTest === true,
		lineCount:     typeof raw.lineCount === 'number' ? raw.lineCount : 0,
	};
}

function coerceDir(raw: Record<string, unknown>, fallbackRel: string): CodebaseGraphDir {
	const rel = typeof raw.rel === 'string' && raw.rel.length > 0 ? raw.rel : fallbackRel;
	const fileCount = typeof raw.fileCount === 'number' ? raw.fileCount : 0;
	// Preserve all extra fields so section builders can read them defensively.
	return { ...raw, rel, fileCount };
}
