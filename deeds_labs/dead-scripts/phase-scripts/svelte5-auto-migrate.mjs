#!/usr/bin/env node

/**
 * Svelte 5 Auto-Migration Script
 * Based on ACE_SVELTE5_MIGRATION_PATTERNS.md
 *
 * Targets src directory for systematic migration
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

let stats = {
  filesProcessed: 0,
  propsFixed: 0,
  lifecycleFixed: 0,
  reactiveFixed: 0,
  eventsFixed: 0,
  stateFixed: 0,
  errors: []
};

// Migration patterns
const PATTERNS = {
  // Phase 1: Export let props
  exportLet: {
    regex: /export\s+let\s+(\w+)(?:\s*:\s*([^;=]+))?(?:\s*=\s*([^;]+))?;/g,
    description: 'export let → $props()'
  },

  // Phase 2: Lifecycle imports
  lifecycleImports: {
    regex: /import\s*\{([^}]*(?:onMount|onDestroy|beforeUpdate|afterUpdate)[^}]*)\}\s*from\s*['"]svelte['"];?/g,
    description: 'Lifecycle imports'
  },

  // Phase 3: Reactive assignments
  reactiveAssignment: {
    regex: /\$:\s*(\w+)\s*=\s*([^;]+);/g,
    description: '$: assignment → $derived'
  },

  // Phase 4: Reactive blocks (simple)
  reactiveBlock: {
    regex: /\$:\s*\{([^}]+)\}/g,
    description: '$: { block } → $effect'
  },

  // Phase 5: Event handlers (on:event)
  eventHandlers: {
    regex: /\bon:(\w+)=/g,
    description: 'on:event → onevent'
  },

  // Phase 6: createEventDispatcher
  eventDispatcher: {
    regex: /import\s*\{\s*createEventDispatcher\s*\}\s*from\s*['"]svelte['"];?\s*const\s+dispatch\s*=\s*createEventDispatcher\(\);?/g,
    description: 'createEventDispatcher → callback props'
  }
};

async function getAllFiles(dir, extension = '.svelte') {
  const files = [];

  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .svelte-kit, build, etc.
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

function migrateExportLet(content) {
  const props = [];
  let newContent = content;

  // Extract all export let declarations
  const matches = [...content.matchAll(PATTERNS.exportLet.regex)];

  if (matches.length === 0) return { content, count: 0 };

  for (const match of matches) {
    const [fullMatch, name, type, defaultValue] = match;

    props.push({
      name,
      type: type?.trim(),
      default: defaultValue?.trim(),
      original: fullMatch
    });
  }

  // Build $props() destructuring
  const propNames = props.map(p => {
    if (p.default) {
      return `${p.name} = ${p.default}`;
    }
    return p.name;
  }).join(', ');

  const propTypes = props.map(p => {
    const isOptional = p.default ? '?' : '';
    return `${p.name}${isOptional}: ${p.type || 'any'}`;
  }).join('; ');

  const propsDeclaration = `let { ${propNames} }: { ${propTypes} } = $props();`;

  // Remove all export let declarations
  for (const prop of props) {
    newContent = newContent.replace(prop.original, '');
  }

  // Add $props() at the beginning of script
  const scriptMatch = newContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const updatedScript = `<script${newContent.match(/<script([^>]*)>/)[1]}>\n  ${propsDeclaration}\n${scriptContent}</script>`;
    newContent = newContent.replace(scriptMatch[0], updatedScript);
  }

  return { content: newContent, count: props.length };
}

function migrateLifecycle(content) {
  let newContent = content;
  let count = 0;

  // Remove lifecycle imports
  const importMatches = [...content.matchAll(PATTERNS.lifecycleImports.regex)];

  for (const match of importMatches) {
    newContent = newContent.replace(match[0], '// Migrated to $effect');
    count++;
  }

  // Convert onMount
  newContent = newContent.replace(
    /onMount\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/g,
    (match, body) => {
      count++;
      return `$effect(() => {\n${body}\n});`;
    }
  );

  // Convert onMount with async
  newContent = newContent.replace(
    /onMount\(\s*async\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/g,
    (match, body) => {
      count++;
      return `$effect(() => {\n  (async () => {\n${body}\n  })();\n});`;
    }
  );

  // Convert onDestroy
  newContent = newContent.replace(
    /onDestroy\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/g,
    (match, body) => {
      count++;
      // This needs to be combined with previous $effect as cleanup
      return `// TODO: Add as cleanup in $effect: return () => {${body}}`;
    }
  );

  return { content: newContent, count };
}

function migrateReactiveStatements(content) {
  let newContent = content;
  let count = 0;

  // Simple reactive assignments
  newContent = newContent.replace(
    PATTERNS.reactiveAssignment.regex,
    (match, varName, expression) => {
      count++;
      return `let ${varName} = $derived(${expression});`;
    }
  );

  // Reactive blocks (convert to $effect)
  newContent = newContent.replace(
    PATTERNS.reactiveBlock.regex,
    (match, body) => {
      count++;
      return `$effect(() => {${body}});`;
    }
  );

  return { content: newContent, count };
}

function migrateEventHandlers(content) {
  let newContent = content;
  let count = 0;

  // on:event → onevent
  newContent = newContent.replace(
    PATTERNS.eventHandlers.regex,
    (match, eventName) => {
      count++;
      return `on${eventName}=`;
    }
  );

  return { content: newContent, count };
}

async function migrateFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const original = content;

    // Apply migrations in order
    const propsResult = migrateExportLet(content);
    content = propsResult.content;
    stats.propsFixed += propsResult.count;

    const lifecycleResult = migrateLifecycle(content);
    content = lifecycleResult.content;
    stats.lifecycleFixed += lifecycleResult.count;

    const reactiveResult = migrateReactiveStatements(content);
    content = reactiveResult.content;
    stats.reactiveFixed += reactiveResult.count;

    const eventsResult = migrateEventHandlers(content);
    content = eventsResult.content;
    stats.eventsFixed += eventsResult.count;

    // Only write if content changed
    if (content !== original) {
      await fs.writeFile(filePath, content, 'utf-8');
      stats.filesProcessed++;

      const relativePath = path.relative(ROOT_DIR, filePath);
      console.log(`✅ Migrated: ${relativePath}`);
    }

  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🚀 Starting Svelte 5 Auto-Migration...\n');
  console.log(`📁 Target directory: ${SRC_DIR}\n`);

  const files = await getAllFiles(SRC_DIR);
  console.log(`📊 Found ${files.length} files to process\n`);

  for (const file of files) {
    await migrateFile(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Props migrated: ${stats.propsFixed}`);
  console.log(`Lifecycle hooks migrated: ${stats.lifecycleFixed}`);
  console.log(`Reactive statements migrated: ${stats.reactiveFixed}`);
  console.log(`Event handlers migrated: ${stats.eventsFixed}`);

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${stats.errors.length}`);
    stats.errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }

  console.log('\n✅ Migration complete!');
  console.log('\n📋 Next steps:');
  console.log('  1. Review changes: git diff');
  console.log('  2. Run type check: npx svelte-check --threshold error');
  console.log('  3. Test application');
  console.log('  4. Commit if successful: git commit -am "Svelte 5 migration"');
}

main().catch(console.error);
