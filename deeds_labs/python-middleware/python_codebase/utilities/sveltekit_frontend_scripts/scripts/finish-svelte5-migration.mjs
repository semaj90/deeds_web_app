#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function finishMigration(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;

    // Remove TODO comments about migration
    if (content.includes('<!-- TODO: migrate export lets to $props()')) {
      content = content.replace(/<!-- TODO: migrate export lets to \$props\(\)[^>]*-->/g, '');
      modified = true;
    }

    // Look for actual export let patterns that weren't migrated
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch && content.includes('export let')) {
      let script = scriptMatch[1];
      const exportLetPattern = /export\s+let\s+(\w+)(?:\s*:\s*([^=]+?))?\s*(?:=\s*([^;]+?))?;/g;

      const props = [];
      let match;

      while ((match = exportLetPattern.exec(script)) !== null) {
        const [fullMatch, name, type, defaultValue] = match;
        props.push({
          name,
          type: type?.trim() || 'any',
          defaultValue: defaultValue?.trim(),
          fullMatch,
        });
      }

      if (props.length > 0) {
        console.log(`  Found ${props.length} export let declarations`);

        // Build Props interface
        let propsInterface = '  interface Props {\n';
        props.forEach((prop) => {
          propsInterface += `    ${prop.name}?: ${prop.type};\n`;
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

        // Remove export let declarations
        props.forEach((prop) => {
          script = script.replace(prop.fullMatch, '');
        });

        // Clean up whitespace
        script = script.replace(/\n\s*\n\s*\n/g, '\n\n');

        // Add interface and props at the beginning
        const lines = script.split('\n');
        const insertIndex = lines.findIndex(
          (line) =>
            line.trim() && !line.trim().startsWith('import') && !line.trim().startsWith('//')
        );

        if (insertIndex >= 0) {
          lines.splice(insertIndex, 0, '', propsInterface.trimEnd(), propsDeclaration.trimEnd());
        } else {
          lines.unshift('', propsInterface.trimEnd(), propsDeclaration.trimEnd());
        }

        script = lines.join('\n');
        content = content.replace(
          scriptMatch[0],
          `<script${scriptMatch[0].match(/<script([^>]*)/)[1] || ''}>${script}</script>`
        );
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(fullPath, content, 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Finishing Svelte 5 migration...\n');

  // Find files with remaining export let patterns
  const svelteFiles = await glob('src/**/*.svelte', {
    cwd: process.cwd(),
  });

  let processedCount = 0;

  for (const file of svelteFiles) {
    const content = await fs.readFile(path.join(process.cwd(), file), 'utf-8');

    if (content.includes('export let') || content.includes('TODO: migrate export lets')) {
      process.stdout.write(`Processing ${file}... `);
      const result = await finishMigration(file);

      if (result) {
        console.log('✅ Migrated');
        processedCount++;
      } else {
        console.log('⏭️ No changes');
      }
    }
  }

  console.log(`\n📊 Finished: ${processedCount} files processed`);
}

main().catch(console.error);
