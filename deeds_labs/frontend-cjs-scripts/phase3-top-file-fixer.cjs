#!/usr/bin/env node
/**
 * Phase 3: Targeted Fix for Top 20 Error Files
 * Focuses on TS1005 errors (missing punctuation)
 */

const fs = require('fs');

console.log('🎯 Phase 3: Targeted Top-File Fixer');
console.log('====================================\n');

const topFiles = [
  'src/lib/ai/multi-core-mcp-vector-server.ts',
  'src/lib/services/production-monitoring-dashboard.ts',
  'src/lib/demo/sampleData.ts',
  'src/lib/orchestration/master-cognitive-hub.ts',
  'src/lib/services/case-management-service.ts',
  'src/lib/webgpu/som-webgpu-cache.ts',
  'src/lib/adapters/webasm-ai-adapter.ts',
  'src/lib/stores/_archive/old-stores/legal-poi.ts',
  'src/lib/cache/loki-redis-integration-fixed.ts',
  'src/lib/services/user-chat-recommendation-engine.ts',
  'src/lib/services/sveltekit-gpu-cache-integration.ts',
  'src/lib/integrations/redis-webgpu-simd-integration.ts',
  'src/lib/cache/loki-redis-integration.ts',
  'src/lib/services/unified-legal-simd-pgvector.ts',
  'src/lib/services/production-service-registry.ts',
  'src/lib/services/production-integration-validator.ts',
  'src/lib/state/evidenceCustodyMachine.ts',
  'src/lib/ai/hybrid-gemma-bitmap-engine.ts',
  'src/lib/services/optimized-redis-pipeline.ts',
  'src/lib/evidence/detective-analysis-engine.ts'
];

let totalFixes = 0;

function aggressiveTS1005Fix(content) {
  let fixed = content;
  let fixes = 0;
  
  // Fix 1: Object properties missing commas/semicolons
  // { foo: 'bar' baz: 'qux' } => { foo: 'bar', baz: 'qux' }
  const lines = content.split('\n');
  const fixedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const nextLine = lines[i + 1] || '';
    
    // Check if this is an object property without terminator
    const propertyMatch = line.match(/^\s+(\w+):\s*([^,;{}\n]+)$/);
    const nextPropertyMatch = nextLine.match(/^\s+(\w+):/);
    
    if (propertyMatch && nextPropertyMatch && !line.trim().endsWith(',') && !line.trim().endsWith(';')) {
      line = line + ',';
      fixes++;
    }
    
    // Fix interface/type properties missing semicolons
    const typePropertyMatch = line.match(/^\s+(\w+):\s*([^,;{}\n]+)$/);
    const isInType = content.substring(0, content.indexOf(line)).match(/\b(interface|type)\s+\w+\s*=?\s*{[^}]*$/);
    
    if (typePropertyMatch && isInType && !line.trim().endsWith(';') && !line.trim().endsWith(',')) {
      line = line + ';';
      fixes++;
    }
    
    fixedLines.push(line);
  }
  
  if (fixes > 0) {
    fixed = fixedLines.join('\n');
  }
  
  // Fix 2: Function parameters missing commas
  // function foo(a: string b: number) => function foo(a: string, b: number)
  const paramPattern = /\(([^)]*?)(\w+:\s*[^,)]+)\s+(\w+:)/g;
  const paramMatches = content.match(paramPattern);
  if (paramMatches) {
    fixed = fixed.replace(paramPattern, (match, before, param1, param2) => {
      fixes++;
      return `(${before}${param1}, ${param2}`;
    });
  }
  
  // Fix 3: Array elements missing commas
  // [1 2 3] => [1, 2, 3]
  const arrayPattern = /\[([^\]]*?)(\S+)\s+(\S+)([^\]]*?)\]/g;
  if (arrayPattern.test(content)) {
    fixed = fixed.replace(arrayPattern, (match, before, elem1, elem2, after) => {
      if (!elem1.endsWith(',')) {
        fixes++;
        return `[${before}${elem1}, ${elem2}${after}]`;
      }
      return match;
    });
  }
  
  // Fix 4: Import statements missing commas
  // import { a b } => import { a, b }
  const importPattern = /import\s*{\s*([^}]*?)(\w+)\s+(\w+)([^}]*?)}/g;
  if (importPattern.test(content)) {
    fixed = fixed.replace(importPattern, (match, before, import1, import2, after) => {
      if (!import1.endsWith(',')) {
        fixes++;
        return `import { ${before}${import1}, ${import2}${after}}`;
      }
      return match;
    });
  }
  
  // Fix 5: Type unions/intersections missing operators
  // type Foo = A B => type Foo = A | B
  const typeUnionPattern = /type\s+\w+\s*=\s*([^=;]+?)(\w+)\s+(\w+)/g;
  if (typeUnionPattern.test(content)) {
    fixed = fixed.replace(typeUnionPattern, (match, before, type1, type2) => {
      if (!match.includes('|') && !match.includes('&') && !match.includes('<')) {
        fixes++;
        return match.replace(`${type1} ${type2}`, `${type1} | ${type2}`);
      }
      return match;
    });
  }
  
  return { fixed, fixes };
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Not found: ${filePath}`);
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, fixes } = aggressiveTS1005Fix(content);
    
    if (fixes > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} fixes`);
      totalFixes += fixes;
    } else {
      console.log(`ℹ️  ${filePath}: No fixes needed`);
    }
  } catch (error) {
    console.error(`❌ ${filePath}: ${error.message}`);
  }
}

console.log('Processing top 20 files with most errors...\n');

topFiles.forEach(processFile);

console.log('\n✅ Phase 3 Complete!');
console.log('====================');
console.log(`🔧 Total fixes applied: ${totalFixes}\n`);
