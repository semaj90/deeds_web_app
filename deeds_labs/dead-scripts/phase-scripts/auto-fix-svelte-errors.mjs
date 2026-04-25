#!/usr/bin/env node

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Color output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`)
};

/**
 * Fix Pattern 1: lucide-svelte icon imports (named → default imports with /icons/)
 */
function fixLucideImports(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: import { IconName } from 'lucide-svelte' → import IconName from 'lucide-svelte/icons/icon-name'
  const namedImportPattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]lucide-svelte['"]/g;

  fixed = fixed.replace(namedImportPattern, (match, imports) => {
    const iconList = imports
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let replacement = '';
    for (const icon of iconList) {
      const kebabCase = icon
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .substring(1); // Remove leading dash
      replacement += `import ${icon} from 'lucide-svelte/icons/${kebabCase}';\n`;
    }
    changes++;
    return replacement.trim();
  });

  // Fix import type { Icon } from 'lucide-svelte' (should be value import)
  const typeImportPattern = /import\s+type\s+\{\s*([^}]+)\s*\}\s*from\s*['"]lucide-svelte['"]/g;
  fixed = fixed.replace(typeImportPattern, (match, imports) => {
    const iconList = imports
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    let replacement = '';
    for (const icon of iconList) {
      const kebabCase = icon
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .substring(1);
      replacement += `import ${icon} from 'lucide-svelte/icons/${kebabCase}';\n`;
    }
    changes++;
    return replacement.trim();
  });

  return { fixed, changes };
}

/**
 * Fix Pattern 2: Svelte 5 runes - export let → $props()
 */
function fixSvelteRunes(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Find script tags
  const scriptMatch = fixed.match(/<script[^>]*lang="ts"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    return { fixed, changes };
  }

  const scriptContent = scriptMatch[1];
  const beforeScript = fixed.substring(0, scriptMatch.index);
  const afterScript = fixed.substring(scriptMatch.index + scriptMatch[0].length);

  let newScriptContent = scriptContent;

  // Pattern: export let foo; export let bar = 'default';
  // → let { foo, bar = 'default' } = $props();
  const exportLetPattern = /export\s+let\s+(\w+)(\s*=\s*([^;]+))?;/g;

  const exports = [];
  newScriptContent = newScriptContent.replace(exportLetPattern, (match, name, _, defaultValue) => {
    exports.push({
      name,
      defaultValue: defaultValue ? defaultValue.trim() : undefined
    });
    return ''; // Remove the line
  });

  if (exports.length > 0) {
    // Build $props() declaration
    const propsDecl = exports
      .map((exp) => exp.defaultValue ? `${exp.name} = ${exp.defaultValue}` : exp.name)
      .join(', ');

    const newDeclaration = `let { ${propsDecl} } = $props();`;

    // Insert after imports
    const importEndIndex = newScriptContent.lastIndexOf('\n', newScriptContent.search(/^[^i]/m)) + 1 || 0;
    newScriptContent = newScriptContent.substring(0, importEndIndex) +
                       newDeclaration + '\n' +
                       newScriptContent.substring(importEndIndex);

    changes++;
  }

  fixed = beforeScript + '<script lang="ts">' + newScriptContent + '</script>' + afterScript;
  return { fixed, changes };
}

/**
 * Fix Pattern 3: Dialog binding - open={open} → bind:open
 */
function fixDialogBinding(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: <Dialog open={open} → <Dialog bind:open
  if (fixed.includes('<Dialog') && fixed.includes('open={')) {
    fixed = fixed.replace(/<Dialog\s+open=\{([^}]+)\}/g, '<Dialog bind:open');
    changes++;
  }

  return { fixed, changes };
}

/**
 * Fix Pattern 4: $bindable() runes for reactive props
 */
function fixBindable(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Replace $props() with $bindable() for bindable state
  if (fixed.includes('let { open =') && !fixed.includes('$bindable')) {
    fixed = fixed.replace(
      /let\s*\{\s*open\s*=\s*(\w+)/,
      'let { open = $bindable($1)'
    );
    changes++;
  }

  return { fixed, changes };
}

/**
 * Fix Pattern 5: Event handler deprecations
 */
function fixEventHandlers(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Pattern: onOpenChange={handler} → onclose={handler}
  if (fixed.includes('onOpenChange=')) {
    fixed = fixed.replace(/onOpenChange=/g, 'onclose=');
    changes++;
  }

  // Pattern: onclick={} → onclick={} (keep for buttons) but onmousedown={} for cards
  // This is handled case-by-case in individual files

  return { fixed, changes };
}

/**
 * Fix Pattern 6: Import paths - fix incorrect bits-ui paths
 */
function fixBitsUIImports(content, filePath) {
  let fixed = content;
  let changes = 0;

  const imports = [
    { from: '$lib/components/ui/card', to: '$lib/components/ui/Card/Card.svelte' },
    { from: '$lib/components/ui/button', to: '$lib/components/ui/button/Button.svelte' },
    { from: '$lib/components/ui/dialog', to: '$lib/components/ui/dialog/Dialog.svelte' },
    { from: '$lib/components/ui/badge', to: '$lib/components/ui/badge/Badge.svelte' },
    { from: '$lib/components/ui/avatar', to: '$lib/components/ui/avatar/Avatar.svelte' }
  ];

  for (const imp of imports) {
    const pattern = new RegExp(`from ['"]${imp.from}['"]`, 'g');
    if (pattern.test(fixed)) {
      fixed = fixed.replace(pattern, `from '${imp.to}'`);
      changes++;
    }
  }

  return { fixed, changes };
}

/**
 * Fix Pattern 7: Type import issues - import vs import type
 */
function fixTypeImports(content, filePath) {
  let fixed = content;
  let changes = 0;

  // Icons should never be type imports
  const typeIconImport = /import\s+type\s+(\{[^}]*\})\s+from\s+['"]lucide-svelte/g;
  if (typeIconImport.test(fixed)) {
    fixed = fixed.replace(typeIconImport, 'import $1 from "lucide-svelte');
    changes++;
  }

  return { fixed, changes };
}

/**
 * Process a single Svelte file
 */
function processSvelteFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let totalChanges = 0;

    // Apply fixes in order
    const fixes = [
      { name: 'Lucide imports', fn: fixLucideImports },
      { name: 'Bits-UI imports', fn: fixBitsUIImports },
      { name: 'Type imports', fn: fixTypeImports },
      { name: 'Svelte runes', fn: fixSvelteRunes },
      { name: 'Dialog binding', fn: fixDialogBinding },
      { name: 'Bindable runes', fn: fixBindable },
      { name: 'Event handlers', fn: fixEventHandlers }
    ];

    for (const fix of fixes) {
      const result = fix.fn(content, filePath);
      content = result.fixed;
      totalChanges += result.changes;
    }

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, changes: totalChanges, filePath };
    }

    return { success: false, changes: 0, filePath };
  } catch (err) {
    return { success: false, error: err.message, filePath };
  }
}

/**
 * Main: Find and process all .svelte files
 */
async function main() {
  log.info(`Scanning for Svelte files in ${projectRoot}...`);

  const svelteFiles = globSync('src/**/*.svelte', {
    cwd: projectRoot,
    absolute: true
  });

  log.info(`Found ${svelteFiles.length} Svelte files`);

  let filesModified = 0;
  let totalChanges = 0;
  const errors = [];

  for (const file of svelteFiles) {
    const result = processSvelteFile(file);

    if (result.error) {
      errors.push(result);
      log.error(`${path.relative(projectRoot, file)}: ${result.error}`);
    } else if (result.changes > 0) {
      filesModified++;
      totalChanges += result.changes;
      log.success(`${path.relative(projectRoot, file)} (${result.changes} fixes)`);
    }
  }

  console.log('');
  log.info(`\n=== Summary ===`);
  log.success(`${filesModified} files modified`);
  log.success(`${totalChanges} total fixes applied`);

  if (errors.length > 0) {
    log.error(`${errors.length} files had errors`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
