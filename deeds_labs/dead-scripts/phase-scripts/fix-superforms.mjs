#!/usr/bin/env node
/**
 * Quick Fix: SuperForms v2 Migration
 * Converts all superValidate calls to use zod() adapter
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function* walkFiles(dir, extensions = ['.ts', '.svelte']) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    // Skip node_modules, .svelte-kit, etc.
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      yield* walkFiles(path, extensions);
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      yield path;
    }
  }
}

async function fixSuperForms(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    return null; // Skip unreadable files
  }

  const original = content;
  let changed = false;

  // Skip if already has zod adapter
  if (content.includes("from 'sveltekit-superforms/adapters'") &&
      content.includes('zod(')) {
    return null;
  }

  // Check if file uses superValidate
  if (!content.includes('superValidate(')) {
    return null;
  }

  // Add zod import if missing
  if (content.includes('superValidate(') &&
      !content.includes("from 'sveltekit-superforms/adapters'")) {

    // Find superValidate import
    const importRegex = /import\s+\{([^}]*superValidate[^}]*)\}\s+from\s+['"]sveltekit-superforms(?:\/server)?['"]/;
    const match = content.match(importRegex);

    if (match) {
      const replacement = match[0] + "\nimport { zod } from 'sveltekit-superforms/adapters';";
      content = content.replace(match[0], replacement);
      changed = true;
    }
  }

  // Fix superValidate calls
  // Pattern 1: superValidate(schema)
  content = content.replace(
    /superValidate\((\w+Schema)\)/g,
    (match, schema) => {
      if (!match.includes('zod(')) {
        changed = true;
        return `superValidate(zod(${schema}))`;
      }
      return match;
    }
  );

  // Pattern 2: superValidate(data, schema)
  content = content.replace(
    /superValidate\((\w+),\s*(\w+Schema)\)/g,
    (match, data, schema) => {
      if (!match.includes('zod(')) {
        changed = true;
        return `superValidate(${data}, zod(${schema}))`;
      }
      return match;
    }
  );

  // Fix type imports of zod (should be value import)
  if (content.includes("import type { zod }")) {
    content = content.replace(
      /import\s+type\s+\{\s*zod\s*\}\s+from\s+['"]sveltekit-superforms\/adapters['"]/g,
      "import { zod } from 'sveltekit-superforms/adapters'"
    );
    changed = true;
  }

  if (changed) {
    await writeFile(filePath, content, 'utf-8');
    return { file: filePath, changes: 'superforms' };
  }

  return null;
}

async function main() {
  console.log('🔧 SuperForms v2 Migration Tool\n');
  console.log('Scanning src/ directory...\n');

  const fixes = [];
  let scanned = 0;

  for await (const file of walkFiles('src')) {
    scanned++;
    const result = await fixSuperForms(file);
    if (result) {
      fixes.push(result);
      console.log(`✅ Fixed: ${file}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Results:`);
  console.log(`   Files scanned: ${scanned}`);
  console.log(`   Files fixed: ${fixes.length}`);
  console.log(`${'='.repeat(80)}\n`);

  if (fixes.length > 0) {
    console.log('🔍 Running type check...\n');
    const { spawn } = await import('child_process');
    const check = spawn('npm', ['run', 'check'], { stdio: 'inherit', shell: true });
    check.on('close', (code) => {
      process.exit(code);
    });
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
