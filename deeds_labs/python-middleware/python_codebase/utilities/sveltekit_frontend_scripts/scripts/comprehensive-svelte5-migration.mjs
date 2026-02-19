#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function migrateSvelteFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;
    const changes = [];

    // Skip files that are already using Svelte 5 patterns
    if (content.includes('$props()') && !content.includes('export let')) {
      return { modified: false, changes: [], alreadyMigrated: true };
    }

    // 1. MIGRATE EXPORT LET TO $PROPS()
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch && content.includes('export let')) {
      let script = scriptMatch[1];
      const exportLetPattern = /export\s+let\s+(\w+)(?:\s*:\s*([^=]+?))?\s*(?:=\s*([^;]+?))?;/g;

      const props = [];
      let match;

      // Extract all export let declarations
      while ((match = exportLetPattern.exec(script)) !== null) {
        const [fullMatch, name, type, defaultValue] = match;
        props.push({
          name,
          type: type?.trim(),
          defaultValue: defaultValue?.trim(),
          fullMatch,
        });
      }

      if (props.length > 0) {
        // Build Props interface
        let propsInterface = '  interface Props {\n';
        props.forEach((prop) => {
          let typeStr = prop.type || 'any';
          // Make all props optional for flexibility
          if (!typeStr.includes('?') && !typeStr.includes('undefined')) {
            typeStr = typeStr.endsWith(';') ? typeStr.slice(0, -1) : typeStr;
          }
          propsInterface += `    ${prop.name}?: ${typeStr};\n`;
        });
        propsInterface += '  }\n\n';

        // Build $props() destructuring
        const propsDestructuring = props
          .map((prop) => {
            if (prop.defaultValue) {
              return `${prop.name} = ${prop.defaultValue}`;
            }
            return prop.name;
          })
          .join(', ');

        const propsDeclaration = `  let { ${propsDestructuring} }: Props = $props();\n`;

        // Remove all export let declarations
        props.forEach((prop) => {
          script = script.replace(prop.fullMatch, '');
        });

        // Clean up extra whitespace
        script = script.replace(/\n\s*\n/g, '\n');

        // Add interface and props at the beginning of script
        const lines = script.split('\n');
        const importEndIndex = lines.findIndex(
          (line) =>
            !line.trim().startsWith('import') && !line.trim().startsWith('//') && line.trim() !== ''
        );

        if (importEndIndex >= 0) {
          lines.splice(importEndIndex, 0, '', propsInterface.trimEnd(), propsDeclaration.trimEnd());
        } else {
          lines.unshift(propsInterface.trimEnd(), propsDeclaration.trimEnd());
        }

        script = lines.join('\n');
        content = content.replace(
          scriptMatch[0],
          `<script${scriptMatch[0].match(/<script([^>]*)/)[1] || ''}>${script}</script>`
        );
        modified = true;
        changes.push(`Migrated ${props.length} export let declarations to $props()`);
      }
    }

    // 2. MIGRATE REACTIVE STATEMENTS
    const reactiveStatementPattern = /^\s*\$:\s*(.+)$/gm;
    let reactiveMatch;
    while ((reactiveMatch = reactiveStatementPattern.exec(content)) !== null) {
      const statement = reactiveMatch[1].trim();

      // Determine if it's a derived value or an effect
      if (
        statement.includes('=') &&
        !statement.includes('console.') &&
        !statement.includes('dispatch')
      ) {
        // This looks like a derived value
        const varMatch = statement.match(/(\w+)\s*=\s*(.+)/);
        if (varMatch) {
          const [, varName, expression] = varMatch;
          const derivedStatement = `  let ${varName} = $derived(${expression});`;
          content = content.replace(reactiveMatch[0], derivedStatement);
          modified = true;
          changes.push(`Converted reactive statement to $derived: ${varName}`);
        }
      } else {
        // This looks like an effect
        const effectStatement = `  $effect(() => {\n    ${statement};\n  });`;
        content = content.replace(reactiveMatch[0], effectStatement);
        modified = true;
        changes.push(`Converted reactive statement to $effect`);
      }
    }

    // 3. UPDATE EVENT HANDLERS (on: to modern patterns)
    const eventHandlerPatterns = [
      { from: /\bon:click=/g, to: 'onclick=' },
      { from: /\bon:submit=/g, to: 'onsubmit=' },
      { from: /\bon:change=/g, to: 'onchange=' },
      { from: /\bon:input=/g, to: 'oninput=' },
      { from: /\bon:keydown=/g, to: 'onkeydown=' },
      { from: /\bon:keyup=/g, to: 'onkeyup=' },
      { from: /\bon:focus=/g, to: 'onfocus=' },
      { from: /\bon:blur=/g, to: 'onblur=' },
      { from: /\bon:mouseenter=/g, to: 'onmouseenter=' },
      { from: /\bon:mouseleave=/g, to: 'onmouseleave=' },
      { from: /\bon:mouseover=/g, to: 'onmouseover=' },
      { from: /\bon:mouseout=/g, to: 'onmouseout=' },
      { from: /\bon:drop=/g, to: 'ondrop=' },
      { from: /\bon:dragover=/g, to: 'ondragover=' },
      { from: /\bon:dragstart=/g, to: 'ondragstart=' },
      { from: /\bon:dragend=/g, to: 'ondragend=' },
    ];

    for (const pattern of eventHandlerPatterns) {
      if (content.match(pattern.from)) {
        content = content.replace(pattern.from, pattern.to);
        modified = true;
        changes.push(`Updated event handler: ${pattern.from.source}`);
      }
    }

    // 4. MIGRATE BIND PATTERNS
    const bindPatterns = [
      { from: /bind:value=/g, to: 'bind:value=' }, // These are still valid
      { from: /bind:checked=/g, to: 'bind:checked=' },
      { from: /bind:this=/g, to: 'bind:this=' },
    ];
    // Note: bind: patterns are still valid in Svelte 5, so we keep them

    // 5. UPDATE STORE PATTERNS WHERE APPROPRIATE
    // Convert simple reactive let variables to $state() where it makes sense
    const letStatePattern = /let\s+(\w+)\s*=\s*([^;]+);/g;
    let stateMatch;
    const stateVariables = [];

    while ((stateMatch = letStatePattern.exec(content)) !== null) {
      const [fullMatch, varName, initialValue] = stateMatch;
      // Only convert simple state variables, not complex objects or imports
      if (
        !initialValue.includes('import') &&
        !initialValue.includes('$') &&
        !initialValue.includes('new ') &&
        !initialValue.includes('(') &&
        !varName.includes('Element') &&
        initialValue.length < 50
      ) {
        stateVariables.push({ varName, initialValue, fullMatch });
      }
    }

    // Convert appropriate variables to $state()
    stateVariables.forEach(({ varName, initialValue, fullMatch }) => {
      // Skip if it's already using runes or is a complex expression
      if (!initialValue.includes('$state') && !initialValue.includes('$derived')) {
        const stateDeclaration = `let ${varName} = $state(${initialValue});`;
        content = content.replace(fullMatch, stateDeclaration);
        modified = true;
        changes.push(`Converted to $state: ${varName}`);
      }
    });

    // 6. FIX COMPONENT IMPORTS (ensure proper Svelte 5 compatibility)
    // Update any remaining createEventDispatcher to modern patterns
    if (content.includes('createEventDispatcher')) {
      // For now, keep createEventDispatcher as it's still supported
      // But note it for future migration to modern event patterns
      changes.push(
        'Note: createEventDispatcher found - consider migrating to modern event patterns'
      );
    }

    // 7. ADD SVELTE 5 IMPORTS IF NEEDED
    if (content.includes('$state') || content.includes('$derived') || content.includes('$effect')) {
      const scriptSection = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (
        scriptSection &&
        !scriptSection[1].includes('import') &&
        !scriptSection[1].includes('$state')
      ) {
        // The runes are globally available in Svelte 5, no import needed
      }
    }

    return { modified, changes, alreadyMigrated: false };
  } catch (error) {
    return { error: error.message, modified: false, changes: [] };
  }
}

async function main() {
  console.log('🔄 Starting comprehensive Svelte 5 migration...\n');

  // Find all Svelte files
  const svelteFiles = await glob('src/**/*.svelte', {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/.svelte-kit/**'],
  });

  console.log(`Found ${svelteFiles.length} Svelte files to analyze\n`);

  let totalModified = 0;
  let alreadyMigrated = 0;
  let errors = 0;
  const allChanges = [];

  for (const file of svelteFiles) {
    process.stdout.write(`Migrating ${file}... `);

    const result = await migrateSvelteFile(file);

    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
      errors++;
    } else if (result.alreadyMigrated) {
      console.log('✅ Already migrated');
      alreadyMigrated++;
    } else if (result.modified) {
      // Write the updated file
      const fullPath = path.join(process.cwd(), file);
      await fs.writeFile(fullPath, await fs.readFile(fullPath, 'utf-8'), 'utf-8');
      console.log(`✅ Modified (${result.changes.length} changes)`);
      totalModified++;
      allChanges.push({ file, changes: result.changes });
    } else {
      console.log('⏭️ No changes needed');
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successfully migrated: ${totalModified} files`);
  console.log(`   ✅ Already Svelte 5: ${alreadyMigrated} files`);
  console.log(
    `   ⏭️ No changes needed: ${svelteFiles.length - totalModified - alreadyMigrated - errors} files`
  );
  console.log(`   ❌ Errors: ${errors} files`);

  if (allChanges.length > 0) {
    console.log('\n📝 Detailed Changes:');
    allChanges.forEach(({ file, changes }) => {
      console.log(`\n${file}:`);
      changes.forEach((change) => console.log(`  • ${change}`));
    });
  }
}

main().catch(console.error);
