#!/usr/bin/env node
/**
 * Phase 79: Cognitive Engine DEMO
 * This version works without a database - demonstrates the full pipeline
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m'
};

const log = {
  header: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  step: (num, msg) => console.log(`${colors.magenta}[${num}]${colors.reset} ${msg}`)
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: FILE SUMMARIZATION & CONTENT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

async function summarizeFileContent(filePath) {
  log.step(1, 'Reading and analyzing file content');

  try {
    const fullPath = path.join(projectRoot, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    // Extract key information from file
    const lines = content.split('\n');
    const fileSize = Buffer.byteLength(content);
    const importStatements = lines.filter(l => l.match(/^import|^require|^export/));
    const typeDefinitions = lines.filter(l => l.match(/interface|type|class|enum/));
    const functionCount = (content.match(/function|const.*=.*\(|async/g) || []).length;

    // Build summary
    const summary = {
      filePath,
      fileName: path.basename(filePath),
      fileExtension: path.extname(filePath),
      fileSize,
      lineCount: lines.length,
      importCount: importStatements.length,
      typeCount: typeDefinitions.length,
      functionCount,
      contentPreview: lines.slice(0, 20).join('\n'),
      contentLength: content.length,
      hasErrors: content.includes('error') || content.includes('Error'),
      keywords: extractKeywords(content),
      errorPatterns: extractErrorPatterns(content)
    };

    log.success(`File analyzed: ${fileSize} bytes, ${lines.length} lines`);
    log.info(`  • Imports: ${importStatements.length}`);
    log.info(`  • Types: ${typeDefinitions.length}`);
    log.info(`  • Functions: ${functionCount}`);
    log.info(`  • Keywords: ${summary.keywords.slice(0, 5).join(', ')}`);

    return { summary, content };
  } catch (error) {
    log.error(`Failed to read file: ${error.message}`);
    return null;
  }
}

function extractKeywords(content) {
  const keywords = new Set();
  const matches = content.match(/\b(async|await|try|catch|throw|Promise|Observable|Subject|RxJS|Svelte|TypeScript|import|export|class|interface|enum|type|JSON|SIMD|parse|serialize|ArrayBuffer|WebAssembly|WASM)\b/gi);
  if (matches) {
    matches.slice(0, 15).forEach(m => keywords.add(m.toLowerCase()));
  }
  return Array.from(keywords);
}

function extractErrorPatterns(content) {
  const patterns = [];
  if (content.match(/error|Error|ERROR/g)) patterns.push('error_handling');
  if (content.match(/async|await|Promise/g)) patterns.push('async_operations');
  if (content.match(/type|interface|: \w+/g)) patterns.push('type_annotations');
  if (content.match(/try|catch|throw/g)) patterns.push('exception_handling');
  if (content.match(/JSON\.parse|JSON\.stringify/g)) patterns.push('json_parsing');
  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: EXTRACT ERROR CONTEXT (MOCK)
// ═══════════════════════════════════════════════════════════════════════════

function extractErrorContext(summary, content) {
  log.step(2, 'Extracting error context from file');

  // Simulate finding errors based on content analysis
  const errorContext = {
    totalErrors: Math.random() > 0.5 ? 3 : 8,
    criticalErrors: Math.random() > 0.5 ? 1 : 2,
    errorCodes: ['TS1005', 'TS2304', 'TS2688'],
    errorMessages: [
      'Unexpected keyword or identifier',
      'Cannot find name "parseJSONSIMD"',
      'Import assignment cannot be used when targeting ES modules'
    ]
  };

  log.success(`Found ${errorContext.totalErrors} errors`);
  errorContext.errorMessages.slice(0, 2).forEach(msg => {
    log.info(`  • ${msg}`);
  });

  return errorContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: BUILD RAG/KAG QUERY WITH FILE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

function buildRAGQuery(summary, errorContext) {
  log.step(3, 'Building RAG/KAG query with file context');

  const richQuery = `
File: ${summary.fileName}
Errors: ${errorContext.errorCodes.join(', ')}
Keywords: ${summary.keywords.join(', ')}
Patterns: ${summary.errorPatterns.join(', ')}
Context: ${errorContext.errorMessages.slice(0, 2).join('. ')}
  `.trim();

  log.info(`Rich Query:\n${richQuery.split('\n').map(l => '  ' + l).join('\n')}`);

  // Mock similar patches
  const similarPatches = [
    { chunk_type: 'successful_patch', similarity_score: 0.92, content: 'const parseJSONSIMD = require("simdjson").parse;' },
    { chunk_type: 'solution', similarity_score: 0.87, content: 'try { parseJSONSIMD = require("simdjson").parse; } catch (err) { ... }' },
    { chunk_type: 'fix', similarity_score: 0.81, content: 'async function readBodyFast(request: Request): Promise<any> { ... }' }
  ];

  log.success(`Found ${similarPatches.length} similar solutions (mock)`);
  similarPatches.forEach((p, i) => {
    log.info(`  [${i+1}] ${p.chunk_type}: ${(p.similarity_score * 100).toFixed(0)}% match`);
  });

  return similarPatches;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: BUILD LLM PROMPT WITH FULL CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

function buildContextualPrompt(summary, errorContext, similarPatches) {
  const kbContext = similarPatches.length > 0
    ? similarPatches.map((p, i) => `${i + 1}. Type: ${p.chunk_type} (${(p.similarity_score * 100).toFixed(0)}% match)\n   Content: ${p.content.substring(0, 150)}...`).join('\n')
    : 'No similar solutions found';

  const prompt = `YOU ARE A CODE FIX GENERATOR
================================
Your ONLY job is to output valid code. DO NOT EXPLAIN, SUMMARIZE, OR DESCRIBE.

FILE CONTEXT:
=============
Path: ${summary.filePath}
Type: ${summary.fileExtension}
Size: ${summary.fileSize} bytes, ${summary.lineCount} lines
Structure: ${summary.functionCount} functions, ${summary.typeCount} types, ${summary.importCount} imports
Keywords: ${summary.keywords.join(', ')}

ERROR INFORMATION:
=================
Total Errors: ${errorContext.totalErrors}
Critical: ${errorContext.criticalErrors}
Codes: ${errorContext.errorCodes.join(', ')}

Top Error Messages:
${errorContext.errorMessages.slice(0, 3).map((msg, i) => `${i + 1}. ${msg}`).join('\n')}

WORKING SOLUTIONS FROM KNOWLEDGE BASE:
======================================
${kbContext}

CURRENT FILE CODE (First 30 lines):
===================================
${summary.contentPreview}

YOUR TASK:
==========
Fix the most critical error in this file.

CRITICAL RULES:
- Output ONLY valid, executable code
- NO explanations, NO "The error", NO documentation
- Start with: import, export, function, const, async, class, interface, type
- Must be properly indented TypeScript or JavaScript
- Include all necessary imports and dependencies
- No placeholder comments like "// Fix here"
- Implement the actual solution, not a skeleton

Generate code only - no text:`;

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: VALIDATE PATCH
// ═══════════════════════════════════════════════════════════════════════════

function validatePatch(patch, summary) {
  log.step(5, 'Validating patch');

  if (!patch) {
    log.error('No patch to validate');
    return { isValid: false, score: 0, issues: ['No patch generated'] };
  }

  const validation = {
    isValid: true,
    score: 100,
    issues: [],
    checks: {}
  };

  // Check 1: Is it code or documentation? (40% weight)
  const codeKeywords = ['const', 'function', 'async', 'await', 'import', 'export', 'class', 'interface', 'type'];
  const docKeywords = [
    'The error', 'This file', 'indicates', 'problem', 'suggests', 'should', 'need to',
    'The most likely', 'without more context', 'impossible to definitively',
    'most likely fix', 'triggering a full rebuild', 'will regenerate',
    'error summary', 'According to'
  ];

  const hasCodeKeyword = codeKeywords.some(k => patch.toLowerCase().includes(k.toLowerCase()));
  const hasDocKeyword = docKeywords.some(k => patch.toLowerCase().includes(k.toLowerCase()));

  validation.checks.isCode = hasCodeKeyword && !hasDocKeyword;

  if (!validation.checks.isCode) {
    validation.issues.push('Looks like documentation, not code');
    validation.score -= 40;
    validation.isValid = false;
  }

  // Check 2: Balanced syntax (20% weight)
  const braces = (patch.match(/{/g) || []).length === (patch.match(/}/g) || []).length;
  const brackets = (patch.match(/\[/g) || []).length === (patch.match(/\]/g) || []).length;
  const parens = (patch.match(/\(/g) || []).length === (patch.match(/\)/g) || []).length;

  validation.checks.balancedSyntax = braces && brackets && parens;

  if (!validation.checks.balancedSyntax) {
    validation.issues.push('Unbalanced braces/brackets/parentheses');
    validation.score -= 20;
  }

  // Check 3: Valid quotes (15% weight)
  const singleQuotes = (patch.match(/'/g) || []).length;
  const doubleQuotes = (patch.match(/"/g) || []).length;
  const backticks = (patch.match(/`/g) || []).length;

  validation.checks.validQuotes = singleQuotes % 2 === 0 && doubleQuotes % 2 === 0 && backticks % 2 === 0;

  if (!validation.checks.validQuotes) {
    validation.issues.push('Unmatched quotes');
    validation.score -= 15;
  }

  // Check 4: No duplicate patterns (10% weight)
  const hasDuplicates = /(\b\w+\b)\s+\1\b/.test(patch);
  validation.checks.noDuplicates = !hasDuplicates;

  if (hasDuplicates) {
    validation.issues.push('Found duplicate word patterns');
    validation.score -= 10;
  }

  validation.score = Math.max(0, validation.score);
  validation.isValid = validation.isValid && validation.score >= 50;

  log.success(`Validation score: ${validation.score}%`);
  if (validation.issues.length > 0) {
    validation.issues.forEach(issue => log.warn(`  • ${issue}`));
  }

  return validation;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO: Show the full pipeline
// ═══════════════════════════════════════════════════════════════════════════

async function demo() {
  log.header('PHASE 79: COGNITIVE ENGINE DEMO');

  const filePath = 'src/lib/simd/simd-json-integration.ts';

  // STEP 1: Summarize file
  const fileData = await summarizeFileContent(filePath);
  if (!fileData) return;

  // STEP 2: Extract errors
  const errorContext = extractErrorContext(fileData.summary, fileData.content);

  // STEP 3: Build RAG query
  const similarPatches = buildRAGQuery(fileData.summary, errorContext);

  // STEP 4: Show LLM prompt
  log.step(4, 'Building LLM prompt with full context');
  const prompt = buildContextualPrompt(fileData.summary, errorContext, similarPatches);
  console.log(`\n${colors.blue}LLM Prompt (first 500 chars):${colors.reset}`);
  console.log(prompt.substring(0, 500) + '\n...\n');

  // STEP 5: Validate example patches
  log.step(5, 'Testing validation on different patch types');

  const testPatches = [
    {
      name: 'GOOD PATCH (Code)',
      content: `const parseJSONSIMD = require('simdjson').parse;
export async function readBodyFast(request: Request): Promise<any> {
  try {
    const text = await request.text();
    return parseJSONSIMD(text);
  } catch (error) {
    throw new Error('Invalid JSON');
  }
}`
    },
    {
      name: 'BAD PATCH (Documentation)',
      content: `The error summary indicates a problem within the \`__non_route__#internal\` file in a SvelteKit project.
This file is typically generated by SvelteKit and handles internal logic. The provided file content is empty,
which is highly unusual and suggests a corruption or incomplete build. Without more context (like the full error message,
the surrounding project structure, and what actions led to the error), it's impossible to definitively determine the root cause.`
    },
    {
      name: 'PARTIAL PATCH (Unbalanced)',
      content: `const parseJSONSIMD = require('simdjson').parse;
export async function readBodyFast(request: Request): Promise<any> {
  try {
    const text = await request.text();
    return parseJSONSIMD(text);`
    }
  ];

  console.log('\n');
  testPatches.forEach(test => {
    console.log(`\n${colors.yellow}Testing: ${test.name}${colors.reset}`);
    const validation = validatePatch(test.content, fileData.summary);
    console.log(`  Final Score: ${validation.score}% | Valid: ${validation.isValid ? colors.green + 'YES' : colors.red + 'NO'}${colors.reset}`);
  });

  // STEP 6: Show ranking system
  log.step(6, 'Showing ranking system');
  const scores = [95, 75, 55, 35];
  scores.forEach(score => {
    const similarity = 0.87;
    const composite = (score * 0.6) + (similarity * 100 * 0.4);
    const confidence = composite > 80 ? 'HIGH' : composite > 50 ? 'MEDIUM' : 'LOW';
    log.info(`Validation ${score}% + Similarity 87% = Composite ${composite.toFixed(1)}% (${confidence})`);
  });

  // STEP 7: Show JSONL output format
  log.step(7, 'JSONL Output Format');
  const sampleOutput = {
    file_path: 'src/lib/simd/simd-json-integration.ts',
    file_name: 'simd-json-integration.ts',
    error_count: 8,
    primary_error_code: 'TS1005',
    validation_score: 95,
    cosine_similarity: 0.87,
    similarity_rank_1_to_10: 9,
    inverse_rank_1_to_10: 2,
    composite_score: 86.8,
    confidence_level: 'HIGH',
    kb_references: 5,
    generated_at: new Date().toISOString()
  };

  console.log(`\n${colors.blue}Sample JSONL Output:${colors.reset}`);
  console.log(JSON.stringify(sampleOutput, null, 2));

  // Summary
  log.header('DEMO COMPLETE');
  log.success('✓ File reading and summarization working');
  log.success('✓ RAG/KAG query building with file context working');
  log.success('✓ LLM prompt generation with full context working');
  log.success('✓ Validation correctly blocks documentation');
  log.success('✓ Composite ranking system working');
  log.success('✓ JSONL output format correct');
}

demo().catch(err => {
  log.error(`Demo failed: ${err.message}`);
  process.exit(1);
});
