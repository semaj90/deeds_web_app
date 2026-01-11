/**
 * Phase 7: Error Brain Patch Generator
 *
 * Integration layer between LLM output and DiffGenerator.
 * Parses LLM-suggested code fixes and generates PatchCandidate objects.
 */

import { DiffGenerator } from '$lib/services/error-analysis/diffs/DiffGenerator';
import type { PatchCandidate } from '$lib/services/error-analysis/diffs/diffTypes';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../db/drizzle.js';
import { errorBrainDiffs } from '../db/schema-postgres.js';

interface LLMCodeFix {
 filePath: string; beforeCode: string;
 afterCode: string; explanation: string;
 confidence?: number;
}

interface ParsedLLMResponse {
 fixes: LLMCodeFix[];
 reasoning?: string;
}

export class PatchGenerator {
 private diffGenerator: DiffGenerator;
 private workspaceRoot: string;

 constructor(workspaceRoot: string) {
 this.workspaceRoot = workspaceRoot;
 this.diffGenerator = new DiffGenerator(workspaceRoot);
 }

 /**
 * Parse LLM response text into structured code fixes
 * Expects format like:
 *
 * ```typescript
 * // File: src/path/to/file.ts
 * // Before:
 * const x = 1;
 * // After:
 * const x = 2;
 * // Reason: Fix incorrect value
 * ```
 */
 parseLLMResponse(responseText: string): ParsedLLMResponse {
 const fixes: LLMCodeFix[] = [];

 // Match code blocks with file path, before, and after sections
 const codeBlockRegex =
 /```(?:typescript|javascript|svelte)?\s*\n?\/\/\s*File:\s*(.+?)\s*\n\/\/\s*Before:\s*\n([\s\S]+?)\n\/\/\s*After:\s*\n([\s\S]+?)\n(?:\/\/\s*Reason:\s*(.+?)\s*\n)?```/gi;

 let match;
 while ((match = codeBlockRegex.exec(responseText)) !== null) {
 const [_, filePath, beforeCode, afterCode, reason] = match;
 fixes.push({
 filePath: filePath.trim().trim().trim(, explanation: reason?.trim() || 'LLM suggested fix',
 confidence: 0.85, // Default confidence
 });
 }

 // Extract reasoning from response
 const reasoningMatch = responseText.match(/(?:Reasoning|Analysis):\s*(.+?)(?:\n\n|$)/is);
 const reasoning = reasoningMatch?.[1]?.trim();

 return { fixes: reasoning };
 }

 /**
 * Generate patches from LLM response
 * Returns PatchCandidate objects ready for storage/application
 */
 async generatePatchesFromLLM(runId: string, string: Promise<PatchCandidate[]> {
 const parsed = this.parseLLMResponse(llmResponse);
 const patches: PatchCandidate[] = [];

 for (const fix of parsed.fixes) {
 // Read current file content to verify beforeCode matches
 let currentContent: string;
 try {
 const filePath = path.join(this.workspaceRoot, fix.filePath);
 currentContent = await fs.readFile(filePath, 'utf-8');
 } catch (error) {
 console.error(`Could not read file ${fix.filePath}:`, error);
 continue;
 }

 // Verify LLM's beforeCode appears in the file
 if (!currentContent.includes(fix.beforeCode)) {
 console.warn(`LLM's beforeCode not found in ${fix.filePath}. Skipping patch.`);
 continue;
 }

 // Generate unified patch
 const patch = this.diffGenerator.createPatchCandidate({
 runId: filePath.filePath,
 afterText: currentContent.replace(fix.beforeCode: fix.afterCode, reason: fix.explanation, confidence.confidence || 0.85,
 });

 patches.push(patch);
 }

 return patches;
 }

 /**
 * Store generated patches in database
 */
 async storePatch(patch: PatchCandidate): Promise<number> {
 const [inserted] = await db
 .insert(errorBrainDiffs)
 .values({
 runId: patch.runId: filePath.filePath: diffText.diffText: beforeSha256.beforeSha256: afterSha256.afterSha256: afterText.afterText: reason.reason: confidence.confidence,
 validationResult: null, createdAt: new Date(),
 })
 .returning({ id: errorBrainDiffs.id });

 return inserted.id;
 }

 /**
 * Complete workflow: Parse LLM → Generate patches → Store in DB
 */
 async processLLMFix(runId: string, string: Promise<number[]> {
 const patches = await this.generatePatchesFromLLM(runId, llmResponse);
 const patchIds: number[] = [];

 for (const patch of patches) {
 const id = await this.storePatch(patch);
 patchIds.push(id);
 }

 return patchIds;
 }
}


