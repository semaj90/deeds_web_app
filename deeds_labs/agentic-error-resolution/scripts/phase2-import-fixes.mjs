#!/usr/bin/env node
/**
 * Phase 2: Semi-Automated Component Import Fixes
 * Targets: ~4.5K errors (missing/incorrect imports)
 * - Fix default imports → named imports for UI components
 * - Add missing component imports
 * - Normalize Bits-UI component imports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.join(ROOT, 'agentic-error-resolution/logs');
const ERROR_DIR = path.join(ROOT, 'agentic-error-resolution/errors');

const logFile = path.join(LOG_DIR, `phase2-${Date.now()}.log`);

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// Common UI kit component mappings
const COMPONENT_MAPPINGS = {
  'card': { 
    module: '$lib/components/ui/card',
    exports: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter']
  },
  'button': {
    module: '$lib/components/ui/button',
    exports: ['Button']
  },
  'dialog': {
    module: '$lib/components/ui/dialog',
    exports: ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter']
  },
  'input': {
    module: '$lib/components/ui/input',
    exports: ['Input']
  },
  'label': {
    module: '$lib/components/ui/label',
    exports: ['Label']
  },
  'toast': {
    module: '$lib/components/ui/toast',
    exports: ['Toast', 'ToastAction', 'ToastClose', 'ToastDescription', 'ToastProvider', 'ToastTitle', 'ToastViewport', 'Toaster']
  }
};

function findUsedComponents(content) {
  const used = new Set();
  
  // Find components used in template
  const componentRegex = /<([A-Z][a-zA-Z]+)/g;
  let match;
  
  while ((match = componentRegex.exec(content)) !== null) {
    used.add(match[1]);
  }
  
  return used;
}

function getImportSection(content) {
  const lines = content.split('\n');
  const scriptStartIndex = lines.findIndex(l => l.trim().startsWith('<script'));
  const scriptEndIndex = lines.findIndex((l, i) => i > scriptStartIndex && l.trim() === '</script>');
  
  if (scriptStartIndex === -1) return { start: 0, end: 0, lines: [] };
  
  return {
    start: scriptStartIndex,
    end: scriptEndIndex,
    lines: lines.slice(scriptStartIndex + 1, scriptEndIndex)
  };
}

function fixDefaultImports(content) {
  // Convert default imports to named imports for UI components
  let result = content;
  
  for (const [key, config] of Object.entries(COMPONENT_MAPPINGS)) {
    const defaultPattern = new RegExp(
      `import\\s+${config.exports[0]}\\s+from\\s+['"]${config.module}['"];`,
      'g'
    );
    
    const namedImport = `import { ${config.exports.join(', ')} } from '${config.module}';`;
    result = result.replace(defaultPattern, namedImport);
  }
  
  return result;
}

function addMissingImports(content) {
  const usedComponents = findUsedComponents(content);
  const importSection = getImportSection(content);
  
  const existingImports = new Set();
  for (const line of importSection.lines) {
    const match = line.match(/import\s+(?:{([^}]+)}|(\w+))\s+from/);
    if (match) {
      if (match[1]) {
        // Named imports
        match[1].split(',').forEach(name => existingImports.add(name.trim()));
      } else if (match[2]) {
        // Default import
        existingImports.add(match[2].trim());
      }
    }
  }
  
  const missingImports = [];
  
  for (const component of usedComponents) {
    if (!existingImports.has(component)) {
      // Find which module this component belongs to
      for (const [key, config] of Object.entries(COMPONENT_MAPPINGS)) {
        if (config.exports.includes(component)) {
          missingImports.push({
            component,
            module: config.module,
            exports: config.exports
          });
          break;
        }
      }
    }
  }
  
  if (missingImports.length === 0) return content;
  
  // Group by module
  const byModule = {};
  for (const mi of missingImports) {
    if (!byModule[mi.module]) {
      byModule[mi.module] = new Set(mi.exports);
    }
  }
  
  // Generate import statements
  const newImports = Object.entries(byModule).map(([module, exports]) => {
    return `  import { ${Array.from(exports).join(', ')} } from '${module}';`;
  }).join('\n');
  
  // Insert after <script> tag
  const lines = content.split('\n');
  const scriptIndex = lines.findIndex(l => l.trim().startsWith('<script'));
  
  if (scriptIndex !== -1) {
    lines.splice(scriptIndex + 1, 0, newImports);
    return lines.join('\n');
  }
  
  return content;
}

async function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    content = fixDefaultImports(content);
    content = addMissingImports(content);
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (err) {
    log(`❌ Error processing ${filePath}: ${err.message}`);
    return false;
  }
}

async function findSvelteFiles(dir) {
  const files = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

async function main() {
  log('🚀 Phase 2: Semi-Automated Component Import Fixes');
  log(`📁 Root: ${ROOT}`);
  
  const srcDir = path.join(ROOT, 'src');
  const files = await findSvelteFiles(srcDir);
  
  log(`📊 Found ${files.length} Svelte files`);
  
  let fixedCount = 0;
  
  for (const file of files) {
    const modified = await processFile(file);
    if (modified) {
      fixedCount++;
      log(`✅ Fixed: ${path.relative(ROOT, file)}`);
    }
  }
  
  log(`\n✨ Phase 2 Complete: ${fixedCount}/${files.length} files modified`);
  log(`📝 Log: ${logFile}`);
  
  const summary = {
    phase: 2,
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    modifiedFiles: fixedCount,
    estimatedErrorsFixed: fixedCount * 5
  };
  
  fs.writeFileSync(
    path.join(ERROR_DIR, 'phase2-summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
