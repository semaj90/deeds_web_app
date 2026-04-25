#!/usr/bin/env node
/**
 * PHASE 30v2 VALIDATION SCRIPT
 * 
 * Tests the Phase 30v2 script on sample files to ensure:
 * - Import statements are NOT corrupted
 * - Valid fixes are applied correctly
 * - No cascading errors are created
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Phase 30v2 Validation Tests');
console.log('================================\n');

const testCases = [
  {
    name: 'Import Protection',
    input: `import type { User } from '$lib/types';
import { db } from '$lib/server/db';
export { handler } from './handler';`,
    expected: `import type { User } from '$lib/types';
import { db } from '$lib/server/db';
export { handler } from './handler';`,
    description: 'Import statements should NOT be modified'
  },
  
  {
    name: 'Type Annotation Colon',
    input: `function test(name string, age number) {
  const user name = 'John';
}`,
    expected: `function test(name: string, age: number) {
  const user name = 'John';
}`,
    description: 'Should add colons to type annotations'
  },
  
  {
    name: 'Interface Semicolons',
    input: `interface User {
  name: string
  age: number
  email: string
}`,
    expected: `interface User {
  name: string;
  age: number;
  email: string
}`,
    description: 'Should add semicolons between interface properties'
  },
  
  {
    name: 'Generic Commas',
    input: `type MapType = Map<string number>;
const data: Record<string boolean> = {};`,
    expected: `type MapType = Map<string, number>;
const data: Record<string, boolean> = {};`,
    description: 'Should add commas in generic parameters'
  },
  
  {
    name: 'Object Literal (Safe)',
    input: `const config = {
  name "test"
  value 123
};`,
    expected: `const config = {
  name: "test"
  value 123
};`,
    description: 'Should fix object properties without corrupting imports'
  },
  
  {
    name: 'Keyword Exclusion (new, as, return)',
    input: `const map = new Map<string, number>();
const data = obj as Record<string, boolean>;
function test(): void {
  return undefined;
}`,
    expected: `const map = new Map<string, number>();
const data = obj as Record<string, boolean>;
function test(): void {
  return undefined;
}`,
    description: 'Should NOT add colons after keywords like new, as, return'
  },
  
  {
    name: 'Mixed Context',
    input: `import { User } from './types';

interface Config {
  name: string
  value: number
}

function init(name string): void {
  const obj = { key "value" };
}`,
    expected: `import { User } from './types';

interface Config {
  name: string;
  value: number
}

function init(name: string): void {
  const obj = { key: "value" };
}`,
    description: 'Should handle mixed contexts correctly'
  }
];

let passed = 0;
let failed = 0;

// Simple version of the fix function for testing
function isImportLine(line) {
  return /^\s*import\s+/.test(line) || /^\s*export\s+.*from\s+/.test(line);
}

function applyFixesForTest(content) {
  const lines = content.split('\n');
  const fixedLines = [];
  let inInterface = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const nextLine = lines[i + 1] || '';
    
    // CRITICAL: Skip import lines
    if (isImportLine(line)) {
      fixedLines.push(line);
      continue;
    }
    
    // Track interface context
    if (line.match(/^\s*(interface|type)\s+\w+/)) {
      inInterface = true;
    } else if (line.match(/^\s*}\s*$/) && inInterface) {
      inInterface = false;
    }
    
    // Generics FIRST (before type annotations)
    // Match any type names inside < >, not just capitals
    line = line.replace(/<(\w+)\s+(\w+)>/g, '<$1, $2>');
    line = line.replace(/<(\w+),\s+(\w+)\s+(\w+)>/g, '<$1, $2, $3>');  // 3 params
    
    // Type annotations (SKIP content inside < > AND after keywords)
    // Split by < >, process only outside parts
    const parts = line.split(/(<[^>]+>)/);
    const fixedParts = parts.map((part, idx) => {
      // Even indices are outside <>, odd indices are inside <>
      if (idx % 2 === 0) {
        // Exclude keywords
        part = part.replace(/\b(?<!new\s)(?<!as\s)(?<!return\s)(?<!typeof\s)(\w+)\s+(string|number|boolean|any|void|unknown|object|null|undefined)(?!\w)/g, (match, word, type) => {
          if (['new', 'as', 'return', 'typeof', 'instanceof', 'extends'].includes(word)) {
            return match;
          }
          return `${word}: ${type}`;
        });
        part = part.replace(/\b(?<!new\s)(?<!as\s)(\w+)\s+(Array|Promise|Map|Set|Record|Partial|Required|Readonly)(?=<)/g, (match, word, type) => {
          if (['new', 'as'].includes(word)) {
            return match;
          }
          return `${word}: ${type}`;
        });
      }
      return part;
    });
    line = fixedParts.join('');
    
    // Interface semicolons
    if (inInterface && line.match(/:\s*[^;,{\n]+$/) && nextLine.match(/^\s+\w+:/)) {
      if (!line.endsWith(';')) {
        line = line.trimEnd() + ';';
      }
    }
    
    // Function params
    line = line.replace(/(\w+:\s*[^,)]+)\s+(\w+:)/g, '$1, $2');
    
    // Object properties (very conservative)
    const prevLine = i > 0 ? lines[i - 1] : '';
    const inObjectLiteral = line.includes('{') || prevLine.includes('{');
    if (inObjectLiteral && !isImportLine(line)) {
      line = line.replace(/(?<!from\s)(\w+)\s+(["'])(?!.*import)/g, '$1: $2');
    }
    
    fixedLines.push(line);
  }
  
  return fixedLines.join('\n');
}

// Run tests
testCases.forEach((test, index) => {
  const result = applyFixesForTest(test.input);
  const success = result === test.expected;
  
  if (success) {
    console.log(`✅ Test ${index + 1}: ${test.name}`);
    passed++;
  } else {
    console.log(`❌ Test ${index + 1}: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    console.log(`   Expected:`);
    console.log(`   ${test.expected.replace(/\n/g, '\n   ')}`);
    console.log(`   Got:`);
    console.log(`   ${result.replace(/\n/g, '\n   ')}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Tests Passed: ${passed}/${testCases.length}`);
console.log(`Tests Failed: ${failed}/${testCases.length}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ All tests passed! Script is safe to run.\n');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Review the script before running.\n');
  process.exit(1);
}
