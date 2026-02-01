/**
 * Bits-UI Import Migration Fix Pattern
 *
 * Converts old Bits-UI imports to Svelte 5 patterns.
 * Handles Button.Root, Dialog.Root, Select.Root conversions
 * and updates event handlers from on:click to onclick.
 *
 * Key migrations:
 * 1. Event handlers: on, click -> onclick, on:change -> onchange, etc.
 * 2. Props: export let -> let { ... } = $props()
 * 3. Components: <Button> -> <Button.Root>, <Dialog> -> <Dialog.Root>
 *
 * @requirements 1.2, 4.3
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

// ============================================================================
// BITS-UI COMPONENT IMPORT PATTERNS
// ============================================================================

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

// ============================================================================
// SVELTE 5 EVENT HANDLER PATTERNS
// ============================================================================

/**
 * Pattern to convert on:click to onclick for Svelte 5
 * Before: <Button, on:click={handler}>
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
 * Pattern to convert on:click with modifiers to onclick
 * Before: <button, on:click|preventDefault={handler}>
 * After:  <button onclick={(e) => { e.preventDefault(); handler(e); }}>
 */
export const svelteEventHandlerWithModifiersPattern: PatternMatcher = createPattern(
  'svelte5-onclick-with-modifiers',
  'Convert on:click with modifiers to onclick for Svelte 5',
  /on:click\|preventDefault\s*=\s*\{([^}]+)\}/g,
  'onclick={(e) => { e.preventDefault(); ($1)(e); }}',
  {
    priority: 10,
  }
);

/**
 * Pattern to convert on:click|stopPropagation
 */
export const svelteEventHandlerStopPropPattern: PatternMatcher = createPattern(
  'svelte5-onclick-stop-propagation',
  'Convert on:click|stopPropagation to onclick for Svelte 5',
  /on:click\|stopPropagation\s*=\s*\{([^}]+)\}/g,
  'onclick={(e) => { e.stopPropagation(); ($1)(e); }}',
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
 * Pattern to convert on:scroll to onscroll for Svelte 5
 */
export const svelteOnScrollPattern: PatternMatcher = createPattern(
  'svelte5-onscroll-handler',
  'Convert on:scroll to onscroll for Svelte 5 compatibility',
  /on:scroll\s*=\s*\{([^}]+)\}/g,
  'onscroll={$1}',
  {
    priority: 22,
  }
);

/**
 * Pattern to convert on:resize to onresize for Svelte 5
 */
export const svelteOnResizePattern: PatternMatcher = createPattern(
  'svelte5-onresize-handler',
  'Convert on:resize to onresize for Svelte 5 compatibility',
  /on:resize\s*=\s*\{([^}]+)\}/g,
  'onresize={$1}',
  {
    priority: 23,
  }
);

/**
 * Pattern to convert on:load to onload for Svelte 5
 */
export const svelteOnLoadPattern: PatternMatcher = createPattern(
  'svelte5-onload-handler',
  'Convert on:load to onload for Svelte 5 compatibility',
  /on:load\s*=\s*\{([^}]+)\}/g,
  'onload={$1}',
  {
    priority: 24,
  }
);

/**
 * Pattern to convert on:error to onerror for Svelte 5
 */
export const svelteOnErrorPattern: PatternMatcher = createPattern(
  'svelte5-onerror-handler',
  'Convert on:error to onerror for Svelte 5 compatibility',
  /on:error\s*=\s*\{([^}]+)\}/g,
  'onerror={$1}',
  {
    priority: 25,
  }
);

/**
 * Pattern to convert on:contextmenu to oncontextmenu for Svelte 5
 */
export const svelteOnContextmenuPattern: PatternMatcher = createPattern(
  'svelte5-oncontextmenu-handler',
  'Convert on:contextmenu to oncontextmenu for Svelte 5 compatibility',
  /on:contextmenu\s*=\s*\{([^}]+)\}/g,
  'oncontextmenu={$1}',
  {
    priority: 26,
  }
);

/**
 * Pattern to convert on:dblclick to ondblclick for Svelte 5
 */
export const svelteOnDblclickPattern: PatternMatcher = createPattern(
  'svelte5-ondblclick-handler',
  'Convert on:dblclick to ondblclick for Svelte 5 compatibility',
  /on:dblclick\s*=\s*\{([^}]+)\}/g,
  'ondblclick={$1}',
  {
    priority: 27,
  }
);

/**
 * Pattern to convert on:drag to ondrag for Svelte 5
 */
export const svelteOnDragPattern: PatternMatcher = createPattern(
  'svelte5-ondrag-handler',
  'Convert on:drag to ondrag for Svelte 5 compatibility',
  /on:drag\s*=\s*\{([^}]+)\}/g,
  'ondrag={$1}',
  {
    priority: 28,
  }
);

/**
 * Pattern to convert on:dragstart to ondragstart for Svelte 5
 */
export const svelteOnDragstartPattern: PatternMatcher = createPattern(
  'svelte5-ondragstart-handler',
  'Convert on:dragstart to ondragstart for Svelte 5 compatibility',
  /on:dragstart\s*=\s*\{([^}]+)\}/g,
  'ondragstart={$1}',
  {
    priority: 29,
  }
);

/**
 * Pattern to convert on:dragend to ondragend for Svelte 5
 */
export const svelteOnDragendPattern: PatternMatcher = createPattern(
  'svelte5-ondragend-handler',
  'Convert on:dragend to ondragend for Svelte 5 compatibility',
  /on:dragend\s*=\s*\{([^}]+)\}/g,
  'ondragend={$1}',
  {
    priority: 30,
  }
);

/**
 * Pattern to convert on:dragover to ondragover for Svelte 5
 */
export const svelteOnDragoverPattern: PatternMatcher = createPattern(
  'svelte5-ondragover-handler',
  'Convert on:dragover to ondragover for Svelte 5 compatibility',
  /on:dragover\s*=\s*\{([^}]+)\}/g,
  'ondragover={$1}',
  {
    priority: 31,
  }
);

/**
 * Pattern to convert on:drop to ondrop for Svelte 5
 */
export const svelteOnDropPattern: PatternMatcher = createPattern(
  'svelte5-ondrop-handler',
  'Convert on:drop to ondrop for Svelte 5 compatibility',
  /on:drop\s*=\s*\{([^}]+)\}/g,
  'ondrop={$1}',
  {
    priority: 32,
  }
);

/**
 * Pattern to convert on:touchstart to ontouchstart for Svelte 5
 */
export const svelteOnTouchstartPattern: PatternMatcher = createPattern(
  'svelte5-ontouchstart-handler',
  'Convert on:touchstart to ontouchstart for Svelte 5 compatibility',
  /on:touchstart\s*=\s*\{([^}]+)\}/g,
  'ontouchstart={$1}',
  {
    priority: 33,
  }
);

/**
 * Pattern to convert on:touchend to ontouchend for Svelte 5
 */
export const svelteOnTouchendPattern: PatternMatcher = createPattern(
  'svelte5-ontouchend-handler',
  'Convert on:touchend to ontouchend for Svelte 5 compatibility',
  /on:touchend\s*=\s*\{([^}]+)\}/g,
  'ontouchend={$1}',
  {
    priority: 34,
  }
);

/**
 * Pattern to convert on:touchmove to ontouchmove for Svelte 5
 */
export const svelteOnTouchmovePattern: PatternMatcher = createPattern(
  'svelte5-ontouchmove-handler',
  'Convert on:touchmove to ontouchmove for Svelte 5 compatibility',
  /on:touchmove\s*=\s*\{([^}]+)\}/g,
  'ontouchmove={$1}',
  {
    priority: 35,
  }
);

// ============================================================================
// SVELTE 5 PROPS MIGRATION PATTERNS
// ============================================================================

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
  (match: string, propName: string, defaultValue: string): string => {
    // Return a comment indicating manual review needed for complex cases
    return `let { ${propName} = ${defaultValue.trim()} } = $props();`;
  },
  {
    priority: 8,
    // Only apply to .svelte files
    validate: (before: string, after: string): boolean => {
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
 * Pattern to fix export let with type annotation
 * Before: export let value: string = '';
 * After:  let { value = '' }: { value?: string } = $props();
 */
export const exportLetWithTypePattern: PatternMatcher = createPattern(
  'svelte5-export-let-with-type',
  'Convert export let with type annotation to $props() for Svelte 5',
  /export\s+let\s+(\w+)\s*:\s*([^=;]+)\s*=\s*([^;]+);/g,
  (match: string, propName: string, propType: string, defaultValue: string): string => {
    return `let { ${propName} = ${defaultValue.trim()} }: { ${propName}?: ${propType.trim()} } = $props();`;
  },
  {
    priority: 7,
  }
);

/**
 * Pattern to fix export let with type annotation but no default
 * Before: export let value: string;
 * After:  let { value }: {, value: string } = $props();
 */
export const exportLetWithTypeNoDefaultPattern: PatternMatcher = createPattern(
  'svelte5-export-let-type-no-default',
  'Convert export let with type but no default to $props() for Svelte 5',
  /export\s+let\s+(\w+)\s*:\s*([^;]+);/g,
  (match: string, propName: string, propType: string): string => {
    return `let { ${propName} }: { ${propName}: ${propType.trim()} } = $props();`;
  },
  {
    priority: 7,
  }
);

// ============================================================================
// BITS-UI COMPONENT PATTERNS
// ============================================================================

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
    validate: (before: string, after: string): boolean => {
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
    validate: (before: string, after: string): boolean => {
      return !before.includes('Select.Root') || after.includes('Select.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Popover usage for Svelte 5
 */
export const bitsUiPopoverPattern: PatternMatcher = createPattern(
  'bits-ui-popover-pattern',
  'Ensure Bits-UI Popover uses correct Svelte 5 patterns',
  /<Popover\s+([^>]*?)>/g,
  '<Popover.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('Popover.Root') || after.includes('Popover.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Tooltip usage for Svelte 5
 */
export const bitsUiTooltipPattern: PatternMatcher = createPattern(
  'bits-ui-tooltip-pattern',
  'Ensure Bits-UI Tooltip uses correct Svelte 5 patterns',
  /<Tooltip\s+([^>]*?)>/g,
  '<Tooltip.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('Tooltip.Root') || after.includes('Tooltip.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Accordion usage for Svelte 5
 */
export const bitsUiAccordionPattern: PatternMatcher = createPattern(
  'bits-ui-accordion-pattern',
  'Ensure Bits-UI Accordion uses correct Svelte 5 patterns',
  /<Accordion\s+([^>]*?)>/g,
  '<Accordion.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('Accordion.Root') || after.includes('Accordion.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Tabs usage for Svelte 5
 */
export const bitsUiTabsPattern: PatternMatcher = createPattern(
  'bits-ui-tabs-pattern',
  'Ensure Bits-UI Tabs uses correct Svelte 5 patterns',
  /<Tabs\s+([^>]*?)>/g,
  '<Tabs.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('Tabs.Root') || after.includes('Tabs.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI AlertDialog usage for Svelte 5
 */
export const bitsUiAlertDialogPattern: PatternMatcher = createPattern(
  'bits-ui-alert-dialog-pattern',
  'Ensure Bits-UI AlertDialog uses correct Svelte 5 patterns',
  /<AlertDialog\s+([^>]*?)>/g,
  '<AlertDialog.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('AlertDialog.Root') || after.includes('AlertDialog.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI DropdownMenu usage for Svelte 5
 */
export const bitsUiDropdownMenuPattern: PatternMatcher = createPattern(
  'bits-ui-dropdown-menu-pattern',
  'Ensure Bits-UI DropdownMenu uses correct Svelte 5 patterns',
  /<DropdownMenu\s+([^>]*?)>/g,
  '<DropdownMenu.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('DropdownMenu.Root') || after.includes('DropdownMenu.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI ContextMenu usage for Svelte 5
 */
export const bitsUiContextMenuPattern: PatternMatcher = createPattern(
  'bits-ui-context-menu-pattern',
  'Ensure Bits-UI ContextMenu uses correct Svelte 5 patterns',
  /<ContextMenu\s+([^>]*?)>/g,
  '<ContextMenu.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('ContextMenu.Root') || after.includes('ContextMenu.Root');
    },
  }
);

/**
 * Pattern to fix Bits-UI Menubar usage for Svelte 5
 */
export const bitsUiMenubarPattern: PatternMatcher = createPattern(
  'bits-ui-menubar-pattern',
  'Ensure Bits-UI Menubar uses correct Svelte 5 patterns',
  /<Menubar\s+([^>]*?)>/g,
  '<Menubar.Root $1>',
  {
    priority: 7,
    validate: (before: string, after: string): boolean => {
      return !before.includes('Menubar.Root') || after.includes('Menubar.Root');
    },
  }
);

// ============================================================================
// PATTERN AGGREGATION AND APPLICATION
// ============================================================================

/**
 * Get all Bits-UI migration patterns in priority order
 */
export function getBitsUiMigrationPatterns(): PatternMatcher[] {
  return [
    // Import patterns
    bitsUiButtonImportPattern,

    // Bits-UI component patterns
    bitsUiDialogPattern,
    bitsUiSelectPattern,
    bitsUiPopoverPattern,
    bitsUiTooltipPattern,
    bitsUiAccordionPattern,
    bitsUiTabsPattern,
    bitsUiAlertDialogPattern,
    bitsUiDropdownMenuPattern,
    bitsUiContextMenuPattern,
    bitsUiMenubarPattern,

    // Props migration patterns
    exportLetWithTypePattern,
    exportLetWithTypeNoDefaultPattern,
    exportLetToPropsPattern,
    exportLetSimplePattern,

    // Event handler patterns (with modifiers first)
    svelteEventHandlerWithModifiersPattern,
    svelteEventHandlerStopPropPattern,
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
    svelteOnScrollPattern,
    svelteOnResizePattern,
    svelteOnLoadPattern,
    svelteOnErrorPattern,
    svelteOnContextmenuPattern,
    svelteOnDblclickPattern,
    svelteOnDragPattern,
    svelteOnDragstartPattern,
    svelteOnDragendPattern,
    svelteOnDragoverPattern,
    svelteOnDropPattern,
    svelteOnTouchstartPattern,
    svelteOnTouchendPattern,
    svelteOnTouchmovePattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply Bits-UI migration fixes to content
 *
 * This function applies all Bits-UI and Svelte 5 migration patterns to the given content.
 * It handles:
 * - Event handler conversions (on:click -> onclick, etc.)
 * - Props migration (export let -> $props())
 * - Bits-UI component patterns (Button.Root, Dialog.Root, etc.)
 *
 * @param content - The source code content to transform
 * @returns Object containing the transformed result and count of fixes applied
 *
 * @requirements 1.2, 4.3
 */
export function fixBitsUiMigration(content: string): {, result: string; fixCount: number } {
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

/**
 * Apply Bits-UI migration fixes with multiple passes for cascading fixes
 *
 * Some transformations may create new patterns that need to be fixed.
 * This function runs multiple passes until no more fixes are found.
 *
 * @param content - The source code content to transform
 * @param maxPasses - Maximum number of passes to run (default: 3)
 * @returns Object containing the transformed result, total fix count, and number of passes
 *
 * @requirements 1.2, 4.3
 */
export function fixBitsUiMigrationMultiPass(
  content: string,
  maxPasses: number = 3
): {, result: string; fixCount: number;, passes: number } {
  let result = content;
  let totalFixes = 0;
  let passCount = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    passCount++;
    const { result: passResult, fixCount: passFixes } = fixBitsUiMigration(result);

    if (passFixes === 0) {
      break;
    }

    totalFixes += passFixes;
    result = passResult;
  }

  return { result, fixCount: totalFixes, passes: passCount };
}

/**
 * Check if content contains any Svelte 4 patterns that need migration
 *
 * @param content - The source code content to check
 * @returns Object containing boolean flags for each pattern type found
 */
export function detectSvelte4Patterns(content: string): {, hasOldEventHandlers: boolean;
  hasExportLet: boolean;, hasOldBitsUiComponents: boolean;
  patternCounts: Record<string, number>;
} {
  const patternCounts: Record<string, number> = {};

  // Check for old event handlers (on:click, on:change, etc.)
  const eventHandlerPattern = /on:\w+\s*=\s*\{/g;
  const eventMatches = content.match(eventHandlerPattern);
  patternCounts['eventHandlers'] = eventMatches?.length ?? 0;

  // Check for export let
  const exportLetPattern = /export\s+let\s+\w+/g;
  const exportMatches = content.match(exportLetPattern);
  patternCounts['exportLet'] = exportMatches?.length ?? 0;

  // Check for old Bits-UI component patterns (without .Root)
  const bitsUiPattern = /<(Dialog|Select|Popover|Tooltip|Accordion|Tabs|AlertDialog|DropdownMenu|ContextMenu|Menubar)\s+[^>]*>/g;
  const bitsMatches = content.match(bitsUiPattern);
  patternCounts['bitsUiComponents'] = bitsMatches?.length ?? 0;

  return {
    hasOldEventHandlers: patternCounts['eventHandlers'] > 0,
    hasExportLet: patternCounts['exportLet'] > 0,
    hasOldBitsUiComponents: patternCounts['bitsUiComponents'] > 0,
    patternCounts,
  };
}
