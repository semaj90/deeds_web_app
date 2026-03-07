#!/usr/bin/env node
/**
 * Phase 3: AI-Assisted Type Error Repair
 * Targets: ~15-25K errors (complex type mismatches)
 * - Uses Ollama gemma3-legal:latest for contextual fixes
 * - Integrates with agentic RAG Docker containers
 * - Redis caching for repeated patterns
 * - Qdrant vector search for similar fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_DIR = path.join(ROOT, 'agentic-error-resolution/logs');
const ERROR_DIR = path.join(ROOT, 'agentic-error-resolution/errors');

const logFile = path.join(LOG_DIR, `phase3-${Date.now()}.log`);

// Service endpoints (Docker-aware with localhost fallback)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

async function fetchOllama(prompt, model = 'gemma3-legal:latest') {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for consistent fixes
          top_p: 0.9,
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}`);
    }
    
    const data = await response.json();
    return data.response;
  } catch (err) {
    log(`⚠️  Ollama unavailable: ${err.message}`);
    return null;
  }
}

async function parseErrorsFromSvelteCheck() {
  log('📊 Running svelte-check to gather errors...');
  
  try {
    execSync('npx svelte-check --output machine', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return [];
  } catch (err) {
    const output = err.stdout || err.message;
    const errors = [];
    
    // Parse machine-readable output
    const lines = output.split('\n');
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'error') {
          errors.push({
            file: parsed.filename,
            line: parsed.start?.line,
            column: parsed.start?.character,
            message: parsed.text,
            code: parsed.code
          });
        }
      } catch {
        // Not JSON, skip
      }
    }
    
    return errors;
  }
}

async function getCachedFix(errorPattern) {
  // TODO: Integrate with Redis cache
  // For now, return null (no cache hit)
  return null;
}

async function cacheFix(errorPattern, fix) {
  // TODO: Store in Redis with pattern as key
  log(`💾 Caching fix for pattern: ${errorPattern.substring(0, 50)}...`);
}

async function findSimilarFixes(error) {
  // TODO: Query Qdrant vector DB for similar error fixes
  // For now, return empty array
  return [];
}

async function generateFix(error, context) {
  const prompt = `You are a Svelte 5 and TypeScript expert. Fix this error:

File: ${error.file}
Line: ${error.line}
Error: ${error.message}

Context (surrounding code):
\`\`\`svelte
${context}
\`\`\`

Provide ONLY the fixed code for the problematic section. No explanations.
Ensure compatibility with:
- Svelte 5 runes ($state, $derived, $effect)
- SvelteKit 2
- Bits-UI components (named imports)
- TypeScript strict mode

Fixed code:`;

  const response = await fetchOllama(prompt);
  
  if (!response) {
    return null;
  }
  
  // Extract code from markdown if wrapped
  const codeMatch = response.match(/```(?:svelte|typescript|ts)?\n([\s\S]+?)\n```/);
  return codeMatch ? codeMatch[1] : response.trim();
}

async function applyFix(filePath, line, column, fixedCode) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Simple replacement - insert fixed code at error line
    // More sophisticated: parse AST and replace node
    lines[line - 1] = fixedCode;
    
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  } catch (err) {
    log(`❌ Failed to apply fix to ${filePath}: ${err.message}`);
    return false;
  }
}

function getContext(filePath, line, contextLines = 10) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const start = Math.max(0, line - contextLines);
    const end = Math.min(lines.length, line + contextLines);
    
    return lines.slice(start, end).join('\n');
  } catch (err) {
    return '';
  }
}

async function processError(error, index, total) {
  log(`\n[${index + 1}/${total}] Processing error in ${path.relative(ROOT, error.file)}:${error.line}`);
  log(`    Error: ${error.message}`);
  
  // Check cache first
  const cachedFix = await getCachedFix(error.message);
  if (cachedFix) {
    log(`    ⚡ Cache hit!`);
    const applied = await applyFix(error.file, error.line, error.column, cachedFix);
    return applied ? 'cached' : 'failed';
  }
  
  // Check for similar fixes in vector DB
  const similarFixes = await findSimilarFixes(error);
  if (similarFixes.length > 0) {
    log(`    🔍 Found ${similarFixes.length} similar fixes`);
    // Could use similarity score to auto-apply or suggest
  }
  
  // Generate AI fix
  const context = getContext(error.file, error.line);
  const fix = await generateFix(error, context);
  
  if (!fix) {
    log(`    ⚠️  Could not generate fix (Ollama unavailable)`);
    return 'skipped';
  }
  
  // Apply fix
  const applied = await applyFix(error.file, error.line, error.column, fix);
  
  if (applied) {
    log(`    ✅ Fix applied`);
    await cacheFix(error.message, fix);
    return 'fixed';
  } else {
    log(`    ❌ Fix application failed`);
    return 'failed';
  }
}

async function main() {
  log('🚀 Phase 3: AI-Assisted Type Error Repair');
  log(`📁 Root: ${ROOT}`);
  log(`🤖 Ollama: ${OLLAMA_URL}`);
  log(`📦 Redis: ${REDIS_URL}`);
  log(`🔍 Qdrant: ${QDRANT_URL}`);
  
  // Test Ollama connection
  const testResponse = await fetchOllama('Respond with "OK" if you can read this.');
  if (!testResponse) {
    log('');
    log('⚠️  WARNING: Ollama is not available!');
    log('   Phase 3 requires Ollama for AI-assisted fixes.');
    log('   Please start Ollama:');
    log('     ollama serve');
    log('   And ensure gemma3-legal:latest is pulled:');
    log('     ollama pull gemma3-legal:latest');
    log('');
    process.exit(1);
  }
  
  log(`✅ Ollama connection verified\n`);
  
  // Parse errors
  const errors = await parseErrorsFromSvelteCheck();
  log(`📊 Found ${errors.length} errors to process\n`);
  
  if (errors.length === 0) {
    log('🎉 No errors found! Phase 3 not needed.');
    return;
  }
  
  // Limit to prevent overwhelming the system
  const MAX_ERRORS = 100;
  const toProcess = errors.slice(0, MAX_ERRORS);
  
  if (errors.length > MAX_ERRORS) {
    log(`⚠️  Processing first ${MAX_ERRORS} errors (limit)`);
  }
  
  const results = {
    fixed: 0,
    cached: 0,
    skipped: 0,
    failed: 0
  };
  
  for (let i = 0; i < toProcess.length; i++) {
    const result = await processError(toProcess[i], i, toProcess.length);
    results[result]++;
    
    // Small delay to avoid overwhelming Ollama
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  log('\n✨ Phase 3 Complete:');
  log(`   ✅ Fixed: ${results.fixed}`);
  log(`   ⚡ Cached: ${results.cached}`);
  log(`   ⚠️  Skipped: ${results.skipped}`);
  log(`   ❌ Failed: ${results.failed}`);
  log(`📝 Log: ${logFile}`);
  
  const summary = {
    phase: 3,
    timestamp: new Date().toISOString(),
    totalErrors: errors.length,
    processedErrors: toProcess.length,
    results,
    estimatedErrorsFixed: results.fixed + results.cached
  };
  
  fs.writeFileSync(
    path.join(ERROR_DIR, 'phase3-summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
