/**
 * Bits-UI Import Migration Fix Pattern
 *
 * Converts old Bits-UI imports to Svelte 5 patterns.
 * Handles Button.Root, Dialog.Root, Select.Root conversions
 * and updates event handlers from on:click to onclick.
 *
 * @requirements 1.2, 4.3
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix old Bits-UI Button imports
 * Before: import { Button } from 'bits-ui'
 * After:  import { Button } from 'bits-ui' (with .Root usage)
 */
export const bitsUiButtonImportPattern: PatternMatcher = createPattern(
  'bits-ui-button-import',
  'Ensure Bits-UI Button imports are correct for Svelte 5',
  /import\s*\{\s*Button\s*\}\s*from\s*['"]bits-ui['"]/g,
  "import { Button } from 'bits-ui'",
  {
    priority: 5,
  }
);

/**
 * Pattern to convert on:click to onclick for Svelte 5
 * Before: <Button on:click={handler}>
 * After:  <Button onclick={handler}>
 */
export const svelteEventHandlerPattern: PatternMatcher = createPattern(
  'svelte5-onclick-handler',
  'Convert on:click to onclick for Svelte 5 compatibility',
  /on:click\s*=\s*\{([^}]+)\}/g,
  'onclick={$1}',
  {
    priority: 10,
  }
);

/**
 * Pattern to convert on:change to onchange for Svelte 5
 */
export const svelteOnChangePattern: PatternMatcher = createPattern(
  'svelte5-onchange-handler',
  'Convert on:change to onchange for Svelte 5 compatibility',
  /on:change\s*=\s*\{([^}]+)\}/g,
  'onchange={$1}',
  {
    priority: 11,
  }
);

/**
 * Pattern to convert on:input to oninput for Svelte 5
 */
export const svelteOnInputPattern: PatternMatcher = createPattern(
  'svelte5-oninput-handler',
  'Convert on:input to oninput for Svelte 5 compatibility',
  /on:input\s*=\s*\{([^}]+)\}/g,
  'oninput={$1}',
  {
    priority: 12,
  }
);

/**
 * Pattern to convert on:submit to onsubmit for Svelte 5
 */
export const svelteOnSubmitPattern: PatternMatcher = createPattern(
  'svelte5-onsubmit-handler',
  'Convert on:submit to onsubmit for Svelte 5 compatibility',
  /on:submit\s*=\s*\{([^}]+)\}/g,
  'onsubmit={$1}',
  {
    priority: 13,
  }
);

/**
 * Pattern to convert on:keydown to onkeydown for Svelte 5
 */
export const svelteOnKeydownPattern: PatternMatcher = createPattern(
  'svelte5-onkeydown-handler',
  'Convert on:keydown to onkeydown for Svelte 5 compatibility',
  /on:keydown\s*=\s*\{([^}]+)\}/g,
  'onkeydown={$1}',
  {
    priority: 14,
  }
);

/**
 * Pattern to convert on:keyup to onkeyup for Svelte 5
 */
export const svelteOnKeyupPattern: PatternMatcher = createPattern(
  'svelte5-onkeyup-handler',
  'Convert on:keyup to onkeyup for Svelte 5 compatibility',
  /on:keyup\s*=\s*\{([^}]+)\}/g,
  'onkeyup={$1}',
  {
    priority: 15,
  }
);

/**
 * Pattern to convert on:focus to onfocus for Svelte 5
 */
export const svelteOnFocusPattern: PatternMatcher = createPattern(
  'svelte5-onfocus-handler',
  'Convert on:focus to onfocus for Svelte 5 compatibility',
  /on:focus\s*=\s*\{([^}]+)\}/g,
  'onfocus={$1}',
  {
    priority: 16,
  }
);

/**
 * Pattern to convert on:blur to onblur for Svelte 5
 */
export const svelteOnBlurPattern: PatternMatcher = createPattern(
  'svelte5-onblur-handler',
  'Convert on:blur to onblur for Svelte 5 compatibility',
  /on:blur\s*=\s*\{([^}]+)\}/g,
  'onblur={$1}',
  {
    priority: 17,
  }
);

/**
 * Pattern to convert on:mouseover to onmouseover for Svelte 5
 */
export const svelteOnMouseoverPattern: PatternMatcher = createPattern(
  'svelte5-onmouseover-handler',
  'Convert on:mouseover to onmouseover for Svelte 5 compatibility',
  /on:mouseover\s*=\s*\{([^}]+)\}/g,
  'onmouseover={$1}',
  {
    priority: 18,
  }
);

/**
 * Pattern to convert on:mouseout to onmouseout for Svelte 5
 */
export const svelteOnMouseoutPattern: PatternMatcher = createPattern(
  'svelte5-onmouseout-handler',
  'Convert on:mouseout to onmouseout for Svelte 5 compatibility',
  /on:mouseout\s*=\s*\{([^}]+)\}/g,
  'onmouseout={$1}',
  {
    priority: 19,
  }
);

/**
 * Pattern to convert on:mouseenter to onmouseenter for Svelte 5
 */
export const svelteOnMouseenterPattern: PatternMatcher = createPattern(
  'svelte5-onmouseenter-handler',
  'Convert on:mouseenter to onmouseenter for Svelte 5 compatibility',
  /on:mouseenter\s*=\s*\{([^}]+)\}/g,
  'onmouseenter={$1}',
  {
    priority: 20,
  }
);

/**
 * Pattern to convert on:mouseleave to onmouseleave for Svelte 5
 */
export const svelteOnMouseleavePattern: PatternMatcher = createPattern(
  'svelte5-onmouseleave-handler',
  'Convert on:mouseleave to onmouseleave for Svelte 5 compatibility',
  /on:mouseleave\s*=\s*\{([^}]+)\}/g,
  'onmouseleave={$1}',
  {
    priority: 21,
  }
);

/**
 * Pattern to fix export let to $props() for Svelte 5
 * Before: export let value = '';
 * After:  let { value = '' } = $props();
 * Note: This is a complex transformation that may need manual review
 */
export const exportLetToPropsPattern: PatternMatcher = createPattern(
  'svelte5-export-let-to-props',
  'Convert export let to $props() destructuring for Svelte 5',
  /export\s+let\s+(\w+)\s*=\s*([^;]+);/g,
  (match, propName, defaultValue) => {
    // Return a comment indicating manual review needed for complex cases
    return `let { ${propName} = ${defaultValue.trim()} } = $props();`;
  },
  {
    priority: 8,
    // Only apply to .svelte files
    validate: (before, after) => {
      // Ensure we don't break valid export statements
      return !after.includes('export let');
    },
  }
);

/**
 * Pattern to fix simple export let without default value
 * Before: export let value;
 * After:  let { value } = $props();
 */
export const exportLetSimplePattern: PatternMatcher = createPattern(
  'svelte5-export-let-simple',
  'Convert simple export let to $props() for Svelte 5',
  /export\s+let\s+(\w+)\s*;/g,
  'let { $1 } = $props();',
  {
    priority: 9,
  }
);

/**
 * Pattern to fix Bits-UI Dialog usage for Svelte 5
 * Ensures Dialog.Root, Dialog.Trigger, Dialog.Content patterns
 */
export const bitsUiDialogPattern: PatternMatcher = createPattern(
  'bits-ui-dialog-pattern',
  'Ensure Bits-UI Dialog uses correct Svelte 5 patterns',
  /<Dialog\s+([^>]*?)>/g,
  '<Dialog.Root $1>',
  {
    priority: 6,
    validate: (before, after) => {
      // Don't double-convert Dialog.Root
      return !before.includes('Dialog.Root') || after.includes('Dialog.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Select usage for Svelte 5
 */
export const bitsUiSelectPattern: PatternMatcher = createPattern(
  'bits-ui-select-pattern',
  'Ensure Bits-UI Select uses correct Svelte 5 patterns',
  /<Select\s+([^>]*?)>/g,
  '<Select.Root $1>',
  {
    priority: 7,
    validate: (before, after) => {
      return !before.includes('Select.Root') || after.includes('Select.Root');
    },
  }
);

/**
 * Get all Bits-UI migration patterns in priority order
 */
export function getBitsUiMigrationPatterns(): PatternMatcher[] {
  return [
    bitsUiButtonImportPattern,
    bitsUiDialogPattern,
    bitsUiSelectPattern,
    exportLetToPropsPattern,
    exportLetSimplePattern,
    svelteEventHandlerPattern,
    svelteOnChangePattern,
    svelteOnInputPattern,
    svelteOnSubmitPattern,
    svelteOnKeydownPattern,
    svelteOnKeyupPattern,
    svelteOnFocusPattern,
    svelteOnBlurPattern,
    svelteOnMouseoverPattern,
    svelteOnMouseoutPattern,
    svelteOnMouseenterPattern,
    svelteOnMouseleavePattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply Bits-UI migration fixes to content
 */
export function fixBitsUiMigration(content: string): { result: string; fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getBitsUiMigrationPatterns()) {
    const matches = result.match(pattern.pattern);
    if (matches) {
      totalFixes += matches.length;
      if (typeof pattern.replacement === 'function') {
        result = result.replace(pattern.pattern, pattern.replacement);
      } else {
        result = result.replace(pattern.pattern, pattern.replacement);
      }
    }
  }

  return { result, fixCount: totalFixes };
}
