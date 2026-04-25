#!/usr/bin/env node

/**
 * Svelte 5 Migration Fixer: Rule D - Component Props Modernization
 *
 * Converts legacy prop declarations to modern Svelte 5 syntax.
 * Pattern: export let prop; → let { prop } = $props();
 * Pattern: export let prop = default; → let { prop = default } = $props();
 */

import glob from 'fast-glob';
import fs from 'fs';

async function fixComponentProps() {
  console.log('🔧 Starting Rule D: Component Props Modernization');

  // Find all Svelte files
  const files = await glob([
    'src/**/*.svelte',
    '!node_modules/**',
    '!dist/**',
    '!build/**'
  ]);

  let fixedCount = 0;
  let totalFiles = files.length;

  console.log(`📁 Found ${totalFiles} Svelte files to check`);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      let modified = false;
      let newContent = content;

      // Find the script block
      const scriptMatch = newContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (!scriptMatch) continue;

      const scriptContent = scriptMatch[1];

      // Collect all export let declarations
      const exportLetDeclarations = [];
      const exportLetPattern = /export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*([^;]+))?;?\s*$/gm;

      let match;
      while ((match = exportLetPattern.exec(scriptContent)) !== null) {
        const [, propName, defaultValue] = match;
        exportLetDeclarations.push({
          propName,
          defaultValue: defaultValue ? defaultValue.trim() : undefined,
          fullMatch: match[0]
        });
      }

      if (exportLetDeclarations.length === 0) continue;

      // Create the $props() declaration
      const propsDeclaration = exportLetDeclarations
        .map(decl => decl.defaultValue ? `${decl.propName} = ${decl.defaultValue}` : decl.propName)
        .join(', ');

      const propsStatement = `let { ${propsDeclaration} } = $props();`;

      // Replace all export let declarations with the $props() statement
      let newScriptContent = scriptContent;
      exportLetDeclarations.forEach(decl => {
        newScriptContent = newScriptContent.replace(decl.fullMatch, '');
      });

      // Add the $props() statement at the beginning of the script block
      newScriptContent = propsStatement + '\n\n' + newScriptContent.trim();

      // Clean up extra whitespace
      newScriptContent = newScriptContent.replace(/\n{3,}/g, '\n\n');

      // Update the script block
      newContent = newContent.replace(scriptMatch[0], `<script>\n${newScriptContent}\n</script>`);

      console.log(`✅ Modernized props in ${file}: ${exportLetDeclarations.length} props converted`);
      modified = true;

      if (modified) {
        fs.writeFileSync(file, newContent);
        fixedCount++;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Rule D Complete!`);
  console.log(`📊 Fixed ${fixedCount} files out of ${totalFiles} total files`);
  console.log(`📈 Success rate: ${((fixedCount / totalFiles) * 100).toFixed(1)}%`);
}

// Run the fixer
fixComponentProps().catch(console.error);