#!/usr/bin/env node
/**
 * Phase 1: Automated Error Fixes (2K+ errors)
 * - Fix $state() placement outside declarations
 * - Remove extra quotes from imports
 * - Fix unterminated strings
 * - Normalize component casing (Dialog/card conflicts)
 * - Convert on:click to onclick (Svelte 5)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const logFile = path.join(ROOT, 'agentic-error-resolution', 'logs', `phase1-${Date.now()}.log`);
const stats = { files: 0, fixes: 0, errors: 0 };

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg.replace(/\n/g, ' '));
}

/**
 * Fix 1: Remove $state() from non-declaration contexts
 * Pattern: loading = $state(false) in try/catch/finally blocks
 */
function fix$statePlacement(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: variable = $state(value) inside blocks (not at top level)
  const pattern = /(\s+)(\w+)\s*=\s*\$state\((.*?)\)/g;
  fixed = fixed.replace(pattern, (match, indent, varName, value) => {
    // Only fix if it's inside a block (has significant indentation)
    if (indent.length > 4) {
      count++;
      return `${indent}${varName} = ${value}`;
    }
    return match;
  });

  if (count > 0) {
    log(`  ✓ Fixed ${count} $state placements in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 2: Remove double quotes from import statements
 * Pattern: import X from '…/File.svelte'' (extra quote)
 */
function fixImportQuotes(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: import ... from '...''; or "...""
  fixed = fixed.replace(/from\s+['"]([^'"]+)['"]['"];/g, (match, importPath) => {
    count++;
    return `from '${importPath}';`;
  });

  if (count > 0) {
    log(`  ✓ Fixed ${count} import quotes in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 3: Convert on:click to onclick (Svelte 5)
 */
function fixEventHandlers(content, filePath) {
  let fixed = content;
  let count = 0;

  const events = ['click', 'submit', 'input', 'change', 'focus', 'blur', 'keydown', 'keyup', 'mouseenter', 'mouseleave'];
  
  for (const event of events) {
    const pattern = new RegExp(`\\s+on:${event}=`, 'g');
    fixed = fixed.replace(pattern, (match) => {
      count++;
      return ` on${event}=`;
    });
  }

  if (count > 0) {
    log(`  ✓ Fixed ${count} event handlers in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 4: Normalize component casing (Card vs card, Dialog vs dialog)
 */
function fixComponentCasing(content, filePath) {
  let fixed = content;
  let count = 0;

  // Capitalize common UI components in imports
  const componentMap = {
    'card': 'Card',
    'dialog': 'Dialog',
    'button': 'Button',
    'input': 'Input',
    'label': 'Label',
    'select': 'Select'
  };

  for (const [lower, upper] of Object.entries(componentMap)) {
    // Fix import paths: from '$lib/components/ui/card' → Card
    const importPattern = new RegExp(`from\\s+['"]([^'"]*/)${lower}(['"])`, 'gi');
    fixed = fixed.replace(importPattern, (match, pathPrefix, quote) => {
      count++;
      return `from '${pathPrefix}${upper}'`;
    });
  }

  if (count > 0) {
    log(`  ✓ Fixed ${count} component casing issues in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 5: Fix unterminated template strings and quotes
 */
function fixUnterminatedStrings(content, filePath) {
  let fixed = content;
  let count = 0;

  // Pattern: class=" without closing " on same line (likely corrupted)
  const lines = fixed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for unterminated attributes
    if (line.includes('class="') && !line.match(/class="[^"]*"/)) {
      // Find the next quote and close it
      const before = line.substring(0, line.indexOf('class="') + 7);
      const after = line.substring(line.indexOf('class="') + 7);
      const nextQuote = after.indexOf('"');
      
      if (nextQuote === -1) {
        // No closing quote found, add one at end of meaningful content
        const endOfContent = after.search(/[>\s]/);
        if (endOfContent > 0) {
          lines[i] = before + after.substring(0, endOfContent) + '"' + after.substring(endOfContent);
          count++;
        }
      }
    }
  }

  if (count > 0) {
    fixed = lines.join('\n');
    log(`  ✓ Fixed ${count} unterminated strings in ${path.relative(ROOT, filePath)}`);
  }
  return { content: fixed, count };
}

/**
 * Fix 6: Convert export let to $props() for Svelte 5 runes mode
 */
function fixExportLet(content, filePath) {
  let fixed = content;
  let count = 0;

  // Only fix in .svelte files
  if (!filePath.endsWith('.svelte')) {
    return { content, count: 0 };
  }

  // Pattern: export let propName: Type = defaultValue;
  const pattern = /export\s+let\s+(\w+)(?:\s*:\s*([^=;]+))?\s*(?:=\s*([^;]+))?\s*;/g;
  
  const matches = [...content.matchAll(pattern)];
  if (matches.length > 0) {
    // Collect all props
    const props = matches.map(m => ({
      name: m[1],
      type: m[2]?.trim(),
      default: m[3]?.trim()
    }));

    // Generate $props() declaration
    let propsDecl = 'let { ';
    propsDecl += props.map(p => {
      let prop = p.name;
      if (p.default) prop += ` = ${p.default}`;
      return prop;
    }).join(', ');
    propsDecl += ' } = $props';
    
    // Add type if present
    if (props.some(p => p.type)) {
      propsDecl += '<{ ';
      propsDecl += props.map(p => `${p.name}${p.type ? `: ${p.type}` : ': any'}`).join('; ');
      propsDecl += ' }>';
    }
    propsDecl += '();';

    // Replace all export let declarations with single $props()
    fixed = content.replace(pattern, '');
    
    // Insert $props() at the beginning of the script
    const scriptMatch = fixed.match(/<script[^>]*>/);
    if (scriptMatch) {
      const insertPos = scriptMatch.index + scriptMatch[0].length;
      fixed = fixed.slice(0, insertPos) + '\n  ' + propsDecl + '\n' + fixed.slice(insertPos);
      count = props.length;
      log(`  ✓ Converted ${count} export let to $props() in ${path.relative(ROOT, filePath)}`);
    }
  }

  return { content: fixed, count };
}

/**
 * Process a single file with all fixes
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    let totalFixes = 0;

    // Apply all fixes in sequence
    const fixes = [
      fix$statePlacement,
      fixImportQuotes,
      fixEventHandlers,
      fixComponentCasing,
      fixUnterminatedStrings,
      fixExportLet
    ];

    for (const fix of fixes) {
      const result = fix(content, filePath);
      content = result.content;
      totalFixes += result.count;
    }

    // Write back if changed
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.files++;
      stats.fixes += totalFixes;
      return true;
    }
    return false;
  } catch (error) {
    stats.errors++;
    log(`  ✗ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Recursively find all .svelte and .ts files
 */
function* findFiles(dir, extensions = ['.svelte', '.ts', '.js']) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip node_modules, .svelte-kit, backups, etc.
    if (entry.isDirectory()) {
      if (!['node_modules', '.svelte-kit', 'build', 'dist', 'archived', 'backups', 'archived-backups'].includes(entry.name)) {
        yield* findFiles(fullPath, extensions);
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      yield fullPath;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  log('🚀 Phase 1: Automated Error Fixes');
  log('─'.repeat(60));

  const srcDir = path.join(ROOT, 'src');
  const files = [...findFiles(srcDir)];
  
  log(`📁 Found ${files.length} files to process`);
  log('');

  let processed = 0;
  for (const file of files) {
    processFile(file);
    processed++;
    
    if (processed % 100 === 0) {
      log(`⏳ Progress: ${processed}/${files.length} files (${stats.fixes} fixes, ${stats.errors} errors)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  log('');
  log('─'.repeat(60));
  log('✅ Phase 1 Complete');
  log(`📊 Statistics:`);
  log(`   Files modified: ${stats.files}`);
  log(`   Total fixes: ${stats.fixes}`);
  log(`   Errors: ${stats.errors}`);
  log(`   Time: ${elapsed}s`);
  log(`   Log: ${path.relative(ROOT, logFile)}`);

  // Write summary
  const summary = {
    phase: 1,
    timestamp: new Date().toISOString(),
    stats,
    elapsed: parseFloat(elapsed)
  };

  fs.writeFileSync(
    path.join(ROOT, 'agentic-error-resolution', 'logs', 'phase1-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  return stats.errors === 0 ? 0 : 1;
}

main().then(process.exit).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
