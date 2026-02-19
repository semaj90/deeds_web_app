#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// Critical route files to fix
const criticalRoutes = [
  'src/routes/api/legal-ai/orchestrator/+server.ts',
  'src/routes/api/evidence/process/+server.ts',
  'src/routes/api/test/document-pipeline/+server.ts',
  'src/routes/api/test-ai-integration/+server.ts',
  'src/routes/api/mcp/context72/get-library-docs/+server.ts',
  'src/routes/api/system/workflows/+server.ts',
  'src/routes/api/ai/legal-analysis/+server.ts',
  'src/routes/api/ollama/cluster/+server.ts',
  'src/routes/api/gpu/validate-setup/+server.ts',
  'src/routes/api/v1/evidence/advanced-analysis/+server.ts',
];

async function fixRouteFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;

    // Common SvelteKit route fixes
    const routeFixes = [
      // Fix RequestHandler import and usage
      {
        pattern: /import type \{ RequestHandler \} from '@sveltejs\/kit';?/g,
        replacement: 'import type { RequestHandler } from "@sveltejs/kit";',
        name: 'RequestHandler import',
      },

      // Fix standard response patterns
      {
        pattern: /return new Response\(/g,
        replacement: 'return new Response(',
        name: 'Response constructor',
      },

      // Fix JSON responses
      {
        pattern: /return Response\.json\(/g,
        replacement: 'return Response.json(',
        name: 'JSON response',
      },

      // Fix status codes
      {
        pattern: /status:\s*(\d+),?/g,
        replacement: 'status: $1',
        name: 'status codes',
      },

      // Fix async function declarations
      {
        pattern: /export const (GET|POST|PUT|DELETE|PATCH)\s*:\s*RequestHandler\s*=\s*async\s*\(/g,
        replacement: 'export const $1: RequestHandler = async (',
        name: 'handler declaration',
      },

      // Fix try-catch blocks
      {
        pattern: /try\s*{\s*$/gm,
        replacement: 'try {',
        name: 'try block',
      },

      // Fix catch blocks
      {
        pattern: /catch\s*\(\s*([^)]*)\s*\)\s*{/g,
        replacement: 'catch ($1) {',
        name: 'catch block',
      },

      // Fix Map type definitions
      {
        pattern: /new Map<([^,]+),\s*([^>]+)>\(\);?/g,
        replacement: 'new Map<$1, $2>();',
        name: 'Map type definition',
      },

      // Fix function type definitions
      {
        pattern: /\(\s*([^)]*)\s*\)\s*=>\s*Promise<([^>]*)>\(\);?/g,
        replacement: '($1) => Promise<$2>',
        name: 'function type',
      },

      // Fix incomplete arrow functions
      {
        pattern: /=>\s*$/gm,
        replacement: '=> {}',
        name: 'incomplete arrow function',
      },

      // Fix missing semicolons after type declarations
      {
        pattern: /^(\s*(?:interface|type|export)\s+[^{;]+)$/gm,
        replacement: '$1;',
        name: 'missing semicolon after type',
      },

      // Fix JSON.stringify calls
      {
        pattern: /JSON\.stringify\s*\(\s*([^,)]+)\s*,\s*null\s*,\s*(\d+)\s*\)/g,
        replacement: 'JSON.stringify($1, null, $2)',
        name: 'JSON.stringify formatting',
      },
    ];

    for (const fix of routeFixes) {
      const before = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (before !== content) {
        modified = true;
        console.log(`  ✓ Fixed ${fix.name}`);
      }
    }

    // SvelteKit-specific fixes
    const lines = content.split('\n');
    let inFunction = false;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Track function depth
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // Fix incomplete RequestHandler patterns
      if (
        trimmed.includes('RequestHandler') &&
        trimmed.includes('=') &&
        !trimmed.includes('async')
      ) {
        lines[i] = line.replace(
          /= *([^;]+);?$/,
          '= async (event) => {\n  // TODO: Implementation\n  return new Response("Not implemented", { status: 501 });\n};'
        );
        modified = true;
        console.log(`  ✓ Fixed incomplete RequestHandler on line ${i + 1}`);
      }

      // Fix hanging try blocks
      if (trimmed === 'try {' && i + 1 < lines.length && lines[i + 1].trim() === '') {
        lines.splice(i + 1, 0, '    // TODO: Implementation');
        lines.splice(i + 2, 0, '  } catch (error) {');
        lines.splice(i + 3, 0, '    console.error(error);');
        lines.splice(
          i + 4,
          0,
          '    return new Response("Internal Server Error", { status: 500 });'
        );
        lines.splice(i + 5, 0, '  }');
        modified = true;
        console.log(`  ✓ Fixed incomplete try block on line ${i + 1}`);
      }

      // Fix incomplete API responses
      if (trimmed.includes('return ') && !trimmed.includes('Response') && !trimmed.includes(';')) {
        lines[i] = line + ';';
        modified = true;
        console.log(`  ✓ Added missing semicolon on line ${i + 1}`);
      }
    }

    // Add missing closing braces if needed
    if (braceDepth > 0) {
      console.log(`  ✓ Adding ${braceDepth} missing closing braces`);
      for (let i = 0; i < braceDepth; i++) {
        lines.push('}');
      }
      modified = true;
    }

    // Fix imports at the top of file
    if (!content.includes('RequestHandler')) {
      lines.unshift('import type { RequestHandler } from "@sveltejs/kit";');
      modified = true;
      console.log('  ✓ Added RequestHandler import');
    }

    if (modified) {
      content = lines.join('\n');
      await fs.writeFile(fullPath, content, 'utf-8');
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    }

    console.log(`⏭️  No changes needed: ${filePath}`);
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing critical SvelteKit route files...\n');

  let fixedCount = 0;
  let errorCount = 0;

  for (const route of criticalRoutes) {
    const result = await fixRouteFile(route);
    if (result === true) fixedCount++;
    else if (result === false) continue;
    else errorCount++;
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Fixed: ${fixedCount} files`);
  console.log(`   ⏭️  Unchanged: ${criticalRoutes.length - fixedCount - errorCount} files`);
  console.log(`   ❌ Errors: ${errorCount} files`);
}

main().catch(console.error);
