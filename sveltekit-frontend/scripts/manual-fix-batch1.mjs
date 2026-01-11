#!/usr/bin/env node
/**
 * Manual Fix Script - Batch 1
 * Manually fixes specific corruption patterns in 5 high-error files
 *
 * This script applies targeted fixes based on visual inspection
 * to avoid over-aggressive regex replacements
 */

import fs from 'fs/promises';
import path from 'path';

const BACKUP_DIR = '.fix-backups-manual-batch1';

const FIXES = [
  {
    file: 'src/lib/ai/ollama-config.ts',
    fixes: [
      {
        description: 'Fix body JSON object in generateEmbedding',
        search: /body: JSON\.stringify\(\{\s*model: prompt,\s*\}\),/g,
        replace: 'body: JSON.stringify({\n        model,\n        prompt: text,\n      }),'
      },
      {
        description: 'Fix body JSON object in generateEmbeddingWithFallback',
        search: /model: fallbackModel, prompt: text, text:/g,
        replace: 'model: fallbackModel,\n       prompt: text,'
      },
      {
        description: 'Fix incomplete catch block',
        search: /} catch \(error\) \{\s*console\.error\('Fallback embedding error:', error\);\s*throw error;\s*$/gm,
        replace: '} catch (error) {\n   console.error(\'Fallback embedding error:\', error);\n   throw error;\n }\n}'
      }
    ]
  },
  {
    file: 'src/lib/api/client.ts',
    fixes: [
      {
        description: 'Fix config object initialization',
        search: /timeout, config\.timeout \|\| 30000: retries, config\.retries \|\| 3,/g,
        replace: 'timeout: config.timeout || 30000,\n     retries: config.retries || 3,'
      },
      {
        description: 'Fix lastError initialization',
        search: /let lastError: null = null;/g,
        replace: 'let lastError: Error | null = null;'
      }
    ]
  },
  {
    file: 'src/lib/agents/tools.ts',
    fixes: [
      {
        description: 'Fix cacheKey template literal',
        search: /const cacheKey = `rag:\$\{ query \}:\$\{ topK \}`;/g,
        replace: 'const cacheKey = `rag:${query}:${topK}`;'
      }
    ]
  }
];

class ManualFixer {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      fixesApplied: 0,
      errors: []
    };
  }

  async run() {
    console.log('🔧 MANUAL FIX - BATCH 1');
    console.log('='.repeat(60));
    console.log(`Target: ${FIXES.length} files with specific fixes`);
    console.log('='.repeat(60));
    console.log('');

    // Create backup directory
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    for (const fileConfig of FIXES) {
      await this.processFile(fileConfig);
    }

    this.printSummary();
  }

  async processFile(fileConfig) {
    const fullPath = path.join(process.cwd(), fileConfig.file);

    try {
      console.log(`\n📄 Processing: ${fileConfig.file}`);

      // Read file
      const originalContent = await fs.readFile(fullPath, 'utf-8');
      let modifiedContent = originalContent;
      let fileModified = false;
      const appliedFixes = [];

      // Apply each fix
      for (const fix of fileConfig.fixes) {
        const beforeLength = modifiedContent.length;
        const matches = modifiedContent.match(fix.search);

        if (matches && matches.length > 0) {
          modifiedContent = modifiedContent.replace(fix.search, fix.replace);

          if (modifiedContent !== originalContent) {
            fileModified = true;
            appliedFixes.push(fix.description);
            console.log(`   ✓ ${fix.description}`);
          }
        }
      }

      if (fileModified) {
        this.stats.filesModified++;
        this.stats.fixesApplied += appliedFixes.length;

        // Backup original
        const backupPath = path.join(BACKUP_DIR, path.basename(fileConfig.file) + '.backup');
        await fs.writeFile(backupPath, originalContent, 'utf-8');

        // Write modified
        await fs.writeFile(fullPath, modifiedContent, 'utf-8');
        console.log(`   ✅ File modified (${appliedFixes.length} fixes applied)`);
      } else {
        console.log(`   ⏭️  No changes needed`);
      }

      this.stats.filesProcessed++;

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      this.stats.errors.push({ file: fileConfig.file, error: error.message });
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MANUAL FIX SUMMARY');
    console.log('='.repeat(60));
    console.log(`Files Processed: ${this.stats.filesProcessed}`);
    console.log(`Files Modified: ${this.stats.filesModified}`);
    console.log(`Fixes Applied: ${this.stats.fixesApplied}`);
    console.log(`Errors: ${this.stats.errors.length}`);

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.stats.errors.forEach(({ file, error }) => {
        console.log(`   ${file}: ${error}`);
      });
    }

    console.log('='.repeat(60));
  }
}

// Run the fixer
const fixer = new ManualFixer();
fixer.run().catch(console.error);
