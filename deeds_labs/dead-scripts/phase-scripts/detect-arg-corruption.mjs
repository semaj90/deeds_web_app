/**
 * Detect function calls with colon-instead-of-comma corruption
 * e.g. func(arg1: arg2) instead of func(arg1, arg2)
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.{ts,svelte}', { cwd: process.cwd() });
const primitiveTypes = new Set(['string', 'number', 'boolean', 'any', 'unknown', 'void', 'never', 'object', 'symbol', 'null', 'undefined', 'true', 'false']);

let totalFound = 0;

for (const file of files) {
  if (file.endsWith('.d.ts')) continue; // Skip def files for now, too many false positives

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for pattern: identifier( ... word: word ... )
    // We iterate over potential matches
    const callRegex = /\b(\w+)\s*\(([^)]+)\)/g;
    let match;
    while ((match = callRegex.exec(line)) !== null) {
      const funcName = match[1];
      const args = match[2];

      // Check for colons in args
      if (args.includes(':')) {
        // Split by comma to handle multiple args, then check each part
        // Actually, if comma is missing, we might have "arg1: arg2: arg3"
        // Let's split by colon? No.

        // Match "word: word"
        const argCorruption = /([\w.]+)\s*:\s*([\w.]+)/g;
        let argMatch;
        while ((argMatch = argCorruption.exec(args)) !== null) {
          const key = argMatch[1];
          const val = argMatch[2];

          // Heuristic: If val is NOT a primitive type, and looks like a variable (lowercase start, or dotted), it might be a corruption
          // Exception: object literals inside function calls: func({ a: b })
          // We need to check if we are inside {}

          // Simple check: does the args string contain '{'?
          if (args.includes('{')) continue; // Skip object literals for simplicity (lots of valid cases)

          if (!primitiveTypes.has(val)) {
            // Further filtering:
            // In function DEFINITIONS: func(arg: Type) -> Valid
            // In function CALLS: func(arg: val) -> Invalid (unless named params proposal, not std JS/TS)

            // If the line starts with "function" or "const ... =" it might be a definition?
            // "export function foo(a: Type)"
            // "const foo = (a: Type) =>"

            const isDef = line.includes('function ') || line.includes('=>') || line.trim().startsWith('class ') || line.includes('constructor') || line.includes('interface ') || line.includes('type ');

            if (!isDef) {
               console.log(`Potential corruption in ${file}:${i+1}`);
               console.log(`  Line: ${line.trim()}`);
               console.log(`  Match: ${funcName}(... ${key}: ${val} ...)`);
               totalFound++;
            }
          }
        }
      }
    }
  }
}

console.log(`Total potential corruptions found: ${totalFound}`);
