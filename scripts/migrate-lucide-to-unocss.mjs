#!/usr/bin/env node
/**
 * Migrate @lucide/svelte → UnoCSS icon classes (i-lucide-*)
 *
 * Handles:
 *   - import Xxx from '@lucide/svelte/icons/xxx'
 *   - import { Xxx, Yyy } from '@lucide/svelte'
 *   - <Xxx /> → <span class="i-lucide-xxx" />
 *   - <Xxx class="..." /> → <span class="i-lucide-xxx ..." />
 *   - size={N} → w-N h-N mapping
 *   - Removes strokeWidth, color props
 *
 * Does NOT handle:
 *   - Icons used as values (passed as props to components)
 *   - Dynamic icon selection
 *   - Corrupted import syntax (colons instead of commas)
 *
 * Usage: node scripts/migrate-lucide-to-unocss.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = 'sveltekit-frontend/src';

// Find all files with lucide imports
function findFiles() {
  try {
    const result = execSync(
      `grep -rl "@lucide/svelte\\|lucide-svelte" ${ROOT} --include="*.svelte" --include="*.ts"`,
      { encoding: 'utf8' }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function pascalToKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

const SIZE_MAP = {
  '10': 'w-2.5 h-2.5',
  '12': 'w-3 h-3',
  '14': 'w-3.5 h-3.5',
  '16': 'w-4 h-4',
  '18': 'w-4.5 h-4.5',
  '20': 'w-5 h-5',
  '24': 'w-6 h-6',
  '28': 'w-7 h-7',
  '32': 'w-8 h-8',
  '36': 'w-9 h-9',
  '40': 'w-10 h-10',
  '48': 'w-12 h-12',
};

function sizeToClasses(size) {
  return SIZE_MAP[size] || `w-[${size}px] h-[${size}px]`;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const iconMap = new Map(); // localName → kebab-case icon name
  const warnings = [];

  // ── Pattern 1: import Xxx from '@lucide/svelte/icons/xxx' ──────────
  const p1 = /import\s+(\w+)\s+from\s+['"](?:@lucide\/svelte|lucide-svelte)\/icons\/([\w-]+)['"]\s*;?\s*\n?/g;
  let m;
  while ((m = p1.exec(content)) !== null) {
    iconMap.set(m[1], m[2]);
  }

  // ── Pattern 2: import { Xxx, Yyy } from '@lucide/svelte' ──────────
  const p2 = /import\s*\{([^}]+)\}\s*from\s+['"](?:@lucide\/svelte|lucide-svelte)['"]\s*;?\s*\n?/g;
  while ((m = p2.exec(content)) !== null) {
    const raw = m[1];
    // Detect corrupted syntax (colons instead of commas)
    if (raw.includes(':') && !raw.includes(' as ')) {
      warnings.push(`CORRUPTED import syntax in ${filePath}: ${raw.substring(0, 60)}...`);
      continue;
    }
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const asParts = part.split(/\s+as\s+/);
      const originalName = asParts[0].trim();
      const alias = asParts.length > 1 ? asParts[1].trim() : originalName;
      if (/^[A-Z]/.test(originalName)) {
        iconMap.set(alias, pascalToKebab(originalName));
      }
    }
  }

  if (iconMap.size === 0) {
    if (warnings.length > 0) warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
    return { changed: false, icons: 0, warnings };
  }

  // ── Remove all lucide import lines ─────────────────────────────────
  content = content.replace(
    /import\s+\w+\s+from\s+['"](?:@lucide\/svelte|lucide-svelte)\/icons\/[\w-]+['"]\s*;?\s*\n?/g,
    ''
  );
  content = content.replace(
    /import\s*\{[^}]+\}\s*from\s+['"](?:@lucide\/svelte|lucide-svelte)['"]\s*;?\s*\n?/g,
    ''
  );

  // ── Replace icon components in template ────────────────────────────
  for (const [localName, kebab] of iconMap) {
    const iconClass = `i-lucide-${kebab}`;

    // Self-closing no attrs: <Search />
    content = content.replace(
      new RegExp(`<${localName}\\s*/>`, 'g'),
      `<span class="${iconClass} inline-block" />`
    );

    // Self-closing with attrs: <Search class="w-5 h-5" size={20} />
    const attrRe = new RegExp(`<${localName}\\s+([^>]*?)\\s*/>`, 'g');
    content = content.replace(attrRe, (_full, attrs) => {
      // Extract class
      let cls = '';
      const clsMatch = attrs.match(/class=["']([^"']+)["']/);
      if (clsMatch) cls = clsMatch[1];

      // Also handle class={`...`} template literals
      const clsDynMatch = attrs.match(/class=\{`([^`]+)`\}/);
      if (clsDynMatch) cls = clsDynMatch[1];

      // Extract size
      let sizeC = '';
      const sizeMatch = attrs.match(/size=\{(\d+)\}/);
      if (sizeMatch) sizeC = sizeToClasses(sizeMatch[1]);
      const sizeStrMatch = attrs.match(/size=["'](\d+)["']/);
      if (!sizeC && sizeStrMatch) sizeC = sizeToClasses(sizeStrMatch[1]);

      // Build class string
      const parts = [iconClass, cls, sizeC].filter(Boolean);
      // Add inline-block if not already present
      if (!parts.some(p => p.includes('inline-block') || p.includes('block'))) {
        parts.push('inline-block');
      }
      const finalClass = parts.join(' ');

      // Keep other attrs (onclick, aria-*, data-*, etc.)
      let other = attrs
        .replace(/class=["'][^"']*["']\s*/g, '')
        .replace(/class=\{`[^`]*`\}\s*/g, '')
        .replace(/class=\{[^}]+\}\s*/g, '')
        .replace(/size=\{[^}]+\}\s*/g, '')
        .replace(/size=["'][^"']*["']\s*/g, '')
        .replace(/strokeWidth=\{[^}]+\}\s*/g, '')
        .replace(/stroke-width=["'][^"']*["']\s*/g, '')
        .replace(/color=["'][^"']*["']\s*/g, '')
        .trim();

      const otherStr = other ? ` ${other}` : '';
      return `<span class="${finalClass}"${otherStr} />`;
    });

    // Check for non-self-closing usage: <Search>...</Search>
    const openCloseRe = new RegExp(`<${localName}(\\s[^>]*)?>([\\s\\S]*?)</${localName}>`, 'g');
    if (openCloseRe.test(content)) {
      warnings.push(`${localName}: open/close tag usage — needs manual review`);
    }

    // Check if icon name is still used in TS code (as a value/prop)
    const valueRe = new RegExp(`\\b${localName}\\b`, 'g');
    // Count remaining occurrences after import removal
    const remaining = (content.match(valueRe) || []).length;
    // Subtract template occurrences (already replaced)
    if (remaining > 0) {
      // Check if it's used in script section (not template)
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch && valueRe.test(scriptMatch[1])) {
        warnings.push(`${localName}: still referenced in <script> — may be used as prop/value`);
      }
    }
  }

  // Clean up multiple blank lines left by import removal
  content = content.replace(/\n{3,}/g, '\n\n');

  const changed = content !== original;

  if (changed && !DRY_RUN) {
    fs.writeFileSync(filePath, content);
  }

  return { changed, icons: iconMap.size, warnings, iconMap };
}

// ── Main ─────────────────────────────────────────────────────────────
const files = findFiles();
console.log(`Found ${files.length} files with lucide imports`);
if (DRY_RUN) console.log('DRY RUN — no files will be modified\n');

let totalMigrated = 0;
let totalIcons = 0;
const allWarnings = [];
const allIcons = new Set();

for (const file of files) {
  const result = processFile(file);
  if (result.changed) {
    totalMigrated++;
    totalIcons += result.icons;
    if (result.iconMap) {
      for (const [, kebab] of result.iconMap) allIcons.add(kebab);
    }
    console.log(`  ✅ ${file} (${result.icons} icons)`);
  } else if (result.warnings.length > 0) {
    console.log(`  ⚠️  ${file} (skipped — warnings)`);
  }
  for (const w of result.warnings) {
    allWarnings.push(w);
    console.log(`     ⚠️  ${w}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Migrated: ${totalMigrated}/${files.length} files`);
console.log(`Icons replaced: ${totalIcons}`);
console.log(`Unique icon names: ${allIcons.size}`);
console.log(`Warnings: ${allWarnings.length}`);

if (allWarnings.length > 0) {
  console.log('\nAll warnings:');
  for (const w of allWarnings) console.log(`  ⚠️  ${w}`);
}

// Output safelist suggestion for UnoCSS
if (allIcons.size > 0) {
  console.log('\n--- Safelist for unocss.config.ts (if needed) ---');
  const sorted = [...allIcons].sort();
  for (const icon of sorted) {
    console.log(`    'i-lucide-${icon}',`);
  }
}
