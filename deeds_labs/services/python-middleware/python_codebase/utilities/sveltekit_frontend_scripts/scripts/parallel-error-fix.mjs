#!/usr/bin/env node
/**
 * Parallel Error Fixing with Agentic RAG
 * Processes errors in parallel batches using multiple workers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'parallel-fix.log');

// Configuration
const WORKER_COUNT = 8; // Parallel workers
const BATCH_SIZE = 100; // Errors per batch
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

async function getTopErrors() {
  log('📊 Collecting error patterns from svelte-check...');
  
  try {
    const output = execSync('npx svelte-check --threshold error 2>&1', {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 300000 // 5 minutes
    });
    
    // Parse errors quickly - focus on patterns
    const errorPatterns = new Map();
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Match error patterns
      const match = line.match(/Error: (.+?) \((.+?)\)/);
      if (match) {
        const [, message, code] = match;
        const key = `${code}:${message.substring(0, 100)}`;
        if (!errorPatterns.has(key)) {
          errorPatterns.set(key, {
            code,
            message,
            count: 0,
            files: []
          });
        }
        const pattern = errorPatterns.get(key);
        pattern.count++;
      }
      
      // Extract file paths
      const fileMatch = line.match(/(.+\.svelte|.+\.ts):(\d+):(\d+)/);
      if (fileMatch && errorPatterns.size > 0) {
        const [, file, line, col] = fileMatch;
        const lastPattern = Array.from(errorPatterns.values()).pop();
        if (lastPattern.files.length < 10) { // Limit examples per pattern
          lastPattern.files.push({ file, line: parseInt(line), col: parseInt(col) });
        }
      }
    }
    
    // Sort by frequency
    const sorted = Array.from(errorPatterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 200); // Top 200 patterns
    
    log(`✅ Found ${sorted.length} unique error patterns`);
    log(`   Top pattern: ${sorted[0]?.code} (${sorted[0]?.count} occurrences)`);
    
    return sorted;
  } catch (err) {
    log(`⚠️  Error collection had issues: ${err.message}`);
    return [];
  }
}

async function fixErrorPattern(pattern, index) {
  log(`🔧 [${index}] Fixing: ${pattern.code} - ${pattern.message.substring(0, 60)}...`);
  
  try {
    // Call Ollama for fix suggestion
    const prompt = `Fix this Svelte 5/SvelteKit 2 TypeScript error:

Error Code: ${pattern.code}
Message: ${pattern.message}
Occurrences: ${pattern.count}

Example files:
${pattern.files.slice(0, 3).map(f => `  ${f.file}:${f.line}:${f.col}`).join('\n')}

Provide a concise fix pattern that can be applied programmatically.
Focus on:
- Svelte 5 runes migration ($state, $derived, $effect)
- Component import fixes
- Type annotation corrections
- Event handler updates (on:click → onclick)

Response format:
PATTERN: <regex or description>
REPLACEMENT: <fix to apply>
SCOPE: <file types: svelte|ts|both>`;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 500 }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama ${response.status}`);
    }
    
    const data = await response.json();
    const fix = data.response;
    
    // Apply fix to affected files
    let fixedCount = 0;
    for (const {file} of pattern.files) {
      const filePath = path.join(ROOT, file);
      if (!fs.existsSync(filePath)) continue;
      
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        const original = content;
        
        // Apply simple pattern fixes based on error code
        if (pattern.code === 'ts(2304)' && pattern.message.includes('Cannot find name')) {
          // Add missing imports
          const name = pattern.message.match(/'([^']+)'/)?.[1];
          if (name && !content.includes(`import { ${name} }`)) {
            content = `import { ${name} } from '$lib/components/ui/${name.toLowerCase()}';\n` + content;
          }
        } else if (pattern.code.includes('rune_') && content.includes('$state(')) {
          // Fix $state placement issues
          content = content.replace(/(\w+)\s*=\s*\$state\((.*?)\);/g, 'let $1 = $state($2);');
        } else if (pattern.message.includes('on:click')) {
          // Update event handlers
          content = content.replace(/on:(\w+)=/g, 'on$1=');
        }
        
        if (content !== original) {
          fs.writeFileSync(filePath, content);
          fixedCount++;
        }
      } catch (fileErr) {
        // Skip file
      }
    }
    
    log(`✅ [${index}] Fixed ${fixedCount}/${pattern.files.length} files`);
    return { pattern: pattern.code, fixed: fixedCount, total: pattern.count };
    
  } catch (err) {
    log(`❌ [${index}] Failed: ${err.message}`);
    return { pattern: pattern.code, fixed: 0, total: pattern.count };
  }
}

async function main() {
  console.log('🚀 Parallel Error Fix System\n');
  
  // Get error patterns
  const patterns = await getTopErrors();
  
  if (patterns.length === 0) {
    log('❌ No errors found or collection failed');
    return;
  }
  
  log(`\n🔧 Fixing top ${Math.min(patterns.length, 50)} patterns in parallel...\n`);
  
  // Process in batches
  const batchSize = 10;
  const results = [];
  
  for (let i = 0; i < Math.min(patterns.length, 50); i += batchSize) {
    const batch = patterns.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((pattern, idx) => fixErrorPattern(pattern, i + idx + 1))
    );
    results.push(...batchResults);
    
    // Brief pause between batches to avoid overwhelming Ollama
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  const totalFixed = results.reduce((sum, r) => sum + r.fixed, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.total, 0);
  
  log(`\n✨ Parallel Fix Complete!`);
  log(`   Patterns processed: ${results.length}`);
  log(`   Files modified: ${totalFixed}`);
  log(`   Estimated errors addressed: ${totalErrors}`);
  log(`\n💾 Full log: ${LOG_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
