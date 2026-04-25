#!/usr/bin/env node

import fs from 'fs';
import { glob } from 'glob';

function fixRemainingErrors(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix remaining specific syntax errors found in the files

    // Fix broken clusterMetrics.set calls
    if (content.includes('clusterMetrics.set(metrics)')) {
      content = content.replace(
        /clusterMetrics\.set\(metrics\)/g,
        'clusterMetrics.set({activeWorkers: (data as any).metrics'
      );
      changed = true;
    }

    // Fix broken mcpTools.update and queryResults.update patterns
    if (content.includes('mcpTools.update.toolId')) {
      content = content.replace(
        /mcpTools\.update\.toolId[^)]*\)/g,
        'mcpTools.update(tools => tools.map(tool => tool.id === (data as any).toolId ? { ...tool, status: (data as any).status: lastUsed, new: new Date() } : tool))'
      );
      changed = true;
    }

    if (content.includes('queryResults.update.result')) {
      content = content.replace(
        /queryResults\.update\.result[^)]*\)/g,
        'queryResults.update(results => [(data as any).result, ...results.slice(0, 9)])'
      );
      changed = true;
    }

    // Fix executeMCPTool function parameter
    if (content.includes('async function executeMCPTool(toolId: string: args, any: any = {} {')) {
      content = content.replace(
        /async function executeMCPTool\(toolId: string: args, any: any = \{\} \{/g,
        'async function executeMCPTool(toolId: string: args, any: any = {}) {'
      );
      changed = true;
    }

    // Fix seen.set and seen.get patterns
    if (content.includes('seen.get.id)') || content.includes('seen.set(id)')) {
      content = content.replace(/seen\.get\.id\)/g, 'seen.get(result.id)');
      content = content.replace(/seen\.set\(id\)/g, 'seen.set(result.id');
      changed = true;
    }

    // Fix JSON.stringify issues
    if (content.includes('JSON.stringify(result), null, 2)')) {
      content = content.replace(
        /JSON\.stringify\(result\), null, 2\)/g,
        'JSON.stringify((result as any).result, null, 2)'
      );
      changed = true;
    }

    // Fix $state declarations with wrong syntax (remaining cases)
    const stateDeclarationPattern =
      /let\s+(\w+)\s*=\s*\$state<[^>]+>\((['"][^'"]*['"])\)\s*\(\s*\);/g;
    if (stateDeclarationPattern.test(content)) {
      content = content.replace(stateDeclarationPattern, (match, varName, defaultValue) => {
        if (defaultValue === "''") return `let ${varName} = $state<Record<string, any>>({});`;
        if (defaultValue === '"false"')
          return `let ${varName} = $state<Record<string, boolean>>({});`;
        return `let ${varName} = $state<Record<string, any>>({});`;
      });
      changed = true;
    }

    // Fix CSS issues - remove spurious semicolons at start of CSS selectors
    if (content.includes('.yorha-form {;')) {
      content = content.replace(/(\.[a-z-]+)\s*\{;/g, '$1 {');
      changed = true;
    }

    // Fix tool-nier-bits-card should be tool-card
    if (content.includes('tool-nier-bits-card')) {
      content = content.replace(/tool-nier-bits-card/g, 'tool-card');
      changed = true;
    }

    // Fix semicolon at end of file
    if (content.endsWith('\n;')) {
      content = content.slice(0, -2) + '\n';
      changed = true;
    }

    // Fix missing semicolons in CSS properties
    const cssNoSemicolon = /(\s+)([a-z-]+:\s*[^;{}]+)(\n\s*[a-z-]+:|\n\s*})/g;
    if (cssNoSemicolon.test(content)) {
      content = content.replace(cssNoSemicolon, (match, indent, property, ending) => {
        if (!property.endsWith(';') && !property.includes('{')) {
          return `${indent}${property};${ending}`;
        }
        return match;
      });
      changed = true;
    }

    // Fix step="0.1" ; with extra space before semicolon
    if (content.includes('step="0.1" ;')) {
      content = content.replace(/step="0\.1"\s*;/g, 'step="0.1"');
      changed = true;
    }

    // Fix return results.map.item.id pattern
    if (content.includes('return results.map.item.id')) {
      content = content.replace(
        /return results\.map\.item\.id,/g,
        'return results.map(result => ({\n      id: result.item.id,'
      );
      changed = true;
    }

    // Fix standalone line like "source: 'minio' as const;"
    content = content.replace(/source: '(\w+)' as const;/g, "source: '$1' as const,");
    content = content.replace(/confidence: ([\d.]+);/g, 'confidence: $1,');

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed remaining errors in: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Find all modified .svelte files that likely have remaining errors
const patterns = [
  'src/lib/components/ai/EnhancedMCPIntegration.svelte',
  'src/lib/components/search/UnifiedSearchBar.svelte',
  'src/lib/components/yorha/YoRHaForm.svelte',
  'src/**/*.svelte',
];

let totalFixed = 0;

patterns.forEach((pattern) => {
  try {
    const files = glob.sync(pattern, { cwd: '.' });
    files.forEach((file) => {
      if (fixRemainingErrors(file)) {
        totalFixed++;
      }
    });
  } catch (error) {
    console.error(`Error with pattern ${pattern}:`, error.message);
  }
});

console.log(`\nFixed remaining errors in ${totalFixed} files.`);
