#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

const STAGE1_DIR = 'scripts/atlas/.stage1-outputs';
const STAGE2_DIR = 'scripts/atlas/.stage2-outputs';
const OUTPUT_FILE = path.join(STAGE2_DIR, 'stage2-structural-facts.ndjson');

if (!fs.existsSync(STAGE2_DIR)) {
  fs.mkdirSync(STAGE2_DIR, { recursive: true });
}

console.log('🏗️  Stage 2: Structural Extraction');
console.log('=====================================\n');

// Extract structural facts from code files
const extractStructure = (filePath, content) => {
  const facts = [];
  const ext = path.extname(filePath);
  
  // TypeScript/JavaScript: functions, classes, imports, exports
  if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
    // Imports
    const importRegex = /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      facts.push({ type: 'import', source: match[1], line: content.substring(0, match.index).split('\n').length });
    }
    
    // Function declarations
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    while ((match = funcRegex.exec(content)) !== null) {
      facts.push({ type: 'function', name: match[1], line: content.substring(0, match.index).split('\n').length });
    }
    
    // Class declarations
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      facts.push({ type: 'class', name: match[1], extends: match[2], line: content.substring(0, match.index).split('\n').length });
    }
    
    // Exports
    const exportRegex = /export\s+(?:default\s+)?(?:(?:const|let|var|function|class|interface|type|enum)\s+)?(\w+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      facts.push({ type: 'export', name: match[1], line: content.substring(0, match.index).split('\n').length });
    }
  }
  
  // Svelte: components, props, events
  if (['.svelte'].includes(ext)) {
    // Script imports
    const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/;
    const scriptContent = scriptMatch ? scriptMatch[1] : '';
    
    const importRegex = /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(scriptContent)) !== null) {
      facts.push({ type: 'import', source: match[1] });
    }
    
    // Props (let export patterns)
    const propsRegex = /let\s+(\w+)\s*=\s*(\w+)/g;
    while ((match = propsRegex.exec(scriptContent)) !== null) {
      facts.push({ type: 'prop', name: match[1], value_type: match[2] });
    }
    
    // Snippet definitions
    const snippetRegex = /snippet\s+(\w+)\(/g;
    while ((match = snippetRegex.exec(content)) !== null) {
      facts.push({ type: 'snippet', name: match[1] });
    }
  }
  
  // JSON: top-level keys
  if (['.json'].includes(ext)) {
    try {
      const json = JSON.parse(content);
      Object.keys(json).forEach(key => {
        facts.push({ type: 'json_key', key });
      });
    } catch {
      // Invalid JSON, skip
    }
  }
  
  return facts;
};

// Read all files from Stage 1
const allFilesPath = path.join(STAGE1_DIR, 'stage1-all-files.ndjson');
const stream = fs.createReadStream(allFilesPath);
const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

let processedCount = 0;
let factsCount = 0;
const output = fs.createWriteStream(OUTPUT_FILE);

(async () => {
  for await (const line of rl) {
    const entry = JSON.parse(line);
    const { file } = entry;
    
    if ((processedCount + 1) % 2000 === 0) {
      console.log(`   ${processedCount + 1} files processed, ${factsCount} facts extracted...`);
    }
    
    // Skip large binary files and node_modules
    if (file.includes('node_modules') || file.includes('dist') || file.includes('.git')) {
      processedCount++;
      continue;
    }
    
    // Extract structure from code files
    const ext = path.extname(file);
    if (['.ts', '.js', '.tsx', '.jsx', '.svelte', '.json'].includes(ext)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const facts = extractStructure(file, content);
        
        for (const fact of facts) {
          const record = { file, ...fact, timestamp: entry.timestamp };
          output.write(JSON.stringify(record) + '\n');
          factsCount++;
        }
      } catch (e) {
        // Skip read errors
      }
    }
    
    processedCount++;
  }
  
  output.end();
  
  console.log(`\n✅ Stage 2 Complete`);
  console.log('=====================================');
  console.log(`Files processed:   ${processedCount}`);
  console.log(`Structural facts:  ${factsCount}`);
  console.log(`Output:            ${OUTPUT_FILE}\n`);
  console.log('Next: Run Stage 3 (Semantic Extraction)');
  console.log('  npm run atlas:stage3:semantic');
})();
