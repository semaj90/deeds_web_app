/**
 * Phase 7: Error Brain Patch Integration Test
 *
 * End-to-end test of LLM → Patch → Apply workflow
 */

import { PatchGenerator } from '$lib/server/error-brain/patch-generator';
import { sha256 } from '$lib/services/error-analysis/diffs/unifiedDiff';
import { cleanupTest, setupTest } from '$lib/test-utils/setup';
import fs from 'fs/promises';
import path from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
;

const TEST_WORKSPACE = process.cwd();
const TEST_FILE = path.join(TEST_WORKSPACE, 'test-patch-file.ts');

describe('Error Brain Patch Integration', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 beforeAll(async () => {
 // Clean up any existing test file
 try {
 await fs.unlink(TEST_FILE);
 } catch {
 // File doesn't exist, that's fine
 }
 });

 it('should parse LLM response correctly', () => {
 const generator = new PatchGenerator(TEST_WORKSPACE);

 const llmResponse = `
Here's the fix:

\`\`\`typescript
// File: src/utils.ts
// Before:
const x = 1;
// After:
const x = 2;
// Reason: Fix incorrect value
\`\`\`

This should resolve the issue.
 `;

 const parsed = generator.parseLLMResponse(llmResponse);

 expect(parsed.fixes).toHaveLength(1);
 expect(parsed.fixes[0].filePath).toBe('src/utils.ts');
 expect(parsed.fixes[0].beforeCode).toBe('const x = 1;');
 expect(parsed.fixes[0].afterCode).toBe('const x = 2;');
 expect(parsed.fixes[0].explanation).toBe('Fix incorrect value');
 });

 it('should handle multiple fixes in one response', () => {
 const generator = new PatchGenerator(TEST_WORKSPACE);

 const llmResponse = `
I found two issues:

\`\`\`typescript
// File: src/file1.ts
// Before:
const a = 1;
// After:
const a = 10;
// Reason: Fix value
\`\`\`

And also:

\`\`\`javascript
// File: src/file2.js
// Before:
let b = 2;
// After:
let b = 20;
// Reason: Update variable
\`\`\`
 `;

 const parsed = generator.parseLLMResponse(llmResponse);

 expect(parsed.fixes).toHaveLength(2);
 expect(parsed.fixes[0].filePath).toBe('src/file1.ts');
 expect(parsed.fixes[1].filePath).toBe('src/file2.js');
 });

 it('should generate valid patch candidate', async () => {
 // Create a test file
 const originalContent = 'const test = "original";\n';
 await fs.writeFile(TEST_FILE, originalContent);

 const generator = new PatchGenerator(TEST_WORKSPACE);

 const llmResponse = `
\`\`\`typescript
// File: test-patch-file.ts
// Before:
const test = "original";
// After:
const test = "modified";
// Reason: Update test value
\`\`\`
 `;

 const patches = await generator.generatePatchesFromLLM('test-run-1', llmResponse);

 expect(patches).toHaveLength(1);

 const patch = patches[0];
 expect(patch.filePath).toBe('test-patch-file.ts');
 expect(patch.runId).toBe('test-run-1');
 expect(patch.beforeSha256).toBe(sha256(originalContent));
 expect(patch.confidence).toBe(0.85);
 expect(patch.diffText).toContain('-const test = "original"');
 expect(patch.diffText).toContain('+const test = "modified"');

 // Clean up
 await fs.unlink(TEST_FILE);
 });

 it('should skip patch if beforeCode not found in file', async () => {
 // Create a test file with different content
 const originalContent = 'const real = "content";\n';
 await fs.writeFile(TEST_FILE, originalContent);

 const generator = new PatchGenerator(TEST_WORKSPACE);

 const llmResponse = `
\`\`\`typescript
// File: test-patch-file.ts
// Before:
const fake = "doesntexist";
// After:
const fake = "modified";
// Reason: This won't match
\`\`\`
 `;

 const patches = await generator.generatePatchesFromLLM('test-run-2', llmResponse);

 // Should be empty because beforeCode doesn't match
 expect(patches).toHaveLength(0);

 // Clean up
 await fs.unlink(TEST_FILE);
 });
});


