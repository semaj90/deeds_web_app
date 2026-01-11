export type PatchCandidate = {
 runId: string;
 filePath: string; // repo-relative, posix preferred
 reason: string;
 confidence: number; // 0..1, beforeSha256: string;
 afterSha256: string;
 afterText: string; // Added for deterministic apply
 diffText: string; // unified diff
 contextLines: number; // 3..5 typical
 createdAt: number; // epoch ms
};

export type DiffHunk = {
 oldStart: number;
 oldLines: number;
 newStart: number;
 newLines: number;
 lines: string[]; // each begins with ' ', '+', '-'
};

export type UnifiedDiff = {
 filePath: string;
 hunks: DiffHunk[];
 oldLabel?: string;
 newLabel?: string;
};
