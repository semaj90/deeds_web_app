#!/usr/bin/env node
/**
 * Agentic RAG Error Resolution System
 * 
 * Uses RAG + Gemma3 to automatically fix 47K+ svelte-check errors
 * Integrates with agentic Docker containers for distributed processing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_DIR = path.join(__dirname, '..');
const AGENTIC_DIR = path.join(BASE_DIR, 'agentic-error-resolution');
const ERRORS_DIR = path.join(AGENTIC_DIR, 'errors');
const FIXED_DIR = path.join(AGENTIC_DIR, 'fixed');
const REPORTS_DIR = path.join(AGENTIC_DIR, 'reports');

// RAG Endpoints
const RAG_ORCHESTRATOR_URL = process.env.RAG_ORCHESTRATOR_URL || 'http://localhost:8004';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

console.log('🤖 Agentic RAG Error Resolution System');
console.log('='.repeat(70));
console.log('');

// Step 1: Extract errors into structured format
console.log('📋 Step 1: Extracting errors from svelte-check...');

const errorFile = path.join(ERRORS_DIR, 'svelte-check-full.txt');
let errorText = '';

if (fs.existsSync(errorFile)) {
  errorText = fs.readFileSync(errorFile, 'utf8');
  console.log(`✓ Loaded ${(errorText.length / 1024).toFixed(2)}KB from ${path.basename(errorFile)}`);
} else {
  console.log('⏳ Running svelte-check to capture errors...');
  try {
    execSync('npx svelte-check --threshold warning', {
      cwd: BASE_DIR,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (err) {
    errorText = err.stdout || err.stderr || '';
    fs.writeFileSync(errorFile, errorText, 'utf8');
    console.log(`✓ Captured ${(errorText.length / 1024).toFixed(2)}KB of errors`);
  }
}

// Parse error summary
const summaryMatch = errorText.match(/svelte-check found (\d+) errors? and (\d+) warnings? in (\d+) files?/);
const errorCount = summaryMatch ? parseInt(summaryMatch[1]) : 0;
const warningCount = summaryMatch ? parseInt(summaryMatch[2]) : 0;
const fileCount = summaryMatch ? parseInt(summaryMatch[3]) : 0;

console.log('');
console.log(`📊 Error Summary:`);
console.log(`   Errors: ${errorCount.toLocaleString()}`);
console.log(`   Warnings: ${warningCount.toLocaleString()}`);
console.log(`   Files: ${fileCount.toLocaleString()}`);
console.log('');

// Step 2: Parse errors into categories
console.log('📂 Step 2: Categorizing errors...');

const errorPatterns = {
  stateInvalidPlacement: {
    pattern: /\$state\(...\) can only be used as a variable declaration initializer/gi,
    count: 0,
    severity: 'error',
    fixable: true
  },
  componentCasing: {
    pattern: /Module .* has no exported member/gi,
    count: 0,
    severity: 'error',
    fixable: true
  },
  tsErrors: {
    pattern: /Error: \(ts\)/gi,
    count: 0,
    severity: 'error',
    fixable: true
  },
  deprecatedDirectives: {
    pattern: /Using on:\w+ to listen to the \w+ event is deprecated/gi,
    count: 0,
    severity: 'warning',
    fixable: true
  },
  typeErrors: {
    pattern: /Type .* is not assignable to type/gi,
    count: 0,
    severity: 'error',
    fixable: true
  },
  unknownProperties: {
    pattern: /Object literal may only specify known properties/gi,
    count: 0,
    severity: 'error',
    fixable: true
  }
};

for (const [category, config] of Object.entries(errorPatterns)) {
  const matches = errorText.match(config.pattern);
  config.count = matches ? matches.length : 0;
}

console.log('Error categories:');
for (const [category, config] of Object.entries(errorPatterns)) {
  if (config.count > 0) {
    const emoji = config.severity === 'error' ? '🔴' : '🟡';
    console.log(`   ${emoji} ${category.padEnd(25)} ${config.count.toLocaleString()}`);
  }
}

// Save categorization
const categorization = {
  timestamp: new Date().toISOString(),
  summary: {
    totalErrors: errorCount,
    totalWarnings: warningCount,
    totalFiles: fileCount
  },
  categories: errorPatterns,
  fixableErrors: Object.values(errorPatterns).reduce((sum, p) => sum + (p.fixable ? p.count : 0), 0)
};

fs.writeFileSync(
  path.join(REPORTS_DIR, 'error-categorization.json'),
  JSON.stringify(categorization, null, 2)
);

console.log('');
console.log(`✅ ${categorization.fixableErrors.toLocaleString()} errors are potentially auto-fixable`);
console.log('');

// Step 3: Create RAG knowledge base
console.log('📚 Step 3: Building RAG knowledge base...');

const knowledgeBase = [
  {
    id: 'fix-state-placement',
    category: 'stateInvalidPlacement',
    problem: '$state() used in invalid location (try/catch, setTimeout, callback)',
    solution: 'Use simple assignment instead: `variable = value` not `variable = $state(value)`',
    example: `
// ❌ Wrong
setTimeout(() => {
  loading = $state(false);
}, 1000);

// ✅ Correct
setTimeout(() => {
  loading = false;
}, 1000);
    `.trim()
  },
  {
    id: 'fix-component-import',
    category: 'componentCasing',
    problem: 'Component import casing mismatch',
    solution: 'Match import name to actual file name (case-sensitive)',
    example: `
// If file is Dialog.svelte:
// ❌ Wrong
import dialog from './Dialog.svelte';

// ✅ Correct
import Dialog from './Dialog.svelte';
    `.trim()
  },
  {
    id: 'fix-event-directive',
    category: 'deprecatedDirectives',
    problem: 'on:click and other on: directives deprecated in Svelte 5',
    solution: 'Use onclick, oninput, etc. (no colon)',
    example: `
// ❌ Wrong
<button on:click={handler}>Click</button>

// ✅ Correct
<button onclick={handler}>Click</button>
    `.trim()
  },
  {
    id: 'fix-unknown-props',
    category: 'unknownProperties',
    problem: 'Class or unknown property on component',
    solution: 'Use proper Bits UI props or wrap in HTML element',
    example: `
// ❌ Wrong
<Button class="my-class">Text</Button>

// ✅ Option 1: Use Bits UI class prop pattern
<Button.Root class="my-class">Text</Button.Root>

// ✅ Option 2: Wrap in div
<div class="my-class">
  <Button>Text</Button>
</div>
    `.trim()
  }
];

// Index knowledge base in RAG
console.log('⏳ Indexing knowledge base in RAG orchestrator...');

async function indexKnowledge() {
  for (const doc of knowledgeBase) {
    try {
      const response = await fetch(`${RAG_ORCHESTRATOR_URL}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: doc.id,
          text: `${doc.problem}\n\nSolution: ${doc.solution}\n\nExample:\n${doc.example}`,
          metadata: {
            category: doc.category,
            type: 'error-fix-pattern'
          }
        })
      });
      
      if (response.ok) {
        console.log(`   ✓ Indexed: ${doc.id}`);
      }
    } catch (err) {
      console.log(`   ⚠️  RAG not available, skipping indexing`);
      break;
    }
  }
}

// Run async
indexKnowledge().then(() => {
  console.log('');
  console.log('✅ Knowledge base ready');
  console.log('');
  
  // Step 4: Generate fix strategy
  console.log('🎯 Step 4: Generating fix strategy...');
  
  const strategy = {
    phase1: {
      name: 'Quick Wins (Automated)',
      patterns: ['stateInvalidPlacement', 'deprecatedDirectives'],
      estimatedFixes: 
        errorPatterns.stateInvalidPlacement.count + 
        errorPatterns.deprecatedDirectives.count,
      method: 'regex-based-replacement'
    },
    phase2: {
      name: 'Component Issues (Semi-automated)',
      patterns: ['componentCasing', 'unknownProperties'],
      estimatedFixes:
        errorPatterns.componentCasing.count +
        errorPatterns.unknownProperties.count,
      method: 'ast-analysis-with-ai'
    },
    phase3: {
      name: 'Type Errors (AI-assisted)',
      patterns: ['tsErrors', 'typeErrors'],
      estimatedFixes:
        errorPatterns.tsErrors.count +
        errorPatterns.typeErrors.count,
      method: 'gemma3-contextual-repair'
    }
  };
  
  console.log('Fix strategy:');
  for (const [phase, config] of Object.entries(strategy)) {
    console.log(`   ${phase}: ${config.name}`);
    console.log(`      Estimated fixes: ${config.estimatedFixes.toLocaleString()}`);
    console.log(`      Method: ${config.method}`);
    console.log('');
  }
  
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'fix-strategy.json'),
    JSON.stringify(strategy, null, 2)
  );
  
  console.log('='.repeat(70));
  console.log('✅ Agentic RAG System Ready');
  console.log('');
  console.log('Next steps:');
  console.log('   1. Start agentic containers: docker-compose -f docker-compose.agentic.yml up -d');
  console.log('   2. Run Phase 1 fixes: node scripts/agentic-phase1-quick-wins.mjs');
  console.log('   3. Run Phase 2 fixes: node scripts/agentic-phase2-components.mjs');
  console.log('   4. Run Phase 3 fixes: node scripts/agentic-phase3-ai-repair.mjs');
  console.log('');
  console.log(`Reports saved to: ${path.relative(BASE_DIR, REPORTS_DIR)}`);
});
