#!/usr/bin/env node
/**
 * Dry-Run Fix Script - Batch 1
 * Tests fixes on a small set of files before full deployment
 *
 * Target Files (5 files with high error counts):
 * 1. src/lib/agents/tools.ts - Multiple TS1005 errors
 * 2. src/lib/ai/ollama-config.ts - Try/catch corruption
 * 3. src/lib/api/client.ts - Multiple comma/colon issues
 * 4. src/lib/animations/gpu-animations.ts - Type annotation issues
 * 5. src/adaptive-index-orchestrator.ts - Import corruption
 */

import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = true; // Set to false to apply fixes
const BACKUP_DIR = '.fix-backups-batch1';

// Corruption patterns to fix
const PATTERNS = [
  {
    name: 'Import type comma',
    regex: /import\s*{\s*([^}]+?)\s+type\s+([A-Z][a-zA-Z0-9]*)\s*}/g,
    replacement: 'import { $1, type $2 }',
    description: 'Fix: import { X type Y } → import { X, type Y }'
  },
  {
    name: 'Object literal colon-comma swap',
    regex: /(\w+)\s*:\s*([^,}\n]+?)\s*:\s*/g,
    replacement: '$1: $2,',
    description: 'Fix: key: value: → key: value,'
  },
  {
    name: 'Function param colon-comma swap',
    regex: /\(([^)]+?)\s*:\s*([^:,)]+?)\s*:\s*([^)]+?)\)/g,
    replacement: '($1: $2, $3)',
    description: 'Fix: (a: string: b) → (a: string, b)'
  },
  {
    name: 'Try-catch corruption',
    regex: /}\s*catch\s*\(\s*(\w+)\s*:\s*(\w+)\s*:\s*(\w+)\s*:\s*(\w+)\s*\)\s*{/g,
    replacement: '} catch ($1) {',
    description: 'Fix: } catch (e: unknown: Error: any) { → } catch (e) {'
  },
  {
    name: 'Array/Object trailing comma before closing',
    regex: /,(\s*[}\]])/g,
    replacement: '$1',
    description: 'Fix: Remove trailing commas before } or ]'
  }
];

const TARGET_FILES = [
  'src/lib/agents/tools.ts',
  'src/lib/ai/ollama-config.ts',
  'src/lib/api/client.ts',
  'src/lib/animations/gpu-animations.ts',
  'src/adaptive-index-orchestrator.ts'
];

class DryRunFixer {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      patternsApplied: 0,
      errors: []
    };
  }

  async run() {
    console.log('🧪 DRY-RUN FIX - BATCH 1');
    console.log('='.repeat(60));
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY-RUN (no changes)' : '✍️  APPLY FIXES'}`);
    console.log(`Target: ${TARGET_FILES.length} files`);
    console.log('='.repeat(60));
    console.log('');

    // Create backup directory if applying fixes
    if (!DRY_RUN) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    }

    for (const filePath of TARGET_FILES) {
      await this.processFile(filePath);
    }

    this.printSummary();
  }

  async processFile(filePath) {
    const fullPath = path.join(process.cwd(), filePath);

    try {
      console.log(`\n📄 Processing: ${filePath}`);

      // Read file
      const originalContent = await fs.readFile(fullPath, 'utf-8');
      let modifiedContent = originalContent;
      let fileModified = false;
      const appliedPatterns = [];

      // Apply each pattern
      for (const pattern of PATTERNS) {
        const beforeLength = modifiedContent.length;
        const matches = modifiedContent.match(pattern.regex);

        if (matches && matches.length > 0) {
          modifiedContent = modifiedContent.replace(pattern.regex, pattern.replacement);

          if (modifiedContent.length !== beforeLength || modifiedContent !== originalContent) {
            fileModified = true;
            appliedPatterns.push({
              name: pattern.name,
              matches: matches.length
            });
            console.log(`   ✓ ${pattern.name}: ${matches.length} matches`);
          }
        }
      }

      if (fileModified) {
        this.stats.filesModified++;
        this.stats.patternsApplied += appliedPatterns.length;

        if (DRY_RUN) {
          console.log(`   🔍 Would modify file (${appliedPatterns.length} patterns)`);

          // Show diff preview (first 200 chars of changes)
          const diff = this.generateDiffPreview(originalContent, modifiedContent);
          if (diff) {
            console.log(`   📝 Preview:\n${diff}`);
          }
        } else {
          // Backup original
          const backupPath = path.join(BACKUP_DIR, path.basename(filePath) + '.backup');
          await fs.writeFile(backupPath, originalContent, 'utf-8');

          // Write modified
          await fs.writeFile(fullPath, modifiedContent, 'utf-8');
          console.log(`   ✅ File modified and backed up`);
        }
      } else {
        console.log(`   ⏭️  No changes needed`);
      }

      this.stats.filesProcessed++;

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      this.stats.errors.push({ file: filePath, error: error.message });
    }
  }

  generateDiffPreview(original, modified) {
    // Find first difference
    let diffStart = 0;
    while (diffStart < original.length && diffStart < modified.length &&
           original[diffStart] === modified[diffStart]) {
      diffStart++;
    }

    if (diffStart === original.length) return null;

    // Get context around difference
    const contextStart = Math.max(0, diffStart - 50);
    cst fixed =xtEnd = Math.min(original.length, diffStart + 150);

    const originalSnippet = original.substring(contextStart, contextEnd);
    const modifiedSnippet = modified.substring(contextStart, Math.min(modified.length, contextStart + 200));

    return `      BEFORE: ${originalSnippet.replace(/\n/g, '\\n')}\n      AFTER:  ${modifiedSnippet.replace(/\n/g, '\\n')}`;
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DRY-RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Files Processed: ${this.stats.filesProcessed}`);
    console.log(`Files Modified: ${this.stats.filesModified}`);
    console.log(`Patterns Applied: ${this.stats.patternsApplied}`);
    console.log(`Errors: ${this.stats.errors.length}`);

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.stats.errors.forEach(({ file, error }) => {
        console.log(`   ${file}: ${error}`);
      });
    }

    if (DRY_RUN && this.stats.filesModified > 0) {
      console.log('\n💡 To apply these fixes, run:');
      console.log('   node scripts/dry-run-fix-batch1.mjs --apply');
    }

    console.log('='.repeat(60));
  }
}

// Run the fixer
const fixer = new DryRunFixer();
fixer.run().catch(console.error);
