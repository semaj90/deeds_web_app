import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';

const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const manifestPath = '.tmp/atlas/quick-hit-taskboard-preview-v1.json';
const source = z.object({
	sourceRef: z.string().regex(/^openspec\/changes\/[a-z0-9][a-z0-9._-]*\/tasks\.md$/),
	sourceLine: z.number().int().positive(),
	taskText: z.string().min(1).max(2048),
	taskHash: sha,
	sourceFileSha256: sha,
	sourceRevision: sha.nullable(),
	taskKey: z.string().min(1).max(256).nullable(),
	identityStatus: z.enum(['SOURCE_MATCH', 'UNRESOLVED']),
	canonicalTaskKeyCandidate: z.string().min(1).max(256).nullable(),
	blockers: z.array(z.string().max(512)).max(8),
	acceptanceGates: z.array(z.string().min(1).max(1024)).min(1).max(8),
	reviewRequired: z.literal(true),
});

const manifest = z.object({
	schema: z.literal('atlas.task-source-batch-prefill-descriptor.v1'),
	mode: z.literal('PREVIEW_ONLY'),
	dispatchable: z.literal(false),
	canonicalAuthority: z.literal(false),
	modelRouting: z.literal('NOT_INVOKED'),
	createdAt: z.string().datetime(),
	sources: z.array(source).max(3),
});

export async function loadQuickHitPreview(workspace = process.cwd()) {
	for (const root of [workspace, resolve(workspace, '..')]) {
		const path = resolve(root, manifestPath);
		try {
			if ((await stat(path)).size > 64 * 1024) return { status: 'INVALID', sources: [] };
			const parsed = manifest.safeParse(JSON.parse(await readFile(path, 'utf8')));
			if (!parsed.success) return { status: 'INVALID', sources: [] };

			const realRoot = await realpath(root);
			const sources = await Promise.all(parsed.data.sources.map(async (entry) => {
				const sourcePath = await realpath(resolve(root, entry.sourceRef)).catch(() => null);
				if (!sourcePath) return { ...entry, current: false };
				const relativePath = relative(realRoot, sourcePath);
				if (relativePath.startsWith('..') || isAbsolute(relativePath)) return { ...entry, current: false };
				const bytes = await readFile(sourcePath).catch(() => null);
				if (!bytes) return { ...entry, current: false };
				const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
				const line = bytes.toString('utf8').split(/\r?\n/)[entry.sourceLine - 1];
				const text = line?.match(/^\s*[-*+]\s*\[[ ~]\]\s+(.*)$/)?.[1];
				const normalized = text?.replace(/<!--\s*wfu\s*:[\s\S]*?-->/gi, '').trim();
				return { ...entry, current: digest === entry.sourceFileSha256 && normalized === entry.taskText };
			}));
			return { status: 'AVAILABLE', sources };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { status: 'INVALID', sources: [] };
		}
	}
	return { status: 'MISSING', sources: [] };
}
