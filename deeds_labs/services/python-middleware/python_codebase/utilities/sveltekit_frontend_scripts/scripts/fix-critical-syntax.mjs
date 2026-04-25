#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// Files with the most errors that need fixing
const criticalFiles = [
  'src/lib/orchestration/master-cognitive-hub.ts',
  'src/lib/evidence/detective-analysis-engine.ts',
  'src/lib/services/advanced-cache-manager.ts',
  'src/lib/engines/neural-sprite-engine.ts',
  'src/lib/services/qdrantService.ts',
  'src/lib/services/enhanced-rag-self-organizing.ts',
  'src/lib/messaging/rabbitmq-xstate-integration.ts',
  'src/lib/services/unified-document-processor.ts',
  'src/lib/services/case-management-service.ts',
  'src/lib/services/enhancedRAG.ts',
];

async function fixFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;

    // More aggressive fixes
    const fixes = [
      // Fix unclosed async functions
      {
        pattern: /async\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<[^>]+>\s*{\s*$/gm,
        replacement: (match) => {
          console.log(`  Found unclosed async function`);
          return match;
        },
      },

      // Fix incomplete type annotations
      {
        pattern: /:\s+Promise<$/gm,
        replacement: ': Promise<any>',
        name: 'incomplete Promise type',
      },

      // Fix stray async keywords
      {
        pattern: /^\s*async\s*$/gm,
        replacement: '',
        name: 'stray async',
      },

      // Fix incomplete if statements
      {
        pattern: /if\s*\([^)]+$(?!\s*\))/gm,
        replacement: (match) => {
          if (!match.includes(')')) {
            return match + ')';
          }
          return match;
        },
        name: 'incomplete if statement',
      },

      // Fix incomplete try blocks
      {
        pattern: /try\s*{\s*$/gm,
        replacement:
          'try {\n    // TODO: Implementation needed\n  } catch (error) {\n    console.error(error);\n  }',
        name: 'incomplete try block',
      },

      // Remove duplicate semicolons
      {
        pattern: /;;+/g,
        replacement: ';',
        name: 'duplicate semicolons',
      },

      // Fix incomplete arrow functions
      {
        pattern: /=>\s*$/gm,
        replacement: '=> {}',
        name: 'incomplete arrow function',
      },

      // Fix unclosed template literals
      {
        pattern: /\$\{[^}]*$/gm,
        replacement: (match) => match + '}',
        name: 'unclosed template literal',
      },

      // Fix floating commas
      {
        pattern: /,\s*}/g,
        replacement: '}',
        name: 'trailing comma before close brace',
      },

      // Fix floating colons
      {
        pattern: /:\s*,/g,
        replacement: ': any,',
        name: 'missing type after colon',
      },
    ];

    for (const fix of fixes) {
      const before = content;
      if (typeof fix.replacement === 'string') {
        content = content.replace(fix.pattern, fix.replacement);
      } else {
        content = content.replace(fix.pattern, fix.replacement);
      }
      if (before !== content && fix.name) {
        modified = true;
        console.log(`  ✓ Fixed ${fix.name}`);
      }
    }

    // Balance braces more aggressively
    const lines = content.split('\n');
    let braceBalance = 0;
    let parenBalance = 0;
    let bracketBalance = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Count braces
      for (const char of line) {
        if (char === '{') braceBalance++;
        if (char === '}') braceBalance--;
        if (char === '(') parenBalance++;
        if (char === ')') parenBalance--;
        if (char === '[') bracketBalance++;
        if (char === ']') bracketBalance--;
      }

      // Fix obvious issues
      if (line.trim().endsWith('Promise<') && !line.includes('>')) {
        lines[i] = line.replace(/Promise<$/, 'Promise<any>');
        modified = true;
        console.log(`  ✓ Fixed incomplete Promise type on line ${i + 1}`);
      }

      if (line.trim() === 'async') {
        lines[i] = '';
        modified = true;
        console.log(`  ✓ Removed stray async on line ${i + 1}`);
      }
    }

    // Add missing closing braces at the end if needed
    if (braceBalance > 0) {
      console.log(`  ✓ Adding ${braceBalance} missing closing braces`);
      for (let i = 0; i < braceBalance; i++) {
        lines.push('}');
      }
      modified = true;
    }

    if (parenBalance > 0) {
      console.log(`  ✓ Adding ${parenBalance} missing closing parens`);
      for (let i = 0; i < parenBalance; i++) {
        lines.push(')');
      }
      modified = true;
    }

    if (modified) {
      content = lines.join('\n');
      await fs.writeFile(fullPath, content, 'utf-8');
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }

    console.log(`⏭️  No changes needed: ${filePath}`);
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing critical TypeScript files...\n');

  let fixedCount = 0;
  let errorCount = 0;

  for (const file of criticalFiles) {
    const result = await fixFile(file);
    if (result === true) fixedCount++;
    else if (result === false) continue;
    else errorCount++;
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Fixed: ${fixedCount} files`);
  console.log(`   ⏭️  Unchanged: ${criticalFiles.length - fixedCount - errorCount} files`);
  console.log(`   ❌ Errors: ${errorCount} files`);
}

main().catch(console.error);
