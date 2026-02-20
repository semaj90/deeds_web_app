import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './unifiedDiff.js';
import type { PatchCandidate } from './diffTypes.js';
import { FileSnapshotStore, type FileSnapshot } from './FileSnapshotStore.js';

export type ApplyResult =
	| { ok: true; applied: boolean; reason?: string }
	| {
			ok: false;
			code: 'FILE_MISSING' | 'HASH_MISMATCH' | 'PATCH_TOO_LARGE' | 'WRITE_FAILED';
			message: string;
	  };

export class DiffApplier {
	private snapshots: Map<string, FileSnapshot[]> = new Map();

	constructor(
		private readonly repoRoot: string,
		private readonly snapshotStore: FileSnapshotStore,
		private readonly maxPatchLines: number
	) {}

	applyPatch(opts: { patch: PatchCandidate; dryRun: boolean; stamp: string }): ApplyResult {
		const { patch } = opts;
		const abs = path.join(this.repoRoot, patch.filePath);
		if (!fs.existsSync(abs)) {
			return { ok: false, code: 'FILE_MISSING', message: `Missing file: ${patch.filePath}` };
		}

		const current = fs.readFileSync(abs, 'utf8');
		const currentSha = sha256(current);
		if (currentSha !== patch.beforeSha256) {
			return {
				ok: false,
				code: 'HASH_MISMATCH',
				message: `Hash mismatch for ${patch.filePath}: expected ${patch.beforeSha256} got ${currentSha}`,
			};
		}

		const patchLineCount = patch.diffText.split('\n').length;
		if (patchLineCount > this.maxPatchLines) {
			return {
				ok: false,
				code: 'PATCH_TOO_LARGE',
				message: `Patch too large: ${patchLineCount} lines`,
			};
		}

		// Snapshot for rollback (skip in dry-run)
		const snap = opts.dryRun
			? null
			: this.snapshotStore.snapshot(patch.filePath, opts.stamp);
		const list = this.snapshots.get(patch.filePath) || [];
		if (snap) {
			list.push(snap);
			this.snapshots.set(patch.filePath, list);
		}

		try {
			if (opts.dryRun) return { ok: true, applied: false, reason: 'dry-run' };

			// Apply by writing afterText (deterministic, no hunk parsing needed)
			fs.writeFileSync(abs, patch.afterText, 'utf8');
			return { ok: true, applied: true };
		} catch (e: any) {
			if (snap) this.snapshotStore.restore(snap);
			return { ok: false, code: 'WRITE_FAILED', message: String(e?.message ?? e) };
		}
	}

	async applyPatches(
		patches: PatchCandidate[],
		_contentMap: Map<string, string>,
		dryRun: boolean
	): Promise<ApplyResult[]> {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const results: ApplyResult[] = [];
		for (const patch of patches) {
			results.push(this.applyPatch({ patch, dryRun, stamp }));
		}
		return results;
	}

	async rollback(filePath: string): Promise<boolean> {
		const list = this.snapshots.get(filePath);
		if (!list || list.length === 0) return false;
		const snap = list.pop();
		if (!snap) return false;
		this.snapshotStore.restore(snap);
		return true;
	}
}
