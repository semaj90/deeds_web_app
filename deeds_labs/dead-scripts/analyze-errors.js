import fs from 'fs';

const log = fs.readFileSync('reports/svelte-check-all-errors.log', 'utf8');
const lines = log.split('\n');

const errorMap = new Map();
const fileMap = new Map();

lines.forEach((line) => {
  if (line.includes('Error:')) {
    const match = line.match(/Error: (.+?)$/);
    if (match) {
      const error = match[1].trim();
      errorMap.set(error, (errorMap.get(error) || 0) + 1);
    }
  }

  // Track files
  if (line.match(/^c:\\.*\.(ts|svelte):/)) {
    const filePath = line.split(':')[0];
    fileMap.set(filePath, (fileMap.get(filePath) || 0) + 1);
  }
});

const sorted = Array.from(errorMap.entries())
  .sort((a, b) => b[1] - a[1]);

console.log('\n📊 TOP 100 ERROR PATTERNS:\n');
sorted.slice(0, 100).forEach(([err, cnt], i) => {
  console.log(`${i+1}. [${cnt}x] ${err.substring(0, 100)}`);
});

console.log(`\n\n📈 SUMMARY:\n`);
console.log(`Total unique error patterns: ${errorMap.size}`);
console.log(`Total error occurrences: ${lines.filter(l => l.includes('Error:')).length}`);
console.log(`Files with errors: ${fileMap.size}`);

// Save recommendations
const recommendations = {
  summary: {
    totalErrors: lines.filter(l => l.includes('Error:')).length,
    uniquePatterns: errorMap.size,
    filesAffected: fileMap.size,
    generatedAt: new Date().toISOString()
  },
  topPatterns: sorted.slice(0, 100).map(([e, c]) => ({ error: e, count: c })),
  topFiles: Array.from(fileMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([f, c]) => ({ file: f, errorCount: c })),
  fixStrategies: {
    'Syntax errors (colon instead of semicolon)': {
      pattern: "'; expected' where ':' appears",
      solution: 'Replace colons with semicolons in type definitions',
      example: 'incidentDate?: string | Date: null; => incidentDate?: string | Date | null;',
      priority: 'CRITICAL',
      estimatedCount: sorted.filter(([e]) => e.includes("'; expected")).reduce((a, [,c]) => a + c, 0)
    },
    'Cannot redeclare': {
      pattern: "Cannot redeclare block-scoped variable",
      solution: 'Check for duplicate exports/declarations, merge or rename',
      priority: 'CRITICAL',
      estimatedCount: sorted.filter(([e]) => e.includes('Cannot redeclare')).reduce((a, [,c]) => a + c, 0)
    },
    'Duplicate identifier': {
      pattern: "Duplicate identifier 'null'",
      solution: 'Remove redundant null identifiers from type unions',
      example: 'string | Date: null; => string | Date | null;',
      priority: 'HIGH',
      estimatedCount: sorted.filter(([e]) => e.includes('Duplicate identifier')).reduce((a, [,c]) => a + c, 0)
    },
    'Declaration expected': {
      pattern: 'Declaration or statement expected',
      solution: 'Fix file corruption/malformed syntax, rebuild corrupted files',
      priority: 'CRITICAL',
      estimatedCount: sorted.filter(([e]) => e.includes('Declaration or statement')).reduce((a, [,c]) => a + c, 0)
    },
    'Type not assignable': {
      pattern: 'Type .* is not assignable to type',
      solution: 'Update component props/types or use type casting',
      priority: 'HIGH',
      estimatedCount: sorted.filter(([e]) => e.includes('not assignable')).reduce((a, [,c]) => a + c, 0)
    }
  }
};

fs.writeFileSync(
  'reports/error-analysis-recommendations.json',
  JSON.stringify(recommendations, null, 2)
);

console.log('\n✅ Detailed recommendations saved to: reports/error-analysis-recommendations.json');
