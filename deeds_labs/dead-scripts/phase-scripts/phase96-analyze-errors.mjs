import fs from 'fs';

const logContent = fs.readFileSync('reports/svelte-check-all-errors.log', 'utf8');

// Parse errors line by line
const errorLines = [];
const lines = logContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Match file path + error pattern
  if (line.match(/^c:\\.*\.(ts|svelte):\d+:\d+\s*$/)) {
    const filePath = line.split(':').slice(0, -2).join(':').trim();
    const errorLine = lines[i + 1];

    if (errorLine && errorLine.includes('Error:')) {
      const match = errorLine.match(/Error: (.+?)$/);
      if (match) {
        errorLines.push({
          file: filePath,
          error: match[1],
          location: line
        });
      }
    }
  }
}

// Count error patterns
const errorMap = new Map();
errorLines.forEach(({ error }) => {
  errorMap.set(error, (errorMap.get(error) || 0) + 1);
});

// Sort by frequency
const sorted = Array.from(errorMap.entries())
  .sort((a, b) => b[1] - a[1]);

console.log('\n📊 ERROR ANALYSIS COMPLETE\n');
console.log(`Total errors parsed: ${errorLines.length}`);
console.log(`Unique error patterns: ${errorMap.size}`);
console.log(`\nTOP 100 ERROR PATTERNS:\n`);

sorted.slice(0, 100).forEach(([error, count], idx) => {
  console.log(`${idx + 1}. [${String(count).padStart(5)}x] ${error.substring(0, 110)}`);
});

// Categorize errors
const categories = {
  'Syntax: Colon instead of semicolon': {
    pattern: /^\'; expected.*colon|:\s*null/,
    examples: [],
    count: 0,
    fixTemplate: 'Replace : with ; or use proper union type syntax'
  },
  'Duplicate identifier/redeclare': {
    pattern: /Cannot redeclare|Duplicate identifier/,
    examples: [],
    count: 0,
    fixTemplate: 'Remove duplicates or rename variables'
  },
  'Property does not exist': {
    pattern: /Property .* does not exist on type/,
    examples: [],
    count: 0,
    fixTemplate: 'Add missing property to interface or make optional'
  },
  'Type not assignable': {
    pattern: /is not assignable to type/,
    examples: [],
    count: 0,
    fixTemplate: 'Update type or add type casting'
  },
  'Object possibly undefined': {
    pattern: /Object is possibly|possibly null|possibly undefined/,
    examples: [],
    count: 0,
    fixTemplate: 'Add null checks or optional chaining (?.)'
  },
  'Declaration expected': {
    pattern: /Declaration or statement expected|Unexpected token/,
    examples: [],
    count: 0,
    fixTemplate: 'Fix file corruption or syntax structure'
  },
  'Svelte 5 migration': {
    pattern: /export let|\$state\<|state_referenced|@render/,
    examples: [],
    count: 0,
    fixTemplate: 'Use Svelte 5 runes: $props(), $state(), $derived(), $effect()'
  },
  'Other': {
    pattern: /./,
    examples: [],
    count: 0,
    fixTemplate: 'Analyze and fix case-by-case'
  }
};

// Categorize
sorted.forEach(([error, count]) => {
  let found = false;
  for (const [category, info] of Object.entries(categories)) {
    if (category === 'Other') continue;
    if (info.pattern.test(error)) {
      info.count += count;
      if (info.examples.length < 3) {
        info.examples.push({ error: error.substring(0, 80), count });
      }
      found = true;
      break;
    }
  }
  if (!found) {
    categories['Other'].count += count;
  }
});

console.log('\n\n📂 ERRORS BY CATEGORY:\n');
Object.entries(categories)
  .filter(([, info]) => info.count > 0)
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([category, info]) => {
    console.log(`${category}: ${info.count}`);
    console.log(`  Fix: ${info.fixTemplate}`);
    console.log(`  Examples: ${info.examples.map(e => e.error).join(' | ')}\n`);
  });

// Save full analysis
const analysis = {
  summary: {
    totalErrors: errorLines.length,
    uniquePatterns: errorMap.size,
    generatedAt: new Date().toISOString(),
    svelteCheckOutput: 'svelte-check found 70232 errors and 169 warnings in 1972 files'
  },
  topPatterns: sorted.slice(0, 100).map(([e, c]) => ({ error: e, count: c })),
  categories,
  fixPriority: [
    {
      rank: 1,
      category: 'Syntax: Colon instead of semicolon',
      reason: 'Blocks type compilation',
      impact: 'HIGH',
      estimatedCount: categories['Syntax: Colon instead of semicolon'].count,
      fixScript: 'scripts/fix-colon-syntax.mjs'
    },
    {
      rank: 2,
      category: 'Cannot redeclare',
      reason: 'Duplicate exports prevent compilation',
      impact: 'CRITICAL',
      estimatedCount: categories['Duplicate identifier/redeclare'].count,
      fixScript: 'scripts/fix-redeclare.mjs'
    },
    {
      rank: 3,
      category: 'Property does not exist',
      reason: 'Missing type properties',
      impact: 'HIGH',
      estimatedCount: categories['Property does not exist'].count,
      fixScript: 'scripts/fix-missing-properties.mjs'
    },
    {
      rank: 4,
      category: 'Svelte 5 migration',
      reason: 'Old export let syntax incompatible',
      impact: 'MEDIUM',
      estimatedCount: categories['Svelte 5 migration'].count,
      fixScript: 'scripts/fix-svelte5-runes.mjs'
    }
  ]
};

fs.writeFileSync(
  'reports/error-analysis-70k.json',
  JSON.stringify(analysis, null, 2)
);

console.log('\n✅ Full analysis saved to: reports/error-analysis-70k.json');
