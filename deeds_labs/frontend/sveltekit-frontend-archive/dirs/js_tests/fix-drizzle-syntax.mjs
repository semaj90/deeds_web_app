#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';

console.log('🔧 Fixing Drizzle ORM query syntax...');

// Fix specific files with drizzle issues
const problematicFiles = [
  './src/lib/server/ai/embeddings.ts',
  './src/lib/server/ai/embeddings-enhanced.ts',
  './src/lib/server/services/vector-service.ts',
  './src/lib/server/services/qdrant-service.ts',
  './src/routes/api/embeddings/+server.ts',
  './src/routes/api/qdrant/+server.ts',
  './src/routes/api/embed/+server.ts',
  './src/routes/api/chat/+server.ts',
  './src/routes/api/cases/summary/+server.ts',
  './src/routes/api/evidence/validate/+server.ts',
  './src/lib/server/db/queries.ts',
];

for (const file of problematicFiles) {
  if (!existsSync(file)) {
    console.log(`⚠️  File not found: ${file}`);
    continue;
  }

  let content = readFileSync(file, 'utf-8');
  let changed = false;

  // Fix drizzle select syntax - remove object wrapper
  content = content.replace(/db\.select\(\s*{\s*([^}]+)\s*}\s*\)\.from\(/g, 'db.select().from(');

  // Fix drizzle select with specific columns
  content = content.replace(/db\.select\(\s*{\s*([^}]+)\s*}\s*\)/g, (match, fields) => {
    // Extract field mappings
    const fieldMappings = fields.split(',').map((f) => f.trim());
    const simpleFields = fieldMappings.map((f) => {
      if (f.includes(':')) {
        // Handle aliased fields like title: cases.title
        const [alias, field] = f.split(':').map((s) => s.trim());
        return field;
      }
      return f;
    });
    return `db.select({ ${fields} })`;
  });

  // Fix SQL template literal issues
  content = content.replace(/sql<([^>]+)>`([^`]+)`/g, 'sql`$2`');

  // Fix update queries
  content = content.replace(
    /db\.update\(([^)]+)\)\.set\(([^)]+)\)\.where\(([^)]+)\)(?!\.returning)/g,
    'db.update($1).set($2).where($3).returning()'
  );

  // Fix insert queries
  content = content.replace(
    /db\.insert\(([^)]+)\)\.values\(([^)]+)\)(?!\.returning)/g,
    'db.insert($1).values($2).returning()'
  );

  if (changed || content !== readFileSync(file, 'utf-8')) {
    writeFileSync(file, content);
    console.log(`✅ Fixed Drizzle syntax in ${file}`);
  }
}

console.log('✅ Drizzle ORM syntax fixes completed');
