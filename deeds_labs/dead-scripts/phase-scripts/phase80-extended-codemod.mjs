#!/usr/bin/env node
/**
 * Phase 80 Extended Codemod - Fix remaining corruption patterns
 * Targets patterns not caught by the base codemod
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const patterns = [
  // Fix return type union: ): Type: undefined => ): Type | undefined
  {
    name: 'return-type-union-extended',
    // Match things like "): Promise<T>: undefined" or "): Foo: null"
    regex: /\):\s*([A-Za-z_][\w<>\[\],\s|]*?):\s*(null|undefined)\b(?!\s*\|)/g,
    replace: '): $1 | $2',
  },
  // Fix class property type union: property: Type: null = => property: Type | null =
  {
    name: 'property-type-union',
    regex: /^(\s*(?:private\s+|public\s+|protected\s+|readonly\s+)*)(\w+):\s*([A-Za-z_][\w<>\[\],\s]*?):\s*(null|undefined)\s*=/gm,
    replace: '$1$2: $3 | $4 =',
  },
  // Fix function signature with extra type: (a: Type, value: number, number): => (a: Type, value: number):
  {
    name: 'trailing-type-param',
    regex: /,\s*(\w+)\):\s*(\w+)/g,
    replace: '): $2',
    // Only apply when we see `, word): word` pattern at end of params
    validate: (content, match) => {
      // Make sure this is fixing a duplicate like ", number): number"
      const before = content.slice(Math.max(0, match.index - 40), match.index);
      return before.includes(match[1]); // The same word appears before
    }
  },
  // Fix object literal shorthand corruption: { prop: value: prop2, value2: value2 }
  // Pattern: key: value: key2, => key: value, key2:
  {
    name: 'object-colon-separator',
    regex: /(\w+):\s*(\w+|\d+(?:\.\d+)?|true|false|null|'[^']*'|"[^"]*"):\s*(\w+),/g,
    replace: '$1: $2, $3:',
  },
  // Fix repeated identifier pattern: obj: obj: obj.prop => obj.prop
  {
    name: 'repeated-identifier',
    regex: /(\w+):\s*\1:\s*\1\.(\w+)/g,
    replace: '$1.$2',
  },
  // Fix type parameter that's a keyword: 0: 0: 0.5 => 0.5
  {
    name: 'numeric-colon-chain',
    regex: /(\d+):\s*\d+:\s*(\d+(?:\.\d+)?)/g,
    replace: '$2',
  },
  // Fix "func( thing, this: this: this.prop" => "func( thing, this.prop"
  {
    name: 'this-corruption',
    regex: /this:\s*this:\s*this\./g,
    replace: 'this.',
  },
  // Fix shorthand property that repeats: provided: provided: provided.X => provided.X
  {
    name: 'repeated-variable-access',
    regex: /\b(\w+):\s*\1:\s*\1\./g,
    replace: '$1.',
  },
  // Fix ": true, true: true," => ": true,"
  {
    name: 'boolean-corruption',
    regex: /:\s*(true|false),\s*\1:\s*\1,/g,
    replace: ': $1,',
  },
  // Fix double return type: ): number: number { => ): number {
  {
    name: 'double-return-type',
    regex: /\):\s*([A-Za-z0-9_]+):\s*([A-Za-z0-9_]+)\s*\{/g,
    replace: '): $2 {',
  },
  // Fix invalid shorthand: key, value.prop => key: value.prop
  {
    name: 'invalid-shorthand-prop',
    regex: /([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_]+\.[^,}\n]+)(?=,|\})/g,
    replace: '$1: $2',
  },
  // Fix nullish coalescing missing RHS: ??, => ?? null,
  {
    name: 'nullish-missing-rhs',
    regex: /\?\?\s*,/g,
    replace: '?? null,',
  },
  // Specific fix for CaseScoringServiceGrpc.ts model/version
  {
    name: 'fix-grpc-model-version',
    regex: /model:\s*([^:,]+):\s*(response\?\.metadata\?\.model_version[^,]*)/g,
    replace: 'model: $1, version: $2',
  },
  // Specific fix for CaseScoringServiceGrpc.ts 0: confidence
  {
    name: 'fix-grpc-zero-confidence',
    regex: /0:\s*(response\?\.confidence)/g,
    replace: 'confidence: $1',
  },
  // Specific fix for CaseScoringServiceGrpc.ts 0: criteria
  {
    name: 'fix-grpc-zero-criteria',
    regex: /0:\s*(criteria)/g,
    replace: 'criteria: $1',
  },
  // Specific fix for CaseScoringServiceGrpc.ts performanceMetrics
  {
    name: 'fix-grpc-perf-metrics',
    regex: /performanceMetrics,\s*(JSON\.stringify)/g,
    replace: 'performanceMetrics: $1',
  },
  // Specific fix for CaseScoringServiceGrpc.ts case_id metadata
  {
    name: 'fix-grpc-metadata',
    regex: /case_id:\s*([^,]+),\s*(this\.serializeCaseMetadata)/g,
    replace: 'case_id: $1, metadata: $2',
  },
  // Fix duplicate value corruption: key: value value, => key: value,
  {
    name: 'duplicate-value-corruption',
    regex: /(\w+):\s*(\d+|true|false|'[^']*'|"[^"]*")\s+\2(?=[,}])/g,
    replace: '$1: $2',
  },
  // Fix import unknown: import unknown from => import nodejsOrchestrator from
  {
    name: 'import-unknown',
    regex: /import\s+unknown\s+from/g,
    replace: 'import nodejsOrchestrator from',
  },
  // Fix or-comma corruption: ||, => ||
  {
    name: 'or-comma',
    regex: /\|\|,\s*/g,
    replace: '|| ',
  },
  // Fix number-key corruption: || 4: batchSize => || 4, batchSize: 4
  {
    name: 'number-key-corruption',
    regex: /\|\|\s*(\d+):\s*(\w+)/g,
    replace: '|| $1, $2: $1',
  },
  // Fix duplicate key-value corruption: contextSize: 8192, 8192: => contextSize: 8192,
  {
    name: 'duplicate-key-value',
    regex: /(\w+):\s*([^,]+),\s*\2:/g,
    replace: '$1: $2,',
  },
  // Fix numeric sequence corruption: temperature: 0 0.7 => temperature: 0.7
  {
    name: 'numeric-sequence-corruption',
    regex: /(\w+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?=[,}])/g,
    replace: '$1: $3',
  },
];

function processFile(filePath, dryRun = false) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`  ❌ Cannot read: ${filePath}`);
    return { fixes: 0, modified: false };
  }

  let modified = content;
  let totalFixes = 0;
  const fixDetails = [];

  for (const pattern of patterns) {
    let patternFixes = 0;
    const matches = modified.matchAll(new RegExp(pattern.regex.source, pattern.regex.flags));

    for (const match of [...matches]) {
      // Skip if pattern has validation and it fails
      if (pattern.validate && !pattern.validate(modified, match)) {
        continue;
      }
    }

    const newContent = modified.replace(pattern.regex, (...args) => {
      patternFixes++;
      // Build replacement string
      let replacement = pattern.replace;
      for (let i = 1; i < args.length - 2; i++) {
        if (args[i] !== undefined) {
          replacement = replacement.replace(new RegExp(`\\$${i}`, 'g'), args[i]);
        }
      }
      return replacement;
    });

    if (newContent !== modified) {
      totalFixes += patternFixes;
      fixDetails.push(`${pattern.name}: ${patternFixes}`);
      modified = newContent;
    }
  }

  if (totalFixes > 0 && !dryRun) {
    fs.writeFileSync(filePath, modified, 'utf8');
  }

  return { fixes: totalFixes, modified: totalFixes > 0, details: fixDetails };
}

function findFiles(dir, extensions = ['.ts', '.tsx']) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .svelte-kit, etc.
        if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Robust argument parsing
function getArgValue(argName) {
  const equalsMatch = args.find(a => a.startsWith(`${argName}=`));
  if (equalsMatch) return equalsMatch.split('=')[1];

  const index = args.indexOf(argName);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];

  return null;
}

const dirArg = getArgValue('--dir');
const fileArg = getArgValue('--file');

console.log(`\n🔧 Phase 80: Extended Pattern Codemod${dryRun ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(50));

let files = [];
// Use process.cwd() for more predictable resolution relative to where the command is run
const rootDir = process.cwd();

function resolveExistingFile(p) {
  // Remove quotes if present (PowerShell/shell artifact)
  const cleanPath = p.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const abs = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(rootDir, cleanPath);

  if (!fs.existsSync(abs)) {
    throw new Error(`--file not found: ${abs}`);
  }
  return abs;
}

if (fileArg) {
  files = [resolveExistingFile(fileArg)];
} else if (dirArg) {
  const targetDir = path.resolve(rootDir, dirArg);
  files = findFiles(targetDir);
} else {
  // Default to src directory
  files = findFiles(path.join(rootDir, 'src'));
}

// Write proof file list
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/phase80-files-to-process.txt", files.join("\n"), "utf8");
console.log(`Wrote file list: reports/phase80-files-to-process.txt`);

console.log(`\n📁 Found ${files.length} files to process\n`);

let totalFixes = 0;
let filesModified = 0;
const patternCounts = {};

for (const file of files) {
  const relPath = path.relative(rootDir, file);
  const result = processFile(file, dryRun);

  if (result.fixes > 0) {
    console.log(`  ✅ ${relPath}: ${result.fixes} fixes`);
    if (result.details) {
      for (const detail of result.details) {
        console.log(`      - ${detail}`);
        const [name, count] = detail.split(': ');
        patternCounts[name] = (patternCounts[name] || 0) + parseInt(count);
      }
    }
    filesModified++;
    totalFixes += result.fixes;
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 Summary');
console.log('='.repeat(50));
console.log(`Files processed: ${files.length}`);
console.log(`Files modified: ${filesModified}`);
console.log(`Total fixes: ${totalFixes}`);
console.log('\nFixes by pattern:');
for (const [name, count] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  - ${name}: ${count}`);
}
console.log(`\n✅ Codemod complete!${dryRun ? ' (no changes written)' : ''}`);
