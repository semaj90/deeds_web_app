/**
 * Phase A5 — LLMS.md writer (filesystem layer).
 *
 * One write per directory. Reads any existing LLMS.md, merges fresh
 * auto-blocks via `mergeCardIntoMarkdown`, writes back ONLY if the body
 * differs (idempotent — no mtime churn on unchanged dirs).
 *
 * Same belt-and-braces test env gate as the CouchDB / Qdrant / telemetry
 * writers: live filesystem writes are blocked under VITEST unless the
 * caller passes `allowLiveWritesInTests: true`.
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { mergeCardIntoMarkdown } from '../markdown/auto-blocks.js';
import type { AutoBlockId } from '../markdown/auto-blocks.js';
import type { AgentsDirectoryCard } from '../../agents-card-store.js';

const LLMS_MD_FILENAME = 'LLMS.md';

export interface MarkdownWriteOptions {
	enabled?:  boolean;
	/** Repo root used to resolve `dirPath` against the filesystem. Default: process.cwd(). */
	repoRoot?: string;
	allowLiveWritesInTests?: boolean;
	/** Override fs read for tests. */
	readFileFn?:  (absPath: string) => Promise<string | null>;
	/** Override fs write for tests. */
	writeFileFn?: (absPath: string, body: string) => Promise<void>;
}

export interface MarkdownWriteResult {
	wrote:          boolean;
	skipped:        'disabled' | 'unchanged' | 'test-env-blocked' | null;
	absPath:        string;
	bytesWritten:   number;
	replacedBlocks: AutoBlockId[];
	appendedBlocks: AutoBlockId[];
	error?:         string;
}

function isTestEnv(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

export async function writeCardMarkdown(
	card: AgentsDirectoryCard,
	opts: MarkdownWriteOptions = {},
): Promise<MarkdownWriteResult> {
	const repoRoot = opts.repoRoot ?? process.cwd();
	const absPath  = path.join(repoRoot, card.dirPath, LLMS_MD_FILENAME);
	const empty: MarkdownWriteResult = {
		wrote: false, skipped: 'disabled', absPath, bytesWritten: 0,
		replacedBlocks: [], appendedBlocks: [],
	};

	if (!opts.enabled) {
		return empty;
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return { ...empty, skipped: 'test-env-blocked' };
	}

	const readFn  = opts.readFileFn  ?? defaultReader;
	const writeFn = opts.writeFileFn ?? defaultWriter;

	try {
		const existing = await readFn(absPath);
		const merged   = mergeCardIntoMarkdown(card, existing);
		if (!merged.changed) {
			return { ...empty, skipped: 'unchanged', replacedBlocks: merged.replacedBlocks, appendedBlocks: merged.appendedBlocks };
		}
		await writeFn(absPath, merged.body);
		return {
			wrote:          true,
			skipped:        null,
			absPath,
			bytesWritten:   Buffer.byteLength(merged.body, 'utf8'),
			replacedBlocks: merged.replacedBlocks,
			appendedBlocks: merged.appendedBlocks,
		};
	} catch (err) {
		return { ...empty, skipped: null, error: (err as Error)?.message ?? String(err) };
	}
}

// ── Default fs adapters (real I/O) ───────────────────────────────────────────

async function defaultReader(absPath: string): Promise<string | null> {
	if (!existsSync(absPath)) return null;
	try {
		return await readFile(absPath, 'utf-8');
	} catch {
		return null;
	}
}

async function defaultWriter(absPath: string, body: string): Promise<void> {
	await mkdir(path.dirname(absPath), { recursive: true });
	await writeFile(absPath, body, 'utf-8');
}
