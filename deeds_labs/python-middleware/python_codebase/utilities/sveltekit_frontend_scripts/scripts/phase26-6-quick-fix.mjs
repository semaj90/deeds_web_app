#!/usr/bin/env node
/**
 * Phase 26.6: Quick Fix Patch
 * 
 * Automatically fixes the top 3 error patterns:
 * 1. $state placement issues → simple assignment
 * 2. Unterminated strings (extra quotes)
 * 3. Component casing conflicts
 * 4. export let → $props()
 * 5. $: reactive → $derived/$effect
 * 
 * Safe, surgical fixes with backups
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');
const BACKUP_DIR = path.join(__dirname, '..', '.phase26-6-backup-' + Date.now());
const DRY_RUN = process.argv.includes('--dry-run');

console.log('🔧 Phase 26.6: Quick Fix Patch');
console.log('='.repeat(70));
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  APPLY FIXES'}`);
console.log('');

// Statistics
const stats = {
  filesScanned: 0,
  filesFixed: 0,
  fixes: {
    stateAssignment: 0,
    extraQuotes: 0,
    exportLet: 0,
    reactiveStatement: 0,
    componentCasing: 0
  }
};

// Create backup directory
if (!DRY_RUN && !fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Fix patterns
function fixFile(filePath, content) {
  let modified = content;
  let changes = [];
  
  // Fix 1: $state() invalid placement (in try/finally/callbacks)
  // Pattern: loading = $state(false) inside try/catch → loading = false
  const stateInTryPattern = /(?:try|catch|finally)\s*\{[^}]*?(\w+)\s*=\s*\$state\((.*?)\)/gs;
  modified = modified.replace(stateInTryPattern, (match, varName, value) => {
    stats.fixes.stateAssignment++;
    changes.push(`Fixed $state placement: ${varName}`);
    return match.replace(`${varName} = $state(${value})`, `${varName} = ${value}`);
  });
  
  // Fix 2: Unterminated strings (double quotes at end of imports)
  // Pattern: from './Component.svelte'' → from './Component.svelte'
  const extraQuotePattern = /from\s+(['"])([^'"]+)\1\1/g;
  modified = modified.replace(extraQuotePattern, (match, quote, path) => {
    stats.fixes.extraQuotes++;
    changes.push(`Removed extra quote in import: ${path}`);
    return `from ${quote}${path}${quote}`;
  });
  
  // Fix 3: export let → $props() (simple cases only)
  // Pattern: export let data; → const { data } = $props();
  const exportLetPattern = /^(\s*)export\s+let\s+(\w+)(?:\s*:\s*([^;=]+))?\s*(?:=\s*([^;]+))?\s*;/gm;
  modified = modified.replace(exportLetPattern, (match, indent, varName, type, defaultValue) => {
    stats.fixes.exportLet++;
    changes.push(`Migrated export let: ${varName}`);
    
    if (type) {
      // With type: export let data: number; → const { data } = $props<{ data: number }>();
      return `${indent}const { ${varName} } = $props<{ ${varName}: ${type.trim()} }>()`;
    } else if (defaultValue) {
      // With default: export let count = 0; → const { count = 0 } = $props();
      return `${indent}const { ${varName} = ${defaultValue.trim()} } = $props()`;
    } else {
      // Simple: export let name; → const { name } = $props();
      return `${indent}const { ${varName} } = $props()`;
    }
  });
  
  // Fix 4: $: reactive statements → $derived/$effect
  // Pattern: $: doubled = count * 2; → let doubled = $derived(count * 2);
  const reactivePattern = /^(\s*)\$:\s*(\w+)\s*=\s*([^;]+);/gm;
  modified = modified.replace(reactivePattern, (match, indent, varName, expression) => {
    // Check if it's a side effect (has function calls, assignments)
    const isSideEffect = /\(|=(?!=)|\+\+|--/.test(expression);
    
    if (isSideEffect) {
      stats.fixes.reactiveStatement++;
      changes.push(`Converted reactive statement to $effect: ${varName}`);
      return `${indent}$effect(() => {\n${indent}  ${varName} = ${expression};\n${indent}})`;
    } else {
      stats.fixes.reactiveStatement++;
      changes.push(`Converted reactive statement to $derived: ${varName}`);
      return `${indent}let ${varName} = $derived(${expression})`;
    }
  });
  
  // Fix 5: Component import casing
  // Normalize to PascalCase for components
  const importPattern = /import\s+(\w+)\s+from\s+['"](\.[^'"]+\.svelte)['"]/g;
  modified = modified.replace(importPattern, (match, componentName, importPath) => {
    const fileName = path.basename(importPath, '.svelte');
    
    // If filename doesn't match component name (case-wise), suggest fix
    if (fileName !== componentName && fileName.toLowerCase() === componentName.toLowerCase()) {
      stats.fixes.componentCasing++;
      changes.push(`Fixed component casing: ${componentName} → ${fileName}`);
      return `import ${fileName} from '${importPath}'`;
    }
    
    return match;
  });
  
  return {
    content: modified,
    changed: content !== modified,
    changes
  };
}

// Walk directory
function* walkSync(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      if (!file.name.startsWith('.') && !file.name.startsWith('node_modules')) {
        yield* walkSync(path.join(dir, file.name));
      }
    } else if (file.name.endsWith('.svelte') || file.name.endsWith('.ts')) {
      yield path.join(dir, file.name);
    }
  }
}

// Process files
console.log('📂 Scanning files...\n');

for (const filePath of walkSync(SRC_DIR)) {
  stats.filesScanned++;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = fixFile(filePath, content);
    
    if (result.changed) {
      stats.filesFixed++;
      const relativePath = path.relative(SRC_DIR, filePath);
      
      console.log(`✏️  ${relativePath}`);
      result.changes.forEach(change => {
        console.log(`   • ${change}`);
      });
      console.log('');
      
      if (!DRY_RUN) {
        // Create backup
        const backupPath = path.join(BACKUP_DIR, path.relative(SRC_DIR, filePath));
        const backupDir = path.dirname(backupPath);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        fs.writeFileSync(backupPath, content, 'utf8');
        
        // Apply fix
        fs.writeFileSync(filePath, result.content, 'utf8');
      }
    }
  } catch (err) {
    console.error(`⚠️  Error processing ${filePath}: ${err.message}`);
  }
}

// Summary
console.log('='.repeat(70));
console.log('📊 Summary:');
console.log('');
console.log(`Files scanned:           ${stats.filesScanned.toLocaleString()}`);
console.log(`Files modified:          ${stats.filesFixed.toLocaleString()}`);
console.log('');
console.log('Fixes applied:');
console.log(`  • $state assignments:  ${stats.fixes.stateAssignment.toLocaleString()}`);
console.log(`  • Extra quotes:        ${stats.fixes.extraQuotes.toLocaleString()}`);
console.log(`  • export let → $props: ${stats.fixes.exportLet.toLocaleString()}`);
console.log(`  • $: → $derived/$effect: ${stats.fixes.reactiveStatement.toLocaleString()}`);
console.log(`  • Component casing:    ${stats.fixes.componentCasing.toLocaleString()}`);
console.log('');

if (DRY_RUN) {
  console.log('🔍 DRY RUN: No files were modified');
  console.log('   Run without --dry-run to apply fixes');
} else {
  console.log(`✅ Backups saved to: ${path.basename(BACKUP_DIR)}`);
  console.log('');
  console.log('🎯 Next steps:');
  console.log('   1. Run: npx svelte-check');
  console.log('   2. Run: node scripts/normalize-svelte-check.mjs');
  console.log('   3. Run: node scripts/gpu-ast-verifier.mjs');
}

process.exit(0);
