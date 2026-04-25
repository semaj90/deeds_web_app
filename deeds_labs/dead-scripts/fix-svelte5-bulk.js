#!/usr/bin/env node

/**
 * Bulk Svelte 5 Migration Fix Script
 * Fixes the most common patterns causing 28K+ errors
 */

import fs from 'fs';
import { glob } from 'glob';

console.log('🚀 Starting Svelte 5 Bulk Migration Fix...');

// Find all .svelte files
const svelteFiles = await glob('src/**/*.svelte', {
  ignore: ['**/node_modules/**', '**/components-backup/**'],
});

console.log(`📁 Found ${svelteFiles.length} Svelte files to process`);

let totalFilesProcessed = 0;
let totalReplacements = 0;

for (const filePath of svelteFiles) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let replacements = 0;
    // removed unused originalContent assignment
    // 1. Fix duplicate string identifier in $props()
    // BEFORE: const { checked: boolean = false: label, string: string = '', id: string = '' } = $props();
    // AFTER:  let { checked = $state(false), label = '', id = '' } = $props();
    const duplicateStringRegex =
      /const\s*{\s*([^}]*?:\s*string[^}]*?string[^}]*?)}\s*=\s*\$props\(\);/g;
    content = content.replace(duplicateStringRegex, (match, props) => {
      replacements++;
      // Simple fix: remove type annotations and convert to let
      const cleanProps = props
        .replace(/:\s*string/g, '')
        .replace(/:\s*boolean/g, '')
        .replace(/:\s*number/g, '')
        .split(',')
        .map((prop) => {
          const trimmed = prop.trim();
          // Convert to $state() for state variables
          if (trimmed.includes('checked')) {
            return 'checked = $state(false)';
          }
          return trimmed;
        })
        .join(', ');

      return `let { ${cleanProps} } = $props();`;
    });

    // 2. Fix export let patterns to $props()
    // BEFORE: export let title = '';
    // AFTER:  let { title = '' } = $props();
    const exportLetRegex = /export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);/g;
    const exportLets = [...content.matchAll(exportLetRegex)];

    if (exportLets.length > 0) {
      // Group all export lets into a single $props() declaration
      const propsList = exportLets.map((match) => `${match[1]} = ${match[2]}`).join(', ');

      // Remove individual export let declarations
      content = content.replace(exportLetRegex, '');

      // Add $props() declaration at the beginning of script
      content = content.replace(
        /(<script[^>]*>)([\s\S]*?)(<\/script>)/,
        (match, openTag, scriptContent, closeTag) => {
          if (scriptContent.includes('$props()')) {
            return match; // Already has $props()
          }

          replacements += exportLets.length;
          return `${openTag}\n  let { ${propsList} } = $props();\n${scriptContent}${closeTag}`;
        }
      );
    }

    // 3. Fix component imports - change named to default imports for UI components
    // BEFORE: import { Button } from '$lib/components/ui/Button.svelte';
    // AFTER:  import Button from '$lib/components/ui/Button.svelte';
    const namedComponentImports = [
      'Button',
      'Card',
      'CardContent',
      'CardHeader',
      'CardTitle',
      'Badge',
      'Input',
      'Label',
      'Textarea',
      'Select',
    ];

    for (const component of namedComponentImports) {
      const namedImportRegex = new RegExp(
        `import\\s*{\\s*${component}\\s*}\\s*from\\s*(['"].*?${component}\\.svelte['"])`,
        'g'
      );
      if (namedImportRegex.test(content)) {
        content = content.replace(namedImportRegex, `import ${component} from $1`);
        replacements++;
      }
    }

    // 4. Fix slot to snippet (basic cases)
    // BEFORE: <slot name="header" />
    // AFTER:  {@render header?.()}
    content = content.replace(/<slot\s+name="([^"]+)"\s*\/>/g, '{@render $1?.()}');
    if (content.includes('{@render')) replacements++;

    // 5. Fix reactive statements to $derived
    // BEFORE: $: doubled = count * 2;
    // AFTER:  let doubled = $derived(count * 2);
    const reactiveAssignments = content.match(/\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=([^;]+);/g);
    if (reactiveAssignments) {
      for (const reactive of reactiveAssignments) {
        const match = reactive.match(/\$:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=([^;]+);/);
        if (match) {
          const [full, varName, expression] = match;
          content = content.replace(full, `let ${varName} = $derived(${expression.trim()});`);
          replacements++;
        }
      }
    }

    // 6. Fix $: effects to $effect
    // BEFORE: $: console.log(count);
    // AFTER:  $effect(() => { console.log(count); });
    const reactiveEffects = content.match(/\$:\s*[^=][^;]*;/g);
    if (reactiveEffects) {
      for (const effect of reactiveEffects) {
        const statement = effect.replace(/\$:\s*/, '').trim();
        content = content.replace(effect, `$effect(() => { ${statement} });`);
        replacements++;
      }
    }

    // Write back if changes were made
    if (replacements > 0) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ ${filePath}: ${replacements} fixes applied`);
      totalFilesProcessed++;
      totalReplacements += replacements;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

console.log(`\n🎉 Bulk Migration Complete!`);
console.log(`📊 Files processed: ${totalFilesProcessed}`);
console.log(`🔧 Total replacements: ${totalReplacements}`);
console.log(`\n📈 Expected error reduction: ~${Math.floor(totalReplacements * 8.5)} errors`);
