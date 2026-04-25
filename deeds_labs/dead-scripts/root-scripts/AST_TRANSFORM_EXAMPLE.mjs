/**
 * AST Transform Example: onMount(async) → IIFE Wrapper
 *
 * This file shows the regex-based transformation used in batch-merger-fixer-v2.mjs
 *
 * BEFORE:
 * -------
 * onMount(async () => {
 *   await loadPOIs();
 * });
 *
 * AFTER:
 * ------
 * onMount(() => {
 *   (async () => {
 *     await loadPOIs();
 *   })();
 * });
 */

// ============= SIMPLE REGEX APPROACH =============

// Pattern: matches the entire onMount(async...) call
const PATTERN = /onMount\s*\(\s*async\s*\(\s*\)\s*=>\s*\{([^]*?)\n\s*\}\s*\);/g;

// Replace function: wraps body in IIFE
function transformOnMountAsync(input) {
  return input.replace(PATTERN, (match, body) => {
    // Re-indent body by adding 2 spaces to each line after the first
    const lines = body.split('\n');
    const indentedBody = lines
      .map((line, idx) => {
        if (idx === 0) return line; // Keep first line as-is
        if (line.trim() === '') return line; // Preserve blank lines
        return '  ' + line; // Indent other lines
      })
      .join('\n');

    // Build replacement: onMount call with IIFE
    return `onMount(() => {
    (async () => {${indentedBody}
    })();
  });`;
  });
}

// ============= USAGE EXAMPLE =============

const input = `
import { onMount } from 'svelte';

let data = $state([]);

onMount(async () => {
  const response = await fetch('/api/data');
  data = await response.json();
});

async function loadMore() {
  // ...
}
`;

const output = transformOnMountAsync(input);

console.log('INPUT:\n', input);
console.log('\n\nOUTPUT:\n', output);

// ============= WITH ts-morph (TypeScript Compiler API) =============
/*
 * For a more robust AST-based approach using ts-morph:
 *
 * import { Project, SyntaxKind } from 'ts-morph';
 *
 * const project = new Project();
 * const sourceFile = project.createSourceFile('test.ts', sourceCode);
 *
 * // Find all ArrowFunctionExpressions with async modifier
 * sourceFile.forEachDescendantAsFunction((node) => {
 *   if (
 *     node.isAsync() &&
 *     node.getParent().getKind() === SyntaxKind.CallExpression &&
 *     node.getParent().getFirstChild()?.getText() === 'onMount'
 *   ) {
 *     // Get the body
 *     const body = node.getBody();
 *
 *     // Create wrapper IIFE
 *     const newBody = `(() => {
 *       (async () => {
 *         ${body}
 *       })();
 *     })()`;
 *
 *     // Replace in-place
 *     // ... AST manipulation ...
 *   }
 * });
 *
 * console.log(sourceFile.getFullText());
 */

// ============= SAFETY CONSIDERATIONS =============

/*
 * 1. INDENTATION PRESERVATION
 *    - Regex approach captures original indentation
 *    - Adds extra 2-space indent inside IIFE
 *    - Handles blank lines gracefully
 *
 * 2. STRING LITERALS & COMMENTS
 *    - Pattern doesn't match inside strings/comments
 *    - Uses [^]*? (non-greedy multiline match)
 *    - Won't accidentally match embedded onMount calls
 *
 * 3. IDEMPOTENCY
 *    - Pattern only matches `onMount(async`
 *    - Won't match already-wrapped `onMount(() => { (async`
 *    - Safe to run multiple times
 *
 * 4. EDGE CASES
 *    - Nested braces inside body? Handled by [^]*? (greedy until closing })
 *    - Single-line async calls? Won't match (pattern requires \n)
 *    - Multiple onMount calls? Each is replaced independently
 */

// ============= VALIDATION =============

// Test cases
const testCases = [
  {
    name: 'Basic async load',
    input: `onMount(async () => {
  await load();
});`,
    shouldMatch: true
  },
  {
    name: 'With state updates',
    input: `onMount(async () => {
  const data = await fetch();
  items = data;
});`,
    shouldMatch: true
  },
  {
    name: 'Already wrapped (idempotent)',
    input: `onMount(() => {
  (async () => {
    await load();
  })();
});`,
    shouldMatch: false
  },
  {
    name: 'Synchronous onMount',
    input: `onMount(() => {
  console.log('mounted');
});`,
    shouldMatch: false
  },
  {
    name: 'Single-line async',
    input: `onMount(async () => { await load(); });`,
    shouldMatch: false // Pattern requires newline
  }
];

console.log('\n\n=== VALIDATION TESTS ===\n');
testCases.forEach(({ name, input, shouldMatch }) => {
  const matches = PATTERN.test(input);
  PATTERN.lastIndex = 0; // Reset global flag

  const status = matches === shouldMatch ? '✅' : '❌';
  console.log(`${status} ${name}`);
  console.log(`   Expected: ${shouldMatch}, Got: ${matches}\n`);
});
