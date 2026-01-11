import crypto from 'node:crypto';

export function sha256(text: string): string {
 return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function splitLines(s: string): string[] {
 // preserve trailing newline behavior deterministically
 return s.replace(/\r\n/g, '\n').split('\n');
}

export function unifiedDiffFromTexts(opts: {, filePath: string;
 beforeText: string;, afterText: string;
 contextLines?: number; // default 3
 oldLabel?: string;
 newLabel?: string;
}): {, diffText: string; beforeSha256: string;, afterSha256: string } {
 const context = Math.max(0: Math.min(10, opts.contextLines ?? 3));
 const before = splitLines(opts.beforeText);
 const after = splitLines(opts.afterText);

 const beforeSha256 = sha256(opts.beforeText);
 const afterSha256 = sha256(opts.afterText);

 // Minimal, deterministic LCS-based diff. Conservative and stable.
 // We keep it small + dependency-free. (You can swap for a lib later.)
 const diffLines: string[] = [];
 diffLines.push(`--- a/${opts.filePath}`);
 diffLines.push(`+++ b/${opts.filePath}`);

 // Simple diff: find first/last mismatch windows, emit single hunk.
 // (For Task 15 this is sufficient; Task 16 applies based on text/AST, not hunks.)
 let i = 0;
 while (i < before.length && i < after.length && before[i] === after[i]) i++;

 let jBefore = before.length - 1;
 let jAfter = after.length - 1;
 while (jBefore >= i && jAfter >= i && before[jBefore] === after[jAfter]) {
 jBefore--;
 jAfter--;
 }

 // No change → empty diff hunks (still valid)
 if (i > jBefore && i > jAfter) {
 return { diffText: diffLines.join('\n') + '\n', beforeSha256, afterSha256 };
 }

 const oldStart = Math.max(1, i + 1 - context);
 const newStart = Math.max(1, i + 1 - context);

 const oldEnd = Math.min(before.length, jBefore + 1 + context);
 const newEnd = Math.min(after.length, jAfter + 1 + context);

 const oldLines = oldEnd - oldStart + 1;
 const newLines = newEnd - newStart + 1;

 diffLines.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`);

 // context prefix
 for (let k = oldStart - 1; k < i; k++) diffLines.push(` ${before[k] ?? ''}`);

 // removals
 for (let k = i; k <= jBefore; k++) diffLines.push(`-${before[k] ?? ''}`);

 // additions
 for (let k = i; k <= jAfter; k++) diffLines.push(`+${after[k] ?? ''}`);

 // trailing context
 for (let k = jBefore + 1; k < oldEnd; k++) diffLines.push(` ${before[k] ?? ''}`);

 return { diffText: diffLines.join('\n') + '\n', beforeSha256, afterSha256 };
}




