
/**
 * Shared Fix Patterns for Phase 72/78
 * Extracted from factory-fixer-v2.mjs
 */

export const TIER_DEFINITIONS = {
  1: {
    name: 'Safe Deterministic',
    description: 'Zero-risk transformations with 100% correctness',
    patterns: [
      {
        id: 'unused-import',
        category: 'import-cleanup',
        errorMatch: /^(?:(?:(?:Property|Variable) '[^']+' is declared but )|(?:'))('[^']+' is declared but (?:its value )?is never read)/,
        confidence: 0.95,
        fix: (line) => null // Signals: delete this line
      },
      {
        id: 'import-type-to-value',
        category: 'import-transform',
        errorMatch: /'([^']+)' cannot be used as a value because it was imported using 'import type'/,
        lineMatch: /import\s+type\s+\{/,
        confidence: 0.90,
        fix: (line) => line.replace(/import\s+type\s+\{/, 'import {')
      },
      {
        id: 'lucide-default-import',
        category: 'import-transform',
        errorMatch: /Module ["']lucide-svelte["'] has no exported member ['"']([A-Z][a-zA-Z0-9]+)['"']/,
        lineMatch: /import\s*\{[^}]*\}\s*from\s*['"]lucide-svelte['"]/,
        confidence: 0.95,
        fix: (line, errorMatch) => {
          const iconName = errorMatch[1];
          // If it's the only import: import { Brain } from "lucide-svelte" -> import Brain from "lucide-svelte"
          // If there are others: import { Brain, Calendar } from "lucide-svelte" -> import Brain from "lucide-svelte"; import { Calendar } from "lucide-svelte"
          if (line.includes(',')) {
            const newLine = line.replace(new RegExp(`\\b${iconName}\\b\\s*,?\\s*`), '').replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ ');
            return `import ${iconName} from "lucide-svelte";\n${newLine}`;
          }
          return line.replace(/import\s*\{\s*([A-Z][a-zA-Z0-9]+)\s*\}\s*from/, 'import $1 from');
        }
      }
    ]
  },
  2: {
    name: 'Review Required',
    description: 'Behavior-preserving refactors needing validation',
    patterns: [
      {
        id: 'zod-value-import',
        category: 'import-transform',
        errorMatch: /'z' cannot be used as a value because it was imported using 'import type'/,
        lineMatch: /import\s+type\s*\{\s*z\s*\}\s*from\s*['"]zod['"]/,
        confidence: 0.98,
        fix: (line) => line.replace(/import\s+type\s*\{\s*z\s*\}\s*from\s*['"]zod['"]/, 'import { z } from "zod"')
      },
      {
        id: 'lucide-default-import',
        category: 'import-transform',
        errorMatch: /Module ["']lucide-svelte["'] has no exported member ['"']([A-Z][a-zA-Z0-9]+)['"']/,
        lineMatch: /import\s*\{[^}]*\}\s*from\s*['"]lucide-svelte['"]/,
        confidence: 0.95,
        fix: (line, errorMatch) => {
          const iconName = errorMatch[1];
          // If it's the only import: import { Brain } from "lucide-svelte" -> import Brain from "lucide-svelte"
          // If there are others: import { Brain, Calendar } from "lucide-svelte" -> import Brain from "lucide-svelte"; import { Calendar } from "lucide-svelte"
          if (line.includes(',')) {
            const newLine = line.replace(new RegExp(`\\b${iconName}\\b\\s*,?\\s*`), '').replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ ');
            return `import ${iconName} from "lucide-svelte";\n${newLine}`;
          }
          return line.replace(/import\s*\{\s*([A-Z][a-zA-Z0-9]+)\s*\}\s*from/, 'import $1 from');
        }
      },
      {
        id: 'invalid-character-fix',
        category: 'syntax-fix',
        errorMatch: /Invalid character\./,
        confidence: 0.90,
        fix: (line) => {
          // Case 1: Hash comments in TS files (e.g. env.server.ts)
          if (/^\s*#/.test(line)) {
            return line.replace(/^(\s*)#/, '$1//');
          }

          // Case 2: Mojibake / Progress bars
          return line
            .replace(/├óΓÇ¥┼Æ├óΓÇ¥Γé¼/g, '━')
            .replace(/├óΓÇ¥Γé¼/g, '━')
            .replace(/├óΓÇ¥┬É/g, '┫')
            .replace(/├óΓÇ¥ΓÇÜ/g, '┃')
            .replace(/├óΓÇô╦å/g, '█')
            .replace(/âœ…/g, '✅')
            .replace(/âŒ/g, '❌')
            .replace(/âš¡/g, '⚡')
            .replace(/ðŸ“Š/g, '📊')
            .replace(/ðŸ“/g, '📄')
            .replace(/ðŸ”¥/g, '🔥')
            .replace(/ðŸš€/g, '🚀')
            .replace(/ðŸŽ¯/g, '🎯')
            .replace(/ðŸ’¾/g, '💾')
            .replace(/ðŸ”§/g, '🔧')
            .replace(/âš ï¸/g, '⚠️')
            .replace(/├░┼╕ΓÇ£┼á/g, '📄')
            .replace(/├░┼╕ΓÇ¥┬ì/g, '🔍')
            .replace(/├ó┼í┬í/g, '⚙️')
            .replace(/├░┼╕ΓÇ£┬ª/g, '📦')
            .replace(/├░┼╕┼╜┬«/g, '🎮')
            .replace(/├░┼╕ΓÇ¥┬¬/g, '🔬')
            .replace(/ðŸŽ¨/g, '🎨')
            .replace(/ðŸŽª/g, '🧪')
            .replace(/ðŸŽ®/g, '🎮')
            .replace(/ðŸŒ…/g, '🌅')
            .replace(/ðŸ”´/g, '🔴')
            .replace(/ðŸ”/g, '🔗')
            .replace(/ðŸŒ/g, '🌐')
            .replace(/ðŸ—„ï¸/g, '🗄️')
            .replace(/ðŸ˜/g, '🐘')
            .replace(/â€”/g, '—');
        }
      },
      {
        id: 'svelte5-events-safe',
        category: 'svelte-update',
        errorMatch: /Property 'on:\w+' does not exist on type/,
        lineMatch: /on:\w+=/,
        confidence: 0.92,
        fix: (line) => line.replace(/on:(\w+)=/g, 'on$1=' )
      },
      {
        id: 'html-tag-case-safe',
        category: 'html-fix',
        errorMatch: /Property '\w+' does not exist on type 'JSX\.IntrinsicElements'/,
        lineMatch: /<[A-Z][a-z]+/,
        confidence: 0.90,
        fix: (line) => line.replace(/<([A-Z][a-z]+)/g, (m, p1) => `<${p1.toLowerCase()}`)
      },
      {
        id: 'declare-module-comma',
        category: 'syntax-fix',
        errorMatch: /Declaration or statement expected/,
        lineMatch: /declare\s+module\s*,/,
        confidence: 0.95,
        fix: (line) => line.replace(/declare\s+module\s*,/g, 'declare module')
      },
      {
        id: 'xstate-import-fix',
        category: 'import-fix',
        errorMatch: /',' expected/,
        lineMatch: /import\s+type\s+\{\s*x\.x\.fromPromise\s*\}/,
        confidence: 0.9,
        fix: (line) => line.replace(/x\.x\.fromPromise/g, 'fromPromise')
      }
    ]
  },
  3: {
    name: 'Manual Only',
    description: 'Complex changes requiring domain expertise',
    patterns: []
  }
};
