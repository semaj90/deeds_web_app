/**
 * Phase 97: Fix comma-to-colon corruption patterns
 * Fixes JSON object properties where comma was used instead of colon
 */

import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.{ts,svelte}', { cwd: process.cwd() });

let totalFixed = 0;
let filesFixed = 0;

// Pattern 1: Object property assignment - "key, value" where the key is a known identifier
// Examples: query, request.query -> query: request.query
//           id, request.id -> id: request.id
const objectPropertyPattern = /(\b(?:id|query|type|model|data|config|endpoint|method|body|headers|status|error|success|result|value|key|name|content|text|message|timestamp|metadata|options|params|request|response|limit|offset|filters|threshold|priority|timeout|callback|handler|listener|context|state|props|event|target|source|destination|path|url|file|filename|buffer|stream|encoding|format|mime|size|length|count|index|position|offset|start|end|min|max|total|average|sum|mean|median|mode|variance|stddev|correlation|covariance|percentile|quantile|ratio|rate|frequency|interval|duration|delay|period|cycle|phase|amplitude|wavelength|temperature|pressure|volume|mass|density|velocity|acceleration|force|energy|power|momentum|torque|current|voltage|resistance|capacitance|inductance|impedance)\s*),(\s*\w+[.\[])/g;

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;

    // Apply pattern 1: Common object property assignments
    let match;
    while ((match = objectPropertyPattern.exec(content)) !== null) {
      // Check that the preceding context looks like an object literal
      const beforeMatch = content.substring(Math.max(0, match.index - 50), match.index);
      if (beforeMatch.includes('{') || beforeMatch.includes(',')) {
        fileFixCount++;
      }
    }

    // Reset regex state
    objectPropertyPattern.lastIndex = 0;

    // Apply the fix
    content = content.replace(objectPropertyPattern, '$1:$2');

    if (content !== originalContent) {
      writeFileSync(file, content, 'utf-8');
      console.log(`✅ ${file}: Fixed ${fileFixCount} patterns`);
      totalFixed += fileFixCount;
      filesFixed++;
    }
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err);
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixed} occurrences in ${filesFixed} files`);
console.log(`\n⚠️  NOTE: This is a partial fix. Manual review may still be needed for complex cases.`);
