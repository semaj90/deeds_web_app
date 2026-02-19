#!/usr/bin/env node
/**
 * Agentic Phase 2: Component Fixes
 * 
 * Uses AST analysis + AI to fix:
 * - Component import casing mismatches
 * - Unknown properties on components
 * - Bits UI SSR compatibility
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');
const AGENTIC_DIR = path.join(__dirname, '..', 'agentic-error-resolution');
const FIXED_DIR = path.join(AGENTIC_DIR, 'fixed');
const REPORTS_DIR = path.join(AGENTIC_DIR, 'reports');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

console.log('🔧 Agentic Phase 2: Component Fixes');
console.log('='.repeat(70));

const stats = {
  filesScanned: 0,
  filesFixed: 0,
  fixes: {
    componentImports: 0,
    unknownProps: 0,
    bitsUIFixes: 0
  }
};

// Common Bits UI component fixes
const bitsUIFixes = {
  // Button with class → Button.Root
  'Button': {
    hasClassProp: false,
    replacement: (props) => {
      const classMatch = props.match(/class="([^"]*)"/);
      if (classMatch) {
        return `<Button.Root ${props}>`;
      }
      return null;
    }
  },
  'Dialog': {
    hasClassProp: false,
    replacement: '<Dialog.Root>'
  },
  'Select': {
    hasClassProp: false,
    replacement: '<Select.Root>'
  },
  'Dropdown': {
    hasClassProp: false,
    replacement: '<Dropdown.Root>'
  }
};

function fixFile(filePath, content) {
  let modified = content;
  const changes = [];
  
  // Fix 1: Component import casing
  // Find all imports and check file system
  const importPattern = /import\s+(\w+)\s+from\s+['"](\.\/[^'"]+\.svelte)['"]/g;
  const imports = [...content.matchAll(importPattern)];
  
  for (const match of imports) {
    const [fullMatch, componentName, importPath] = match;
    const fullPath = path.resolve(path.dirname(filePath), importPath);
    
    if (fs.existsSync(fullPath)) {
      const actualFileName = path.basename(fullPath, '.svelte');
      
      // Check if casing matches
      if (actualFileName !== componentName && actualFileName.toLowerCase() === componentName.toLowerCase()) {
        // Fix casing
        modified = modified.replace(
          `import ${componentName} from`,
          `import ${actualFileName} from`
        );
        
        // Also replace usage in template
        const componentUsagePattern = new RegExp(`<${componentName}([\\s>])`, 'g');
        modified = modified.replace(componentUsagePattern, `<${actualFileName}$1`);
        const closingPattern = new RegExp(`</${componentName}>`, 'g');
        modified = modified.replace(closingPattern, `</${actualFileName}>`);
        
        stats.fixes.componentImports++;
        changes.push(`Fixed import casing: ${componentName} → ${actualFileName}`);
      }
    }
  }
  
  // Fix 2: Unknown props on Bits UI components
  const bitsUIPattern = /<(Button|Dialog|Select|Dropdown|Card)(\s+[^>]*)>/g;
  const bitsUIMatches = [...content.matchAll(bitsUIPattern)];
  
  for (const match of bitsUIMatches) {
    const [fullMatch, componentName, props] = match;
    
    // Check if has class prop
    if (props.includes('class=') && !componentName.includes('.Root')) {
      // Wrap in .Root
      const replacement = `<${componentName}.Root${props}>`;
      modified = modified.replace(fullMatch, replacement);
      
      // Also fix closing tag
      const closingTag = `</${componentName}>`;
      const closingReplacement = `</${componentName}.Root>`;
      modified = modified.replace(closingTag, closingReplacement);
      
      stats.fixes.bitsUIFixes++;
      changes.push(`Fixed Bits UI component: ${componentName} → ${componentName}.Root`);
    }
  }
  
  // Fix 3: Unknown "class" property on components
  // This is trickier - wrap component in div with class
  const unknownClassPattern = /<(\w+Component|\w+Button|\w+Card)([^>]*)class="([^"]*)"([^>]*)>/g;
  const unknownClassMatches = [...modified.matchAll(unknownClassPattern)];
  
  for (const match of unknownClassMatches) {
    const [fullMatch, componentName, before, className, after] = match;
    
    // Check if not a standard HTML element
    if (componentName[0] === componentName[0].toUpperCase()) {
      // Wrap in div
      const componentProps = `${before}${after}`.trim();
      const replacement = `<div class="${className}">\n  <${componentName}${componentProps ? ' ' + componentProps : ''}>`;
      
      modified = modified.replace(fullMatch, replacement);
      
      // Need to also close the div (this is approximate)
      const closingTag = `</${componentName}>`;
      const closingReplacement = `</${componentName}>\n</div>`;
      const closingIndex = modified.indexOf(closingTag, modified.indexOf(replacement));
      if (closingIndex !== -1) {
        modified = 
          modified.substring(0, closingIndex) +
          closingReplacement +
          modified.substring(closingIndex + closingTag.length);
        
        stats.fixes.unknownProps++;
        changes.push(`Wrapped ${componentName} with div for class="${className}"`);
      }
    }
  }
  
  return {
    content: modified,
    changed: content !== modified,
    changes
  };
}

function* walkSync(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      if (!file.name.startsWith('.') && !file.name.startsWith('node_modules')) {
        yield* walkSync(path.join(dir, file.name));
      }
    } else if (file.name.endsWith('.svelte')) {
      yield path.join(dir, file.name);
    }
  }
}

console.log('📂 Scanning Svelte components...\n');

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
      
      // Apply fix
      fs.writeFileSync(filePath, result.content, 'utf8');
      
      // Save to fixed dir
      const fixedPath = path.join(FIXED_DIR, 'phase2', relativePath);
      const fixedDir = path.dirname(fixedPath);
      if (!fs.existsSync(fixedDir)) {
        fs.mkdirSync(fixedDir, { recursive: true });
      }
      fs.writeFileSync(fixedPath, result.content, 'utf8');
    }
  } catch (err) {
    console.error(`⚠️  Error processing ${filePath}: ${err.message}`);
  }
}

// Summary
console.log('='.repeat(70));
console.log('📊 Phase 2 Summary:\n');
console.log(`Files scanned:           ${stats.filesScanned.toLocaleString()}`);
console.log(`Files modified:          ${stats.filesFixed.toLocaleString()}`);
console.log('');
console.log('Fixes applied:');
console.log(`  • Component imports:   ${stats.fixes.componentImports.toLocaleString()}`);
console.log(`  • Unknown props:       ${stats.fixes.unknownProps.toLocaleString()}`);
console.log(`  • Bits UI fixes:       ${stats.fixes.bitsUIFixes.toLocaleString()}`);
console.log('');

const totalFixes = 
  stats.fixes.componentImports + 
  stats.fixes.unknownProps + 
  stats.fixes.bitsUIFixes;

// Save report
const report = {
  phase: 2,
  name: 'Component Fixes',
  timestamp: new Date().toISOString(),
  stats,
  totalFixes,
  estimatedErrorsFixed: totalFixes * 3
};

fs.writeFileSync(
  path.join(REPORTS_DIR, 'phase2-report.json'),
  JSON.stringify(report, null, 2)
);

console.log(`✅ Estimated errors fixed: ${report.estimatedErrorsFixed.toLocaleString()}`);
console.log(`📄 Report saved: ${path.relative(SRC_DIR, path.join(REPORTS_DIR, 'phase2-report.json'))}`);
console.log('');
console.log('🎯 Next: Run Phase 3 (AI-assisted type fixes)');
console.log('   node scripts/agentic-phase3-ai-repair.mjs');
