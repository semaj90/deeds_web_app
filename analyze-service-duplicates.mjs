#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const servicesDir = 'sveltekit-frontend/src/lib/services';
const files = readdirSync(servicesDir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

const groups = {
  'caching': [],
  'ollama': [],
  'go-microservice': [],
  'gpu': [],
  'vector': [],
  'service-orchestrator': [],
  'rag': [],
  'ai': [],
  'minio': [],
  'embedding': []
};

console.log('🔍 Analyzing 519 service files for duplicates...\n');

for (const file of files) {
  const lower = file.toLowerCase();
  for (const [key, arr] of Object.entries(groups)) {
    if (lower.includes(key)) {
      const path = join(servicesDir, file);
      const size = statSync(path).size;
      arr.push({ file, size, path });
    }
  }
}

for (const [category, items] of Object.entries(groups)) {
  if (items.length > 1) {
    console.log(`\n📦 ${category.toUpperCase()} Services (${items.length} files):`);
    items.sort((a, b) => b.size - a.size);
    items.forEach(item => {
      console.log(`   ${item.file.padEnd(50)} ${(item.size/1024).toFixed(1)}KB`);
    });
  }
}

console.log('\n\n🎯 CONSOLIDATION CANDIDATES:\n');
console.log('Caching:', groups.caching.map(f => f.file).join(', '));
console.log('Ollama:', groups.ollama.map(f => f.file).join(', '));
console.log('Go Microservice:', groups['go-microservice'].map(f => f.file).join(', '));
console.log('GPU:', groups.gpu.map(f => f.file).join(', '));
console.log('Vector:', groups.vector.slice(0, 5).map(f => f.file).join(', '));
