#!/usr/bin/env node
/**
 * Phase 76: Automated Component Props Migration Script
 * Converts Svelte 4 `export let` props to Svelte 5 `$props()` pattern
 *
 * Usage:
 *   node scripts/migrate-props.mjs --dry-run
 *   node scripts/migrate-props.mjs --apply
 *   node scripts/migrate-props.mjs --file src/lib/components/MyComponent.svelte
 */

import fs from 'fs';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const SPECIFIC_FILE = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];

if (!DRY_RUN && !APPLY) {
  console.log('❌ Please specify --dry-run or --apply');
  console.log('\nUsage:');
  console.log('  node scripts/migrate-props.mjs --dry-run    # Preview changes');
  console.log('  node scripts/migrate-props.mjs --apply      # Apply changes');
  console.log('  node scripts/migrate-props.mjs --file=path  # Migrate specific file\n');
  process.exit(1);
}

console.log('🔧 Phase 76: Component Props Migration\n');
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '✏️ APPLY CHANGES'}\n`);

// Extract export let statements from file
function extractExportLets(content) {
  const exportLetPattern = /export let (\w+)(?:: ([^=;]+))?(?: = ([^;]+))?;/g;
  const matches = [];
  let match;

  while ((match = exportLetPattern.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      name: match[1],
      type: match[2]?.trim(),
      defaultValue: match[3]?.trim()
    });
  }

  return matches;
}

// Generate Props interface
function generatePropsInterface(props) {
  if (props.length === 0) return null;

  const propLines = props.map(prop => {
    const isOptional = prop.defaultValue !== undefined;
    const typeAnnotation = prop.type || 'any';
    return `\t\t${prop.name}${isOptional ? '?' : ''}: ${typeAnnotation};`;
  });

  return `\tinterface Props {\n${propLines.join('\n')}\n\t}`;
}

// Generate destructuring statement
function generateDestructuring(props) {
  if (props.length === 0) return null;

  const destructureLines = props.map(prop => {
    if (prop.defaultValue) {
      return `\t\t${prop.name} = ${prop.defaultValue}`;
    }
    return `\t\t${prop.name}`;
  });

  return `\tlet {\n${destructureLines.join(',\n')}\n\t}: Props = $props();`;
}

// Migrate a single file
function migrateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract export let statements
  const props = extractExportLets(content);

  if (props.length === 0) {
    return { migrated: false, reason: 'No export let found' };
  }

  // Find script tag
  const scriptMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    return { migrated: false, reason: 'No script tag found' };
  }

  const scriptAttrs = scriptMatch[1];
  const scriptContent = scriptMatch[2];

  // Remove export let statements
  let newScriptContent = scriptContent;
  for (const prop of props) {
    newScriptContent = newScriptContent.replace(prop.fullMatch, '');
  }

  // Generate new code
  const propsInterface = generatePropsInterface(props);
  const destructuring = generateDestructuring(props);

  // Build new script tag
  const newScript = `<script${scriptAttrs}>
${propsInterface}

${destructuring}
${newScriptContent.trim()}
</script>`;

  const newContent = content.replace(scriptMatch[0], newScript);

  return {
    migrated: true,
    content: newContent,
    propsCount: props.length,
    props: props.map(p => p.name)
  };
}

// Main migration process
async function main() {
  let files;

  if (SPECIFIC_FILE) {
    files = [SPECIFIC_FILE];
  } else {
    // Find all .svelte files
    files = await glob('src/**/*.svelte', { ignore: ['**/node_modules/**', '**/.svelte-kit/**'] });
  }

  console.log(`📁 Found ${files.length} Svelte files\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  const results = [];

  for (const file of files) {
    const result = migrateFile(file);

    if (result.migrated) {
      migratedCount++;

      console.log(`✅ ${file}`);
      console.log(`   Props migrated: ${result.props.join(', ')}\n`);

      if (APPLY) {
        fs.writeFileSync(file, result.content, 'utf-8');
      }

      results.push({ file, ...result });
    } else {
      skippedCount++;
      if (DRY_RUN) {
        console.log(`⏭️  ${file} - ${result.reason}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total files scanned: ${files.length}`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped: ${skippedCount}`);

  if (DRY_RUN) {
    console.log('\n💡 Run with --apply to apply these changes');
  } else if (APPLY) {
    console.log('\n✅ All changes have been applied!');
  }

  if (results.length > 0) {
    console.log('\n📝 Migrated Files:');
    results.forEach(r => {
      console.log(`  - ${r.file} (${r.propsCount} props)`);
    });
  }
}

main().catch(err => {
  console.error('💥 Migration failed:', err);
  process.exit(1);
});
