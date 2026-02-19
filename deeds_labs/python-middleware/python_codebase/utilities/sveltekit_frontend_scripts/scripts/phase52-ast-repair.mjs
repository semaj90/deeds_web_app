#!/usr/bin/env node

/**
 * Phase 52 – AST Repair (Direct Regex Parsing)
 * Reads TSC log, parses errors with regex, patches missing tokens, writes to src_fixed/
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Redis from 'ioredis';

const LOG = 'logs/tsc_full_scan.txt';
const OUT = 'src_fixed';

// Initialize Redis for caching repairs
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

async function main() {
  try {
    // -----------------------------------------------
    //  Phase 52 – Re-run full TSC for every file
    // -----------------------------------------------
    console.log("🧩 Re-running full TypeScript check across entire directory...");
    try {
      execSync(
        "npx tsc --project tsconfig.json --noEmit --pretty false --skipLibCheck false --traceResolution > logs/tsc_full_scan.txt 2>&1",
        { stdio: "inherit" }
      );
    } catch {
      console.log("⚠️  tsc exited with expected errors");
    }

    // Read the new log
    const logPath = "logs/tsc_full_scan.txt";
    const tscLog = fs.readFileSync(logPath, "utf8");
    console.log(`📄 Read ${(tscLog.length / 1024 / 1024).toFixed(2)} MB from ${logPath}`);

    // Parse errors directly with regex (no external services needed)
    const errorRegex = /(.+\.ts)\((\d+),(\d+)\): error TS(\d+): (.+)/g;
    let match;
    let errorCount = 0;
    const errors = [];

    while ((match = errorRegex.exec(tscLog)) !== null) {
      const error = {
        file: match[1],
        line: parseInt(match[2]),
        col: parseInt(match[3]),
        code: `TS${match[4]}`,
        message: match[5]
      };
      errors.push(error);
      errorCount++;
    }

    console.log(`📊 Parsed ${errorCount} TypeScript errors from log`);

    // Store errors in Redis
    for (const error of errors) {
      const key = `phase52:errors:${error.file}`;
      const field = `${error.line}:${error.col}`;
      await redis.hset(key, field, JSON.stringify(error));
    }
    console.log(`� Stored ${errorCount} errors in Redis`);

    // Ensure output directory exists
    fs.mkdirSync(OUT, { recursive: true });

    // Apply basic repairs to files with errors
    let repairedCount = 0;
    let skippedCount = 0;
    const processedFiles = new Set();

    for (const error of errors) {
      if (processedFiles.has(error.file)) continue;
      processedFiles.add(error.file);

      if (!fs.existsSync(error.file)) {
        console.log(`⏭️ Skipping invalid file: ${error.file}`);
        skippedCount++;
        continue;
      }

      try {
        // Read source file
        const content = fs.readFileSync(error.file, 'utf8');

        // Apply common syntax recoveries (expand as needed)
        let fixed = content
          // Remove stray code fences
          .replace(/```[a-z]*\n/g, '')
          // Fix template literal gaps
          .replace(/\$\{([\s\S]*?)\n/g, '${$1}')
          // Fix broken exports
          .replace(/\bexport\s+const\s+\)/g, 'export const = () =>')
          // Remove double semicolons
          .replace(/;+\s*;/g, ';')
          // Fix missing semicolons in interfaces
          .replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g, '$1;\n}')
          // Fix malformed imports
          .replace(/import\s+{\s*([^}]+)\s*}\s+from\s+['"]([^'"]*)['"]/g, (match, imports, module) => {
            // Clean up import names
            const cleanImports = imports.split(',').map(imp => imp.trim()).filter(imp => imp.length > 0);
            return `import { ${cleanImports.join(', ')} } from '${module}'`;
          });

        // Only write if content changed
        if (fixed !== content) {
          const newPath = path.join(OUT, path.basename(error.file));
          fs.writeFileSync(newPath, fixed);

          // Cache repair in Redis
          await redis.hset('phase52:repairs', error.file, JSON.stringify({
            line: error.line,
            message: error.message,
            repaired_at: new Date().toISOString(),
            method: 'regex-parse'
          }));

          console.log(`🩹 Repaired ${error.file} (line ${error.line})`);
          repairedCount++;
        } else {
          console.log(`ℹ️ No changes needed for ${error.file}`);
        }

      } catch (error) {
        console.error(`❌ Failed to repair ${error.file}:`, error.message);
        skippedCount++;
      }
    }

    // Summary
    console.log('\n📊 Phase 52 Repair Summary:');
    console.log(`✅ Files repaired: ${repairedCount}`);
    console.log(`⏭️ Files skipped: ${skippedCount}`);
    console.log(`📁 Output directory: ${OUT}`);
    console.log(`📊 Total errors processed: ${errorCount}`);

    // Cache summary
    await redis.hset('phase52:summary', 'last_run', JSON.stringify({
      timestamp: new Date().toISOString(),
      repaired: repairedCount,
      skipped: skippedCount,
      errors_found: errorCount,
      method: 'regex-direct'
    }));

  } catch (error) {
    console.error('❌ Phase 52 repair failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    redis.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Phase 52 interrupted, cleaning up...');
  redis.disconnect();
  process.exit(0);
});

main();