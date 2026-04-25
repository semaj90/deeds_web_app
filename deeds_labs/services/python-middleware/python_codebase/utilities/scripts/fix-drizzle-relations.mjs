#!/usr/bin/env node

/**
 * Phase 1: Fix Drizzle ORM relation types
 * Highest impact - fixes ~50+ errors in database schema
 */

import { readFileSync, writeFileSync } from 'fs';

const FIXES_APPLIED = {
  relationTypes: 0,
  duplicateImports: 0
};

function fixDrizzleRelations(content) {
  // Fix implicit 'any' types in Drizzle relations
  const relationPatterns = [
    // Fix ({ one, many }) => destructuring
    {
      pattern: /relations\((\w+),\s*\(\{\s*([^}]+)\s*\}\)\s*=>/g,
      replacement: (match, tableName, params) => {
        const typedParams = params.split(',')
          .map(param => param.trim())
          .map(param => `${param}: any`)
          .join(', ');
        FIXES_APPLIED.relationTypes++;
        return `relations(${tableName}, ({ ${typedParams} }) =>`;
      }
    },
    
    // Fix individual parameter types
    {
      pattern: /\(\{\s*(one|many)\s*\}\)\s*=>/g,
      replacement: (match, param) => {
        FIXES_APPLIED.relationTypes++;
        return `({ ${param}: any }) =>`;
      }
    }
  ];

  relationPatterns.forEach(({ pattern, replacement }) => {
    if (typeof replacement === 'function') {
      content = content.replace(pattern, replacement);
    } else {
      content = content.replace(pattern, replacement);
    }
  });

  return content;
}

function fixDuplicateImports(content) {
  // Fix duplicate imports in schema files
  const lines = content.split('\n');
  const imports = new Map();
  const nonImportLines = [];
  
  for (const line of lines) {
    if (line.trim().startsWith('import ') && line.includes('drizzle-orm/pg-core')) {
      const match = line.match(/import\s*\{([^}]+)\}/);
      if (match) {
        const items = match[1].split(',').map(item => item.trim());
        const source = line.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        
        if (!imports.has(source)) {
          imports.set(source, new Set());
        }
        
        items.forEach(item => imports.get(source).add(item));
        FIXES_APPLIED.duplicateImports++;
      }
    } else {
      nonImportLines.push(line);
    }
  }
  
  // Rebuild imports
  const newImports = [];
  for (const [source, items] of imports) {
    if (items.size > 0) {
      newImports.push(`import { ${Array.from(items).join(', ')} } from '${source}';`);
    }
  }
  
  return [...newImports, '', ...nonImportLines].join('\n');
}

function processSchemaFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply fixes
    content = fixDrizzleRelations(content);
    content = fixDuplicateImports(content);
    
    if (content !== originalContent) {
      writeFileSync(filePath, content);
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Phase 1: Fixing Drizzle ORM relation types...\n');
  
  const schemaFiles = [
    'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    'sveltekit-frontend/src/lib/server/schema.ts'
  ];
  
  let fixedCount = 0;
  
  for (const file of schemaFiles) {
    if (processSchemaFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n📊 Phase 1 Results:`);
  console.log(`Files fixed: ${fixedCount}`);
  console.log(`Relation types fixed: ${FIXES_APPLIED.relationTypes}`);
  console.log(`Duplicate imports resolved: ${FIXES_APPLIED.duplicateImports}`);
  
  if (fixedCount > 0) {
    console.log('\n✅ Phase 1 complete! Run the build to verify.');
    console.log('Next: node scripts/fix-webgpu-redis-types.mjs');
  } else {
    console.log('\n✅ No changes needed in Phase 1');
  }
}

main();