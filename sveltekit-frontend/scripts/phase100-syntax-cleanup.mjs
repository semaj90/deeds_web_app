#!/usr/bin/env node

/**
 * Phase 100: Post-Migration Syntax Cleanup
 * Fixes remaining syntax errors from Svelte 5 migration
 *
 * Top errors to fix:
 * - 538: ';' expected
 * - 439: ',' expected
 * - 325: Declaration or statement expected
 * - 315: Left side of comma operator unused
 * - 241: Unexpected token
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

let stats = {
  filesProcessed: 0,
  semicolonFixed: 0,
  commaFixed: 0,
  propsFixed: 0,
  effectFixed: 0,
  errors: []
};

const PATTERNS = {
  // Fix incomplete $effect(() => { ... }); - missing closing
  incompleteEffect: {
    regex: /\$effect\(\(\)\s*=>\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*$/gm,
    description: 'Incomplete $effect blocks'
  },

  // Fix $props() with trailing commas
  propsTrailingComma: {
    regex: /(\$props\(\))\s*,/g,
    description: '$props() with trailing comma'
  },

  // Fix missing semicolons after $effect
  effectMissingSemicolon: {
    regex: /(\$effect\([^)]+\)\s*\{[^}]+\}\s*\))(?!\s*;)/g,
    description: 'Missing semicolons after $effect'
  },

  // Fix object properties with missing commas
  missingPropertyComma: {
    regex: /:\s*([^,}\n]+)\s+(\w+):/g,
    description: 'Missing commas between object properties'
  },

  // Fix $derived without assignment
  derivedWithoutAssignment: {
    regex: /let\s+(\w+)\s*=\s*\$derived\s*$/gm,
    description: '$derived without expression'
  },

  // Fix incomplete type annotations
  incompleteType: {
    regex: /:\s*\{\s*$/gm,
    description: 'Incomplete type annotations'
  }
};

async function getAllFiles(dir, extension = '.svelte') {
  const files = [];

  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(entry.name)) {
          await traverse(fullPath);
        }
      } else if (entry.name.endsWith(extension) || entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  await traverse(dir);
  return files;
}

function fixPropsTrailingComma(content) {
  let count = 0;
  const fixed = content.replace(PATTERNS.propsTrailingComma.regex, (match, props) => {
    count++;
    return props; // Remove trailing comma
  });
  return { content: fixed, count };
}

function fixEffectMissingSemicolon(content) {
  let count = 0;
  const fixed = content.replace(PATTERNS.effectMissingSemicolon.regex, (match, effectBlock) => {
    count++;
    return `${effectBlock};`;
  });
  return { content: fixed, count };
}

function fixMissingPropertyComma(content) {
  let count = 0;
  // Fix pattern: property: value property2: -> property: value, property2:
  const fixed = content.replace(
    /:\s*([^,{\n]+?)\s+([a-zA-Z_$][\w$]*):/g,
    (match, value, nextProp) => {
      // Don't fix if it looks like a function or class
      if (value.trim().match(/^(function|class|async|=>)/)) {
        return match;
      }
      count++;
      return `: ${value.trim()}, ${nextProp}:`;
    }
  );
  return { content: fixed, count };
}

function fixIncompleteEffect(content) {
  let count = 0;
  const lines = content.split('\n');
  const fixed = [];
  let inEffect = false;
  let braceCount = 0;
  let effectStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('$effect(()')) {
      inEffect = true;
      effectStart = i;
      braceCount = 0;
    }

    if (inEffect) {
      // Count braces
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // Check if effect block is complete
      if (braceCount === 0 && line.includes('}')) {
        // Check if followed by );
        if (!line.includes('});') && !lines[i + 1]?.trim().startsWith(');')) {
          // Fix incomplete effect
          if (line.trim() === '}') {
            fixed.push(line.replace('}', '});'));
            count++;
            inEffect = false;
            continue;
          }
        }
        inEffect = false;
      }
    }

    fixed.push(line);
  }

  return { content: fixed.join('\n'), count };
}

function fixDerivedWithoutAssignment(content) {
  let count = 0;
  const fixed = content.replace(
    /let\s+(\w+)\s*=\s*\$derived\s*;/g,
    (match, varName) => {
      count++;
      // Default to null
      return `let ${varName} = $derived(null);`;
    }
  );
  return { content: fixed, count };
}

async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;
    let changed = false;

    // Apply fixes in sequence
    const propsResult = fixPropsTrailingComma(content);
    if (propsResult.count > 0) {
      content = propsResult.content;
      stats.propsFixed += propsResult.count;
      changed = true;
    }

    const effectSemiResult = fixEffectMissingSemicolon(content);
    if (effectSemiResult.count > 0) {
      content = effectSemiResult.content;
      stats.semicolonFixed += effectSemiResult.count;
      changed = true;
    }

    const commaResult = fixMissingPropertyComma(content);
    if (commaResult.count > 0) {
      content = commaResult.content;
      stats.commaFixed += commaResult.count;
      changed = true;
    }

    const effectResult = fixIncompleteEffect(content);
    if (effectResult.count > 0) {
      content = effectResult.content;
      stats.effectFixed += effectResult.count;
      changed = true;
    }

    const derivedResult = fixDerivedWithoutAssignment(content);
    if (derivedResult.count > 0) {
      content = derivedResult.content;
      stats.effectFixed += derivedResult.count;
      changed = true;
    }

    if (changed) {
      await fs.writeFile(filePath, content, 'utf-8');
      stats.filesProcessed++;

      const relativePath = path.relative(ROOT_DIR, filePath);
      console.log(`✅ Fixed: ${relativePath}`);
    }

  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error: ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Phase 100: Post-Migration Syntax Cleanup\n');
  console.log(`📁 Target: ${SRC_DIR}\n`);

  const files = await getAllFiles(SRC_DIR);
  console.log(`📊 Found ${files.length} files\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 Cleanup Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Props trailing commas fixed: ${stats.propsFixed}`);
  console.log(`Missing semicolons fixed: ${stats.semicolonFixed}`);
  console.log(`Missing commas fixed: ${stats.commaFixed}`);
  console.log(`Incomplete $effect blocks fixed: ${stats.effectFixed}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${stats.errors.length}`);
    stats.errors.slice(0, 10).forEach(e =>
      console.log(`  - ${path.relative(ROOT_DIR, e.file)}: ${e.error}`)
    );
  }

  console.log('\n✅ Cleanup complete!');
  console.log('\n📋 Next: Run `npx svelte-check --threshold error` to verify');
}

main().catch(console.error);
