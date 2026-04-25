#!/usr/bin/env node
/**
 * Fix Async Effect Patterns in Svelte 5
 * 
 * Converts problematic async effect/onMount patterns to correct synchronous patterns.
 * Based on "Avoid Async Effects In Svelte" video patterns.
 * 
 * Fixes:
 * 1. async effect callbacks -> sync callback with async IIFE
 * 2. async onMount callbacks -> sync callback with async IIFE
 * 3. Preserves cleanup functions
 * 4. Maintains reactivity
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stats = {
  filesScanned: 0,
  filesFixed: 0,
  patternsFixed: 0,
  errors: []
};

/**
 * Fix async effect pattern
 * Converts: effect(async () => { ... })
 * To: effect(() => { (async () => { ... })(); return cleanup; })
 */
function fixAsyncEffect(content) {
  let fixed = content;
  let changesMade = 0;

  // Pattern 1: effect(async () => { ... })
  const effectPattern = /effect\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  fixed = fixed.replace(effectPattern, (match, params) => {
    changesMade++;
    return `effect((${params}) => {\n\t\t(async () => {`;
  });

  // Pattern 2: onMount(async () => { ... })
  const onMountPattern = /onMount\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  fixed = fixed.replace(onMountPattern, (match, params) => {
    changesMade++;
    return `onMount((${params}) => {\n\t\t(async () => {`;
  });

  // If we made changes, we need to close the IIFE and potentially handle cleanup
  if (changesMade > 0) {
    // Find the closing of the effect/onMount and add IIFE closure
    // This is a simplified approach - may need manual review for complex cases
    fixed = addIIFEClosures(fixed);
  }

  return { content: fixed, changes: changesMade };
}

/**
 * Add IIFE closures and preserve cleanup patterns
 */
function addIIFEClosures(content) {
  // This is a heuristic approach - handles common patterns
  // For complex nested structures, manual review may be needed
  
  let lines = content.split('\n');
  let inAsyncBlock = false;
  let braceDepth = 0;
  let effectStartLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect start of our converted async IIFE
    if (line.includes('effect(') && lines[i + 1]?.includes('(async () => {')) {
      inAsyncBlock = true;
      effectStartLine = i;
      braceDepth = 0;
      continue;
    }
    
    if (inAsyncBlock) {
      // Count braces to find the end
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceDepth += openBraces - closeBraces;
      
      // Check if this is the closing brace of the effect
      if (line.trim().startsWith('});') && braceDepth === 0) {
        // Check if there's a cleanup function (return statement before this line)
        let hasCleanup = false;
        for (let j = i - 1; j > effectStartLine; j--) {
          if (lines[j].includes('return () =>') || lines[j].includes('return function')) {
            hasCleanup = true;
            break;
          }
        }
        
        // Insert IIFE closure before the effect closure
        const indent = line.match(/^\s*/)[0];
        if (hasCleanup) {
          // If cleanup exists, close IIFE before the return
          lines.splice(i, 0, `${indent}\t})();`);
        } else {
          // No cleanup, just close IIFE
          lines[i] = `${indent}\t})();\n${line}`;
        }
        
        inAsyncBlock = false;
        i++; // Skip the line we just added
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * More sophisticated pattern fix using AST-like approach
 */
function fixAsyncEffectAdvanced(content) {
  let fixed = content;
  let changesMade = 0;

  // Pattern: Find async effect/onMount blocks
  const asyncEffectRegex = /(effect|onMount)\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;
  
  fixed = fixed.replace(asyncEffectRegex, (match, fnName, params, body) => {
    changesMade++;
    
    // Check if body contains a return statement (cleanup)
    const hasReturn = body.includes('return');
    
    if (hasReturn) {
      // Split body at return statement
      const returnMatch = body.match(/([\s\S]*?)(return\s+[\s\S]*)/);
      if (returnMatch) {
        const beforeReturn = returnMatch[1];
        const returnStatement = returnMatch[2];
        
        return `${fnName}((${params}) => {
\t\t(async () => {
${beforeReturn}\t\t})();
\t\t
\t\t${returnStatement}
\t})`;
      }
    }
    
    // No return statement - simpler case
    return `${fnName}((${params}) => {
\t\t(async () => {
${body}\t\t})();
\t})`;
  });

  return { content: fixed, changes: changesMade };
}

/**
 * Process a single Svelte file
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Check if file has async effect or onMount
    if (!content.includes('effect(async') && !content.includes('onMount(async')) {
      return;
    }
    
    stats.filesScanned++;
    
    // Try advanced fix first
    let result = fixAsyncEffectAdvanced(content);
    
    // If no changes, try basic fix
    if (result.changes === 0) {
      result = fixAsyncEffect(content);
    }
    
    if (result.changes > 0) {
      // Backup original
      const backupPath = `${filePath}.backup-async-fix`;
      await fs.writeFile(backupPath, content, 'utf-8');
      
      // Write fixed content
      await fs.writeFile(filePath, result.content, 'utf-8');
      
      stats.filesFixed++;
      stats.patternsFixed += result.changes;
      
      console.log(`✅ Fixed ${result.changes} pattern(s) in: ${path.relative(process.cwd(), filePath)}`);
    }
    
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

/**
 * Recursively find all Svelte files
 */
async function findSvelteFiles(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await findSvelteFiles(fullPath));
        }
      } else if (entry.name.endsWith('.svelte')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Fixing Async Effect Patterns in Svelte 5 Files\n');
  console.log('Based on "Avoid Async Effects In Svelte" patterns\n');
  
  const srcDir = path.join(__dirname, 'src');
  
  console.log(`Scanning: ${srcDir}\n`);
  
  const files = await findSvelteFiles(srcDir);
  console.log(`Found ${files.length} Svelte files\n`);
  
  // Process files in parallel (with concurrency limit)
  const concurrency = 10;
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    await Promise.all(batch.map(processFile));
  }
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log(`   Files scanned: ${stats.filesScanned}`);
  console.log(`   Files fixed: ${stats.filesFixed}`);
  console.log(`   Patterns fixed: ${stats.patternsFixed}`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${stats.errors.length}`);
    stats.errors.forEach(({ file, error }) => {
      console.log(`   ${path.relative(process.cwd(), file)}: ${error}`);
    });
  }
  
  // Write detailed report
  const report = {
    timestamp: new Date().toISOString(),
    stats,
    recommendations: [
      'Review files with complex nested async patterns',
      'Test all fixed components for proper cleanup behavior',
      'Verify reactivity still works after await statements',
      'Check console for any new errors in development'
    ]
  };
  
  await fs.writeFile(
    path.join(__dirname, 'async-fix-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n📝 Detailed report saved to: async-fix-report.json');
  console.log('\n✨ Done! Please review changes and test your application.');
}

main().catch(console.error);
