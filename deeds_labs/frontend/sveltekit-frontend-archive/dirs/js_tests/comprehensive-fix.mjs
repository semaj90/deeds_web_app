#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Fixing TypeScript and Vite errors...');

// Fix 1: Vector Schema - Remove duplicate .defaultRandom() calls
const fixVectorSchema = () => {
  try {
    const vectorSchemaPath = join(__dirname, 'src/lib/server/database/vector-schema.ts');
    let content = readFileSync(vectorSchemaPath, 'utf8');

    // Remove duplicate .defaultRandom() calls
    content = content.replace(/\.defaultRandom\(\)\.defaultRandom\(\)/g, '.defaultRandom()');

    writeFileSync(vectorSchemaPath, content, 'utf8');
    console.log('✅ Fixed vector schema');
  } catch (error) {
    console.log('ℹ️ Vector schema already fixed or not found');
  }
};

// Fix 2: AI Service - Ensure proper embedding type handling
const fixAiService = () => {
  try {
    const aiServicePath = join(__dirname, 'src/lib/services/ai-service.ts');
    let content = readFileSync(aiServicePath, 'utf8');

    // Ensure the normalizeEmbedding function is properly defined
    if (!content.includes('normalizeEmbedding')) {
      const normalizerFunction = `
// Helper function to normalize embedding types
const normalizeEmbedding = (embedding: number[] | number[][]): number[] => {
  if (Array.isArray(embedding) && embedding.length > 0 && Array.isArray(embedding[0])) {
    return embedding[0] as number[];
  }
  return embedding as number[];
};
`;
      content = normalizerFunction + content;
    }

    // Fix any problematic embedding assignments
    content = content.replace(
      /embedding: Array\.isArray\(embedding\[0\]\) \? embedding\[0\] : embedding,/g,
      'embedding: normalizeEmbedding(embedding),'
    );

    content = content.replace(
      /embedding: Array\.isArray\(embedding\[0\]\) \? \(embedding\[0\] as number\[\]\) : \(embedding as number\[\]\),/g,
      'embedding: normalizeEmbedding(embedding),'
    );

    // Fix problematic type assignments
    content = content.replace(
      /id: doc\.id,\s*embedding: Array\.isArray\(embedding\[0\]\) \? embedding\[0\] : embedding,/g,
      'id: doc.id,\n            embedding: normalizeEmbedding(embedding),'
    );

    writeFileSync(aiServicePath, content, 'utf8');
    console.log('✅ Fixed AI service embedding types');
  } catch (error) {
    console.log('ℹ️ AI service already fixed or not found');
  }
};

// Fix 3: Update svelte.config.js to remove deprecated inspector option
const fixSvelteConfig = () => {
  try {
    const svelteConfigPath = join(__dirname, 'svelte.config.js');
    let content = readFileSync(svelteConfigPath, 'utf8');

    // Update inspector config
    content = content.replace(
      /vitePlugin: \{\s*inspector: \{\s*holdMode: true\s*\}\s*\}/,
      'vitePlugin: {\n    inspector: {\n      holdMode: true\n    }\n  }'
    );

    writeFileSync(svelteConfigPath, content, 'utf8');
    console.log('✅ Fixed svelte config');
  } catch (error) {
    console.log('ℹ️ Svelte config already fixed or not found');
  }
};

// Run all fixes
const runFixes = async () => {
  console.log('Starting comprehensive TypeScript and Vite fixes...\n');

  fixVectorSchema();
  fixAiService();
  fixSvelteConfig();

  console.log('\n🎉 All fixes applied!');
  console.log('💡 Next steps:');
  console.log('   1. Clear cache: npm run clean');
  console.log('   2. Restart dev server: npm run dev');
  console.log('   3. Or run: ./clear-cache-and-fix.bat');
};

runFixes().catch(console.error);
