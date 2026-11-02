import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { stripWfuComment } from './wfu-metadata.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/;

function sha256(bytes) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function safeSourcePath(root, source) {
	if (typeof source !== 'string' || source.includes('\\') || path.posix.isAbsolute(source)) return null;
	const parts = source.split('/');
	if (parts.includes('..') || parts.includes('.') || !/^openspec\/changes\/[^/]+\/tasks\.md$/.test(source)) return null;
	const resolved = path.resolve(root, ...parts);
	const relative = path.relative(root, resolved);
	return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved;
}

export function auditWorkboardSourceBindingsV1({ repoRoot, workboard }) {
	if (!path.isAbsolute(repoRoot) || workboard?.schema !== 'atlas.openspec.workboard.v1'
		|| !Array.isArray(workboard.taskInventory) || !workboard.sourceFileHashes
		|| typeof workboard.sourceFileHashes !== 'object' || Array.isArray(workboard.sourceFileHashes)) {
		throw new Error('WORKBOARD_SOURCE_AUDIT_INPUT_INVALID');
	}

	const fileCache = new Map();
	const rows = workboard.taskInventory.map((task) => ({
		taskKey: task?.taskKey ?? null,
		...verifyWorkboardTaskSourceBindingV1({
			repoRoot,
			task,
			sourceFileHashes: workboard.sourceFileHashes,
			fileCache,
		}),
	}));

	const statusCounts = rows.reduce((counts, row) => {
		counts[row.status] = (counts[row.status] ?? 0) + 1;
		return counts;
	}, {});
	return {
		schema: 'atlas.workboard-source-binding-audit.v1',
		status: rows.length > 0 && rows.every((row) => row.status === 'SOURCE_REFERENCE_CURRENT') ? 'VERIFIED' : 'PARTIAL',
		canonicalAuthority: false,
		writesPerformed: false,
		taskCount: workboard.taskInventory.length,
		sourceFileCount: fileCache.size,
		statusCounts,
		rows,
	};
}

export function verifyWorkboardTaskSourceBindingV1({ repoRoot, task, sourceFileHashes, fileCache = new Map() }) {
	const base = { source: task?.source ?? null, line: task?.line ?? null, sourceRevision: null };
	if (!path.isAbsolute(repoRoot) || !sourceFileHashes || typeof sourceFileHashes !== 'object'
		|| typeof task?.text !== 'string') {
		return { ...base, status: 'SOURCE_REFERENCE_INVALID' };
	}
	const filePath = safeSourcePath(repoRoot, task?.source);
	if (!filePath || !Number.isSafeInteger(task?.line) || task.line < 1) {
		return { ...base, status: 'SOURCE_REFERENCE_INVALID' };
	}

	const expectedRevision = sourceFileHashes[task.source];
	if (typeof expectedRevision !== 'string' || !SHA256.test(expectedRevision)) {
		return { ...base, status: 'WORKBOARD_SOURCE_HASH_MISSING_OR_INVALID' };
	}

	let file = fileCache.get(task.source);
	if (!file) {
		try {
			const realRoot = realpathSync(repoRoot);
			const realFile = realpathSync(filePath);
			const realRelative = path.relative(realRoot, realFile);
			if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
				return { ...base, status: 'SOURCE_REFERENCE_INVALID' };
			}
			const bytes = readFileSync(realFile);
			file = { revision: sha256(bytes), lines: bytes.toString('utf8').split(/\r?\n/) };
		} catch {
			return { ...base, status: 'SOURCE_FILE_UNAVAILABLE' };
		}
		fileCache.set(task.source, file);
	}

	if (file.revision !== expectedRevision) {
		return { ...base, status: 'SOURCE_FILE_REVISION_MISMATCH', expectedRevision, observedRevision: file.revision };
	}

	const sourceLine = file.lines[task.line - 1];
	const match = typeof sourceLine === 'string' ? /^\s*-\s*\[([ xX])\]\s+(.*)$/.exec(sourceLine) : null;
	if (!match || stripWfuComment(match[2].trim()) !== task.text) {
		return { ...base, status: 'SOURCE_LINE_OR_TASK_TEXT_MISMATCH', sourceRevision: expectedRevision };
	}

	const sourceTaskText = stripWfuComment(match[2].trim());
	return {
		...base,
		status: 'SOURCE_REFERENCE_CURRENT',
		sourceRevision: expectedRevision,
		sourceFileRef: task.source,
		sourceLine: task.line,
		taskTextSha256: sha256(Buffer.from(task.text, 'utf8')),
		sourceTaskTextSha256: sha256(Buffer.from(sourceTaskText, 'utf8')),
	};
}
