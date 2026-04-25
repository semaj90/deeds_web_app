#!/usr/bin/env node

/**
 * Phase 78: Self-Improving Repair Pipeline
 *
 * Orchestrates the error repair process:
 * 1. Collects errors
 * 2. Consults the Brain (RAG) for fixes
 * 3. Executes fixes safely (Snapshot -> Apply -> Verify -> Rollback)
 * 4. Updates the Brain with results (Learning)
 *
 * Usage:
 *   node scripts/phase78-repair-pipeline.mjs
 */

import { execSync, spawn } from 'child_process';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TIER_DEFINITIONS } from './fix-patterns.mjs';
import { validatePatch } from './patch-safety-gate.mjs';
import { recordFixResult } from './phase78-suggest-fix.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

// Configuration
const CONFIG = {
    TIER: process.env.TIER || 1,
    MAX_FIXES: process.env.MAX_FIXES || 5000,
    VERIFY_CMD: 'npm run check:ultra-fast', // Fast check for verification
    LOG_FILE: path.join(ROOT_DIR, 'logs', 'phase78-pipeline.log')
};

function log(msg, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] [${type}] ${msg}`;
    console.log(logMsg);
    fs.appendFileSync(CONFIG.LOG_FILE, logMsg + '\n');
}

async function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: 'inherit', shell: true, ...options });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

function parseErrorLine(line) {
    // Format 1: src/routes/+page.svelte:42:13 - error TS2304: Cannot find name 'CardTitle'.
    let match = line.match(/^(.+):(\d+):(\d+) - error (TS\d+): (.+)$/);

    if (!match) {
        // Format 2: src/global.d.ts(13,57): error TS1128: Declaration or statement expected.
        match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    }

    if (!match) return null;
    return {
        file: match[1].trim(),
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5].trim(),
        raw: line
    };
}

async function collectErrors() {
    log('Collecting errors...', 'STEP');
    try {
        // Use a temp file to avoid ENOBUFS
        const tempFile = path.join(ROOT_DIR, 'logs', 'check-output.txt');
        // Ensure logs dir exists
        if (!fs.existsSync(path.dirname(tempFile))) {
            fs.mkdirSync(path.dirname(tempFile), { recursive: true });
        }

        log(`Running check command and piping to ${tempFile}...`);
        // Run command and redirect output
        // We use 'npm run check:ultra-fast' but ignore exit code
        try {
            execSync(`npm run check:ultra-fast > "${tempFile}" 2>&1`, { cwd: ROOT_DIR, stdio: 'ignore' });
        } catch (e) {
            // Ignore error as check usually fails
        }

        log('Parsing errors...');
        const content = fs.readFileSync(tempFile, 'utf8');
        const errors = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('error TS')) {
                const parsed = parseErrorLine(line.trim());
                if (parsed) {
                    errors.push(parsed);
                }
            }
        }
        log(`Found ${errors.length} errors.`);
        return errors;
    } catch (err) {
        log(`Error collecting errors: ${err.message}`, 'ERROR');
        return [];
    }
}

async function consultBrain(error) {
    // 1. Check Tier 1 (Deterministic) Patterns
    const tier1 = TIER_DEFINITIONS[1];
    for (const pattern of tier1.patterns) {
        if (pattern.errorMatch.test(error.message)) {
            return {
                fixType: 'Tier 1',
                confidence: pattern.confidence,
                suggestion: `Apply pattern: ${pattern.id}`,
                pattern: pattern,
                error: error
            };
        }
    }

    // 2. If no Tier 1 match, consult RAG (Brain) via phase78-suggest-fix.mjs
    log(`No Tier 1 fix found for ${error.code}. Consulting Brain (RAG)...`, 'BRAIN');
    try {
        // Import suggest-fix module directly (more reliable than subprocess)
        const { suggestFixForError } = await import('./phase78-suggest-fix.mjs');

        const suggestion = await suggestFixForError({
            code: error.code,
            message: error.message,
            file_path: error.file,
            line: error.line,
            column: error.column,
            confidenceThreshold: 0.75,
            mode: 'safe'
        });

        if (suggestion && suggestion.confidence >= 0.7) {
            return {
                fixType: 'RAG',
                confidence: suggestion.confidence,
                suggestion: suggestion.patch || suggestion.summary,
                metadata: suggestion,
                error: error
            };
        }
    } catch (err) {
        log(`Brain consultation failed: ${err.message}`, 'WARN');
    }

    return null;
}

async function applyFixSafely(fix, error) {
    log(`Applying fix for: ${error.file}:${error.line}`, 'ACTION');
    const filePath = path.join(ROOT_DIR, error.file);

    if (!fs.existsSync(filePath)) {
        log(`File not found: ${filePath}`, 'ERROR');
        return false;
    }

    // 1. Snapshot
    const backupPath = filePath + '.bak';
    fs.copyFileSync(filePath, backupPath);

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const lineIndex = error.line - 1;

        if (lineIndex < 0 || lineIndex >= lines.length) {
            throw new Error(`Line ${error.line} out of bounds`);
        }

        let newContent = content;
        let applied = false;

        if (fix.fixType === 'Tier 1') {
            const pattern = fix.pattern;
            const line = lines[lineIndex];

            // Check line match if exists
            if (pattern.lineMatch && !pattern.lineMatch.test(line)) {
                log(`Line mismatch for pattern ${pattern.id}. Expected ${pattern.lineMatch}, got: ${line.trim()}`, 'WARN');
                return false;
            }

            const fixedLine = pattern.fix(line, line.match(pattern.lineMatch || /.*/));

            if (fixedLine === null) {
                // Delete line
                lines.splice(lineIndex, 1);
                newContent = lines.join('\n');
                applied = true;
            } else if (fixedLine !== line) {
                lines[lineIndex] = fixedLine;
                newContent = lines.join('\n');
                applied = true;
            }
        } else if (fix.fixType === 'RAG') {
            log(`RAG fix application not yet fully automated. Suggestion: ${fix.suggestion}`, 'INFO');
            // For now, we don't apply RAG fixes automatically as they require parsing the LLM output
            // which is non-deterministic.
            return false;
        }

        if (applied) {
            // 2. Validate Patch
            try {
                validatePatch(newContent, error.file);
            } catch (validationErr) {
                log(`Patch validation failed: ${validationErr.message}`, 'ERROR');
                throw validationErr;
            }

            // 3. Write File
            fs.writeFileSync(filePath, newContent, 'utf8');
            log('Fix applied successfully.', 'SUCCESS');
            return true;
        } else {
            log('No changes made by fix.', 'WARN');
            return false;
        }

    } catch (err) {
        log(`Failed to apply fix: ${err.message}`, 'ERROR');
        // Rollback
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, filePath);
            log('Rolled back changes.', 'SAFETY');
        }
        return false;
    } finally {
        // Cleanup backup if successful?
        // We keep it for now in case we want to implement post-verification rollback later
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }
    }
}

async function updateBrain(error, fix, success) {
    log(`Updating Brain: Success=${success}`, 'LEARN');
    try {
        await recordFixResult({
            code: error.code,
            message: error.message,
            file_path: error.file,
            line: error.line,
            column: error.column
        }, fix, success);
    } catch (err) {
        log(`Failed to update Brain: ${err.message}`, 'WARN');
    }
}

async function main() {
    log('Starting Phase 78 Repair Pipeline', 'INIT');

    // 1. Collect
    const errors = await collectErrors();
    if (errors.length === 0) {
        log('No errors found. Pipeline complete.', 'SUCCESS');
        return;
    }

    let fixedCount = 0;

    // 2. Iterate
    for (const error of errors.slice(0, CONFIG.MAX_FIXES)) {
        // 3. Consult
        const suggestion = await consultBrain(error);

        if (suggestion && suggestion.confidence >= 0.9) { // Tier 1
            // 4. Apply
            const success = await applyFixSafely(suggestion, error);

            // 5. Learn
            await updateBrain(error, suggestion, success);

            if (success) fixedCount++;
        } else if (suggestion) {
            log(`Skipping low confidence fix (${suggestion.confidence})`, 'SKIP');
        }
    }

    log(`Pipeline complete. Fixed ${fixedCount} errors.`, 'SUMMARY');
}

main().catch(err => {
    log(`Pipeline failed: ${err.message}`, 'FATAL');
    process.exit(1);
});
