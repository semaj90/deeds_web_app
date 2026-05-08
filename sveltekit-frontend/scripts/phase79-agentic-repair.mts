#!/usr/bin/env npx tsx
/**
 * Phase 79: Agentic Repair Loop
 *
 * The "Cognitive System" - an autonomous agent that:
 * 1. Fetches high-risk suggestions from error_suggestions
 * 2. Applies patches using apply_patch tool
 * 3. Verifies fixes with svelte-check
 * 4. Learns: stores success patterns in Qdrant, failures in Postgres
 *
 * @module scripts/phase79-agentic-repair
 */

import { exec as execCallback } from 'child_process';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const exec = promisify(execCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDUFnEXDcyhys7aKLHpHFZjmJB0Yhsoxt0';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const MODEL = process.env.SUGGESTION_MODEL || 'gemma3-legal:latest';

// Initialize database
const sql = postgres(DATABASE_URL);

// Logs directory
const LOGS_DIR = path.join(__dirname, '../logs/phase79');
await fs.mkdir(LOGS_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface Tool {
  name: string;
  description: string;
  execute: (args: any) => Promise<any>;
}

const tools: Record<string, Tool> = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    async execute({ filePath }: { filePath: string }) {
      console.log(`📖 [Tool:ReadFile] ${filePath}`);
      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        return { success: true, content, lines: content.split('\n').length };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  },

  apply_patch: {
    name: 'apply_patch',
    description: 'Apply a code patch to a file with automatic backup',
    async execute({ filePath, patch, lineStart, lineEnd }: {
      filePath: string;
      patch: string;
      lineStart?: number;
      lineEnd?: number;
    }) {
      console.log(`📝 [Tool:ApplyPatch] ${filePath} (lines ${lineStart}-${lineEnd})`);

      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);

        // 1. Create backup
        const backupPath = `${absolutePath}.phase79.bak`;
        await fs.copyFile(absolutePath, backupPath);
        console.log(`   💾 Backup created: ${backupPath}`);

        // 2. Read current content
        const originalContent = await fs.readFile(absolutePath, 'utf-8');
        const lines = originalContent.split('\n');

        // 3. Apply patch
        let newContent: string;
        if (lineStart !== undefined && lineEnd !== undefined) {
          // Replace specific line range
          const before = lines.slice(0, lineStart - 1);
          const after = lines.slice(lineEnd);
          newContent = [...before, patch, ...after].join('\n');
        } else {
          // Full file replacement (use with caution)
          newContent = patch;
        }

        // 4. Write patched content
        await fs.writeFile(absolutePath, newContent, 'utf-8');
        console.log(`   ✅ Patch applied successfully`);

        return {
          success: true,
          backupPath,
          originalLines: lines.length,
          newLines: newContent.split('\n').length
        };
      } catch (e: any) {
        console.log(`   ❌ Patch failed: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
  },

  verify_fix: {
    name: 'verify_fix',
    description: 'Run svelte-check to verify a fix worked',
    async execute({ filePath, checkFull = false }: { filePath: string; checkFull?: boolean }) {
      console.log(`🔍 [Tool:VerifyFix] ${filePath}`);

      try {
        const cwd = path.join(__dirname, '..');

        // Run svelte-check (full or quick)
        const command = checkFull
          ? 'npx svelte-check --threshold error 2>&1'
          : `npx svelte-check --threshold error 2>&1 | grep -i "${path.basename(filePath)}" || true`;

        const { stdout, stderr } = await exec(command, { cwd, timeout: 120000 });
        const output = stdout + stderr;

        // Check if the specific file has errors
        const fileName = path.basename(filePath);
        const hasErrors = output.toLowerCase().includes(fileName.toLowerCase()) &&
                          output.toLowerCase().includes('error');

        console.log(`   ${hasErrors ? '❌ Errors found' : '✅ Clean'}`);

        return {
          success: !hasErrors,
          hasErrors,
          errorCount: (output.match(/Error:/gi) || []).length,
          output: output.substring(0, 2000) // Truncate for logging
        };
      } catch (e: any) {
        // Exit code 1 usually means errors found
        return { success: false, hasErrors: true, error: e.message };
      }
    }
  },

  revert_patch: {
    name: 'revert_patch',
    description: 'Revert a patch by restoring the backup file',
    async execute({ filePath }: { filePath: string }) {
      console.log(`⏪ [Tool:RevertPatch] ${filePath}`);

      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);
        const backupPath = `${absolutePath}.phase79.bak`;

        // Check if backup exists
        try {
          await fs.access(backupPath);
        } catch {
          return { success: false, error: 'No backup file found' };
        }

        // Restore from backup
        await fs.copyFile(backupPath, absolutePath);
        await fs.unlink(backupPath);
        console.log(`   ✅ Reverted successfully`);

        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  },

  store_knowledge: {
    name: 'store_knowledge',
    description: 'Store a successful fix pattern in the knowledge base',
    async execute({ errorCode, category, patch, filePath, summary }: {
      errorCode: string;
      category: string;
      patch: string;
      filePath: string;
      summary: string;
    }) {
      console.log(`📚 [Tool:StoreKnowledge] ${errorCode} - ${category}`);

      try {
        // Store in Postgres knowledge_fixes table
        await sql`
          INSERT INTO knowledge_fixes (
            error_code, category, patch_template, file_pattern, summary,
            success_count, created_at
          ) VALUES (
            ${errorCode},
            ${category},
            ${patch},
            ${path.basename(filePath)},
            ${summary},
            1,
            NOW()
          )
          ON CONFLICT (error_code, category) DO UPDATE
          SET success_count = knowledge_fixes.success_count + 1,
              patch_template = EXCLUDED.patch_template,
              updated_at = NOW()
        `;

        console.log(`   ✅ Knowledge stored`);
        return { success: true };
      } catch (e: any) {
        // Table might not exist yet, create it
        if (e.message.includes('does not exist')) {
          await sql`
            CREATE TABLE IF NOT EXISTS knowledge_fixes (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              error_code VARCHAR(100) NOT NULL,
              category VARCHAR(100) NOT NULL,
              patch_template TEXT NOT NULL,
              file_pattern VARCHAR(255),
              summary TEXT,
              success_count INTEGER DEFAULT 1,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(error_code, category)
            )
          `;
          // Retry the insert
          return tools.store_knowledge.execute({ errorCode, category, patch, filePath, summary });
        }
        console.log(`   ⚠️ Knowledge storage failed: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
  },

  log_failure: {
    name: 'log_failure',
    description: 'Log a failed fix attempt to avoid repeating it',
    async execute({ suggestionId, errorCode, reason, filePath }: {
      suggestionId: string;
      errorCode: string;
      reason: string;
      filePath: string;
    }) {
      console.log(`📋 [Tool:LogFailure] ${errorCode} - ${reason.substring(0, 50)}...`);

      try {
        await sql`
          INSERT INTO fix_failures (
            suggestion_id, error_code, reason, file_path, created_at
          ) VALUES (
            ${suggestionId},
            ${errorCode},
            ${reason},
            ${filePath},
            NOW()
          )
        `;
        return { success: true };
      } catch (e: any) {
        // Create table if needed
        if (e.message.includes('does not exist')) {
          await sql`
            CREATE TABLE IF NOT EXISTS fix_failures (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              suggestion_id UUID,
              error_code VARCHAR(100),
              reason TEXT,
              file_path VARCHAR(500),
              created_at TIMESTAMP DEFAULT NOW()
            )
          `;
          return tools.log_failure.execute({ suggestionId, errorCode, reason, filePath });
        }
        return { success: false, error: e.message };
      }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 AGENT LOGIC
// ═══════════════════════════════════════════════════════════════════════════

interface Suggestion {
  id: string;
  route_path: string;
  cluster_id: string;
  summary: string;
  patch: string;
  risk_level: string;
  error_code?: string;
  category?: string;
  file_path?: string;
}

async function fetchPendingSuggestions(limit = 5): Promise<Suggestion[]> {
  console.log(`\n📥 Fetching pending suggestions with valid file paths...`);

  const suggestions = await sql`
    SELECT
      es.id,
      es.cluster_id,
      es.summary,
      es.patch,
      es.risk_level,
      ec.route_id as route_path,
      ec.error_code,
      ec.category,
      ec.file_path
    FROM error_suggestions es
    INNER JOIN error_cluster ec ON es.cluster_id = ec.cluster_id
    WHERE es.applied = false
      AND es.patch IS NOT NULL
      AND es.patch != ''
      AND ec.file_path IS NOT NULL
      AND ec.file_path != ''
      AND ec.route_id NOT LIKE '%__non_route__%'
    ORDER BY
      CASE es.risk_level
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      ec.count DESC NULLS LAST
    LIMIT ${limit}
  `;

  console.log(`   Found ${suggestions.length} pending suggestions with valid file paths`);

  // If no route-based suggestions, fall back to internal files that exist
  if (suggestions.length === 0) {
    console.log(`   Trying internal file suggestions...`);
    const internalSuggestions = await sql`
      SELECT
        es.id,
        es.cluster_id,
        es.summary,
        es.patch,
        es.risk_level,
        ec.route_id as route_path,
        ec.error_code,
        ec.category,
        ec.file_path
      FROM error_suggestions es
      INNER JOIN error_cluster ec ON es.cluster_id = ec.cluster_id
      WHERE es.applied = false
        AND es.patch IS NOT NULL
        AND es.patch != ''
        AND ec.file_path IS NOT NULL
        AND ec.file_path != ''
      ORDER BY
        CASE es.risk_level
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        ec.count DESC NULLS LAST
      LIMIT ${limit}
    `;
    console.log(`   Found ${internalSuggestions.length} internal file suggestions`);
    return internalSuggestions as unknown as Suggestion[];
  }

  return suggestions as unknown as Suggestion[];
}

async function resolveFilePath(suggestion: Suggestion): Promise<string | null> {
  // Priority 1: Use file_path from error_cluster (most reliable)
  if (suggestion.file_path) {
    const absolutePath = path.isAbsolute(suggestion.file_path)
      ? suggestion.file_path
      : path.join(__dirname, '..', suggestion.file_path);

    try {
      await fs.access(absolutePath);
      console.log(`   ✅ Resolved via cluster file_path: ${suggestion.file_path}`);
      return absolutePath;
    } catch {
      console.log(`   ⚠️  file_path exists in DB but not on disk: ${suggestion.file_path}`);
    }
  }

  // Priority 2: Try route-based resolution
  const possiblePaths = [
    suggestion.route_path ? `src/routes${suggestion.route_path}/+page.svelte` : null,
    suggestion.route_path ? `src/routes${suggestion.route_path}/+page.ts` : null,
    suggestion.route_path ? `src/routes${suggestion.route_path}/+server.ts` : null,
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    const absolutePath = path.isAbsolute(p)
      ? p
      : path.join(__dirname, '..', p);
    try {
      await fs.access(absolutePath);
      console.log(`   ✅ Resolved via route heuristic: ${p}`);
      return absolutePath;
    } catch {
      continue;
    }
  }

  return null;
}

async function processOneSuggestion(suggestion: Suggestion): Promise<boolean> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎯 Processing: ${suggestion.summary?.substring(0, 60)}...`);
  console.log(`   Risk: ${suggestion.risk_level} | Code: ${suggestion.error_code || 'unknown'}`);
  console.log(`${'═'.repeat(60)}`);

  // 1. Resolve file path
  const filePath = await resolveFilePath(suggestion);
  if (!filePath) {
    console.log(`   ❌ Could not resolve file path for suggestion`);
    await tools.log_failure.execute({
      suggestionId: suggestion.id,
      errorCode: suggestion.error_code || 'UNKNOWN',
      reason: 'Could not resolve file path',
      filePath: suggestion.route_path || 'unknown'
    });
    return false;
  }
  console.log(`   📁 Resolved path: ${filePath}`);

  // 2. Read current file
  const readResult = await tools.read_file.execute({ filePath });
  if (!readResult.success) {
    console.log(`   ❌ Could not read file: ${readResult.error}`);
    return false;
  }

  // 3. Apply patch
  const applyResult = await tools.apply_patch.execute({
    filePath,
    patch: suggestion.patch,
    // Note: For V1, we do full file replacement if no line numbers
    // Future: Parse patch format for line-specific edits
  });

  if (!applyResult.success) {
    console.log(`   ❌ Patch application failed: ${applyResult.error}`);
    return false;
  }

  // 4. Verify fix
  const verifyResult = await tools.verify_fix.execute({ filePath });

  if (verifyResult.success && !verifyResult.hasErrors) {
    console.log(`   ✅ Fix verified! Updating knowledge base...`);

    // 5a. Success: Store knowledge and mark as applied
    await tools.store_knowledge.execute({
      errorCode: suggestion.error_code || 'UNKNOWN',
      category: suggestion.category || 'other',
      patch: suggestion.patch,
      filePath,
      summary: suggestion.summary
    });

    await sql`
      UPDATE error_suggestions
      SET applied = true, applied_at = NOW()
      WHERE id = ${suggestion.id}
    `;

    // Delete backup after successful verification
    try {
      await fs.unlink(`${filePath}.phase79.bak`);
    } catch {}

    return true;
  } else {
    console.log(`   ⚠️ Fix failed verification. Reverting...`);

    // 5b. Failure: Revert and log
    await tools.revert_patch.execute({ filePath });

    await tools.log_failure.execute({
      suggestionId: suggestion.id,
      errorCode: suggestion.error_code || 'UNKNOWN',
      reason: `Verification failed: ${verifyResult.errorCount} errors still present`,
      filePath
    });

    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN AGENT LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function runAgent(maxIterations = 10) {
  console.log('\n' + '═'.repeat(60));
  console.log('🤖 Phase 79: Agentic Repair Loop');
  console.log('═'.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Max iterations: ${maxIterations}`);

  let successCount = 0;
  let failCount = 0;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${maxIterations}`);

    // Fetch one suggestion at a time
    const suggestions = await fetchPendingSuggestions(1);

    if (suggestions.length === 0) {
      console.log('\n✅ No more pending suggestions. Agent complete!');
      break;
    }

    const success = await processOneSuggestion(suggestions[0]);

    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Brief pause between iterations
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Agent Summary');
  console.log('═'.repeat(60));
  console.log(`✅ Successful fixes: ${successCount}`);
  console.log(`❌ Failed attempts: ${failCount}`);
  console.log(`📈 Success rate: ${((successCount / (successCount + failCount)) * 100 || 0).toFixed(1)}%`);
  console.log(`Completed at: ${new Date().toISOString()}`);

  // Log session to file
  const sessionLog = {
    timestamp: new Date().toISOString(),
    iterations: iteration,
    successCount,
    failCount,
    successRate: successCount / (successCount + failCount) || 0
  };

  await fs.writeFile(
    path.join(LOGS_DIR, `session-${Date.now()}.json`),
    JSON.stringify(sessionLog, null, 2)
  );

  await sql.end();
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const maxIterations = parseInt(args[0]) || 10;

runAgent(maxIterations).catch(err => {
  console.error('❌ Agent crashed:', err);
  sql.end();
  process.exit(1);
});
