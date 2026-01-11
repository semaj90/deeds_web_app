import fs from 'node:fs';
import path from 'node:path';
import { unifiedDiffFromTexts } from './unifiedDiff.js';
import type { PatchCandidate } from './diffTypes.js';

export class DiffGenerator {
 constructor(private readonly repoRoot: string) {}

 readText(repoRelPath: string): string {
 const abs = path.join(this.repoRoot, repoRelPath);
 return fs.readFileSync(abs, 'utf8');
 }

 createPatchCandidate(opts: {
 runId: string;
 filePath: string; // repo-relative
 beforeText?: string; // optional override
 afterText: string;
 reason: string;
 confidence: number;
 contextLines?: number; // default 3-5
 }): PatchCandidate {
 const beforeText = opts.beforeText ?? this.readText(opts.filePath);
 const { diffText, beforeSha256, afterSha256 } = unifiedDiffFromTexts({
 filePath: opts.filePath,
 beforeText,
 afterText: opts.afterText,
 contextLines: opts.contextLines ?? 3,
 });

 return {
 runId: opts.runId,
 filePath: opts.filePath,
 reason: opts.reason,
 confidence: Math.max(0, Math.min(1, opts.confidence)),
 beforeSha256,
 afterSha256,
 afterText: opts.afterText,
 diffText,
 contextLines: opts.contextLines ?? 3,
 createdAt: Date.now(),
 };
 }
}
