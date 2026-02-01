/**
 * Accessibility Label Association Fix Pattern
 *
 * Fixes accessibility warnings related to label associations.
 * Adds proper `for` attributes to labels or wraps controls appropriately.
 *
 * Handles a11y_label_has_associated_control warnings.
 *
 * Patterns fixed:
 * 1. `<label>Text</label><input>` → `<label for="id">Text</label><input id="id">`
 * 2. `<label>Text<input></label>` (wrapping is valid, no change needed)
 * 3. Labels without associated controls need `for` attribute added
 *
 * @requirements 1.3
 */

import { createPattern } from '../pattern-matcher';
import type { PatternMatcher } from '../pattern-matcher';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a valid HTML id from label text
 */
function generateIdFromLabel(labelText: string): string {
  const cleaned = labelText
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || `input-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate a unique id for form controls
 */
function generateUniqueId(prefix: string = 'input'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// LABEL-INPUT ASSOCIATION PATTERNS (Primary a11y fixes)
// ============================================================================

/**
 * Pattern to fix labels followed by inputs without association
 * Before: <label>Name</label><input type="text" />
 * After:  <label for="name">Name</label><input id="name" type="text" />
 *
 * This is the primary pattern for a11y_label_has_associated_control warnings
 */
export const labelFollowedByInputPattern: PatternMatcher = createPattern(
  'label-followed-by-input',
  'Add for/id association when label is followed by input',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]+)<\/label>\s*\n?\s*<input(?![^>]*\bid=)([^>]*)>/g,
  (
    _match: string,
    labelAttrs: string,
    labelText: string,
    inputAttrs: string
  ): string => {
    const id = generateIdFromLabel(labelText);
    return `<label for="${id}"${labelAttrs}>${labelText}</label>\n<input id="${id}"${inputAttrs}>`;
  },
	{
    priority: 50,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.html'),
  }
);

/**
 * Pattern to fix labels followed by inputs with self-closing tag
 * Before: <label>Name</label><input type="text" />
 * After:  <label for="name">Name</label><input id="name" type="text" />
 */
export const labelFollowedBySelfClosingInputPattern: PatternMatcher = createPattern(
  'label-followed-by-self-closing-input',
  'Add for/id association when label is followed by self-closing input',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]+)<\/label>\s*\n?\s*<input(?![^>]*\bid=)([^>]*)\s*\/>/g,
  (
    _match: string,
    labelAttrs: string,
    labelText: string,
    inputAttrs: string
  ): string => {
    const id = generateIdFromLabel(labelText);
    return `<label for="${id}"${labelAttrs}>${labelText}</label>\n<input id="${id}"${inputAttrs} />`;
  },
	{
    priority: 51,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.html'),
  }
);

/**
 * Pattern to add for attribute to labels when input already has id
 * Before: <label>Name</label><input id="name-input" type="text" />
 * After:  <label for="name-input">Name</label><input id="name-input" type="text" />
 */
export const labelMissingForWithIdPattern: PatternMatcher = createPattern(
  'label-missing-for-with-id',
  'Add for attribute to labels when input has id',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]+)<\/label>\s*\n?\s*<input([^>]*)\bid=["']([^"']+)["']([^>]*)>/g,
  '<label for="$4"$1>$2</label>\n<input$3id="$4"$5>',
  {
    priority: 52,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.html'),
  }
);

// ============================================================================
// LABEL-SELECT ASSOCIATION PATTERNS
// ============================================================================

/**
 * Pattern to fix labels followed by select without association
 * Before: <label>Country</label><select>...</select>
 * After:  <label for="country">Country</label><select id="country">...</select>
 */
export const labelFollowedBySelectPattern: PatternMatcher = createPattern(
  'label-followed-by-select',
  'Add for/id association when label is followed by select',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]+)<\/label>\s*\n?\s*<select(?![^>]*\bid=)([^>]*)>/g,
  (
    _match: string,
    labelAttrs: string,
    labelText: string,
    selectAttrs: string
  ): string => {
    const id = generateIdFromLabel(labelText);
    return `<label for="${id}"${labelAttrs}>${labelText}</label>\n<select id="${id}"${selectAttrs}>`;
  },
	{
    priority: 53,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.html'),
  }
);

// ============================================================================
// LABEL-TEXTAREA ASSOCIATION PATTERNS
// ============================================================================

/**
 * Pattern to fix labels followed by textarea without association
 * Before: <label>Description</label><textarea></textarea>
 * After:  <label for="description">Description</label><textarea id="description"></textarea>
 */
export const labelFollowedByTextareaPattern: PatternMatcher = createPattern(
  'label-followed-by-textarea',
  'Add for/id association when label is followed by textarea',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]+)<\/label>\s*\n?\s*<textarea(?![^>]*\bid=)([^>]*)>/g,
  (
    _match: string,
    labelAttrs: string,
    labelText: string,
    textareaAttrs: string
  ): string => {
    const id = generateIdFromLabel(labelText);
    return `<label for="${id}"${labelAttrs}>${labelText}</label>\n<textarea id="${id}"${textareaAttrs}>`;
  },
	{
    priority: 54,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.html'),
  }
);

// ============================================================================
// EMPTY/INVALID FOR ATTRIBUTE PATTERNS
// ============================================================================

/**
 * Pattern to fix labels with empty for attribute
 * Before: <label for="">Text</label>
 * After:  <label>Text</label>
 */
export const emptyForAttributePattern: PatternMatcher = createPattern(
  'empty-for-attribute',
  'Remove empty for attribute from labels',
  /<label\s+for=["']["']([^>]*)>/g,
  '<label$1>',
  {
    priority: 45,
  }
);

/**
 * Pattern to fix labels with whitespace-only for attribute
 * Before: <label for="  ">Text</label>
 * After:  <label>Text</label>
 */
export const whitespaceForAttributePattern: PatternMatcher = createPattern(
  'whitespace-for-attribute',
  'Remove whitespace-only for attribute from labels',
  /<label\s+for=["']\s+["']([^>]*)>/g,
  '<label$1>',
  {
    priority: 46,
  }
);

// ============================================================================
// ARIA-LABEL FALLBACK PATTERNS (for controls without visible labels)
// ============================================================================

/**
 * Pattern to add aria-label to select elements without visible labels
 */
export const selectWithoutLabelPattern: PatternMatcher = createPattern(
  'select-without-label',
  'Add aria-label to select elements without visible labels',
  /<select(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  (_match: string, attrs: string): string => {
    return `<select aria-label="Select option"${attrs}>`;
  },
	{
    priority: 70,
  }
);

/**
 * Pattern to add aria-label to textarea elements without visible labels
 */
export const textareaWithoutLabelPattern: PatternMatcher = createPattern(
  'textarea-without-label',
  'Add aria-label to textarea elements without visible labels',
  /<textarea(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  (_match: string, attrs: string): string => {
    return `<textarea aria-label="Text input"${attrs}>`;
  },
	{
    priority: 71,
  }
);

/**
 * Pattern to add aria-label to inputs with placeholder but no label
 */
export const inputWithPlaceholderNoLabelPattern: PatternMatcher = createPattern(
  'input-placeholder-no-label',
  'Add aria-label to inputs with placeholder but no label',
  /<input(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)\bplaceholder=["']([^"']+)["']([^>]*)>/g,
  '<input aria-label="$2"$1placeholder="$2"$3>',
  {
    priority: 68,
  }
);

// ============================================================================
// BUTTON ACCESSIBILITY PATTERNS
// ============================================================================

/**
 * Pattern to add aria-label to empty buttons
 */
export const emptyButtonPattern: PatternMatcher = createPattern(
  'empty-button',
  'Add aria-label to empty buttons',
  /<button(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>\s*<\/button>/g,
  '<button aria-label="Button"$1></button>',
  {
    priority: 72,
  }
);

/**
 * Pattern to add aria-label to icon-only buttons (SVG icons)
 */
export const iconButtonSvgPattern: PatternMatcher = createPattern(
  'icon-button-svg',
  'Add aria-label to icon-only buttons with SVG',
  /<button(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>\s*<svg[^>]*>[\s\S]*?<\/svg>\s*<\/button>/g,
  (_match: string, attrs: string): string => {
    return _match.replace('<button', '<button aria-label="Icon button"');
  },
	{
    priority: 73,
  }
);

/**
 * Pattern to add aria-label to icon-only buttons (icon class)
 */
export const iconButtonClassPattern: PatternMatcher = createPattern(
  'icon-button-class',
  'Add aria-label to icon-only buttons with icon class',
  /<button(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>\s*<(?:i|span)\s+class="[^"]*icon[^"]*"[^>]*>[^<]*<\/(?:i|span)>\s*<\/button>/g,
  (_match: string, attrs: string): string => {
    return _match.replace('<button', '<button aria-label="Icon button"');
  },
	{
    priority: 74,
  }
);

// ============================================================================
// CHECKBOX/RADIO ACCESSIBILITY PATTERNS
// ============================================================================

/**
 * Pattern to add aria-label to checkbox inputs without labels
 */
export const checkboxWithoutLabelPattern: PatternMatcher = createPattern(
  'checkbox-without-label',
  'Add aria-label to checkbox inputs without labels',
  /<input\s+type=["']checkbox["'](?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  '<input type="checkbox" aria-label="Checkbox option"$1>',
  {
    priority: 69,
  }
);

/**
 * Pattern to add aria-label to radio inputs without labels
 */
export const radioWithoutLabelPattern: PatternMatcher = createPattern(
  'radio-without-label',
  'Add aria-label to radio inputs without labels',
  /<input\s+type=["']radio["'](?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  '<input type="radio" aria-label="Radio option"$1>',
  {
    priority: 69,
  }
);

// ============================================================================
// BITS-UI SPECIFIC PATTERNS
// ============================================================================

/**
 * Pattern to add for attribute to Bits-UI Label.Root components
 */
export const bitsUiLabelPattern: PatternMatcher = createPattern(
  'bits-ui-label-for',
  'Add for attribute to Bits-UI Label.Root components',
  /<Label\.Root(?![^>]*\bfor=)([^>]*)>/g,
  (_match: string, attrs: string): string => {
    const id = generateUniqueId('bits-input');
    return `<Label.Root for="${id}"${attrs}>`;
  },
	{
    priority: 58,
    fileFilter: (path: string) => path.endsWith('.svelte'),
  }
);

// ============================================================================
// FIELDSET/LEGEND PATTERNS
// ============================================================================

/**
 * Pattern to add aria-label to fieldset without legend
 */
export const fieldsetWithoutLegendPattern: PatternMatcher = createPattern(
  'fieldset-without-legend',
  'Add aria-label to fieldset without legend',
  /<fieldset(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>(?!\s*<legend)/g,
  '<fieldset aria-label="Form group"$1>',
  {
    priority: 75,
  }
);

// ============================================================================
// SVELTE-SPECIFIC PATTERNS
// ============================================================================

/**
 * Pattern to fix Svelte bind:value inputs without labels
 * Before: <input, bind:value={name} />
 * After: <input, bind:value={name} aria-label="Input field" />
 */
export const svelteBindInputPattern: PatternMatcher = createPattern(
  'svelte-bind-input',
  'Add aria-label to Svelte bind:value inputs without labels',
  /<input(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)\bbind:value=\{([^}]+)\}([^>]*)>/g,
  (_match: string, before: string, bindVar: string, after: string): string => {
    // Use the bind variable name as the aria-label
    const label = bindVar.replace(/[A-Z]/g, ' $&').trim().toLowerCase();
    return `<input aria-label="${label}"${before}bind:value={${bindVar}}${after}>`;
  },
	{
    priority: 67,
    fileFilter: (path: string) => path.endsWith('.svelte'),
  }
);

// ============================================================================
// PATTERN AGGREGATION
// ============================================================================

/**
 * Get all a11y label fix patterns in priority order
 */
export function getA11yLabelPatterns(): PatternMatcher[] {
  return [
    // Empty/invalid for attribute fixes (highest priority)
    emptyForAttributePattern,
    whitespaceForAttributePattern,
    // Label-control association patterns (primary a11y fixes)
    labelFollowedByInputPattern,
    labelFollowedBySelfClosingInputPattern,
    labelMissingForWithIdPattern,
    labelFollowedBySelectPattern,
    labelFollowedByTextareaPattern,
    // Bits-UI specific patterns
    bitsUiLabelPattern,
    // Svelte-specific patterns
    svelteBindInputPattern,
    // Aria-label fallback patterns
    inputWithPlaceholderNoLabelPattern,
    checkboxWithoutLabelPattern,
    radioWithoutLabelPattern,
    selectWithoutLabelPattern,
    textareaWithoutLabelPattern,
    // Button accessibility patterns
    emptyButtonPattern,
    iconButtonSvgPattern,
    iconButtonClassPattern,
    // Fieldset patterns
    fieldsetWithoutLegendPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

// ============================================================================
// FIX APPLICATION FUNCTION
// ============================================================================

/**
 * Result of applying a11y label fixes
 */
export interface A11yLabelFixResult {
  /** The transformed content */
  result: string;
  /** Total number of fixes applied */
  fixCount: number;
  /** Breakdown of fixes by pattern name */
  fixesByPattern: Record<string, number>;
}

/**
 * Apply a11y label fixes to content
 *
 * @param content - The source code content to transform
 * @returns Object containing the transformed result and fix count
 *
 * @requirements 1.3
 */
export function fixA11yLabels(content: string): A11yLabelFixResult {
  let result = content;
  let totalFixes = 0;
  const fixesByPattern: Record<string, number> = {};

  for (const pattern of getA11yLabelPatterns()) {
    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;

    const matches = result.match(pattern.pattern);
    if (matches) {
      const matchCount = matches.length;
      totalFixes += matchCount;
      fixesByPattern[pattern.name] = matchCount;

      if (typeof pattern.replacement === 'function') {
        result = result.replace(
          pattern.pattern,
          pattern.replacement as (substring: string, ...args: string[]) => string
        );
      } else {
        result = result.replace(pattern.pattern, pattern.replacement);
      }
    }
  }

  return { result, fixCount: totalFixes, fixesByPattern };
}

// ============================================================================
// DETECTION AND VALIDATION FUNCTIONS
// ============================================================================

/**
 * Detect a11y label issues in content
 *
 * @param content - The source code content to check
 * @returns Object containing detection results
 */
export function detectA11yLabelIssues(content: string): {
	hasIssues: boolean;
  patternMatches: Record<string, number>;
  totalMatches: number;
} {
  const patternMatches: Record<string, number> = {};
  let totalMatches = 0;

  for (const pattern of getA11yLabelPatterns()) {
    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;

    const matches = content.match(pattern.pattern);
    if (matches) {
      patternMatches[pattern.name] = matches.length;
      totalMatches += matches.length;
    }
  }

  return {
    hasIssues: totalMatches > 0,
    patternMatches,
    totalMatches,
  };
}

/**
 * Validate that a label has proper association
 *
 * @param labelHtml - The label HTML to validate
 * @returns True if the label has proper association
 *
 * @requirements 1.3
 */
export function validateLabelAssociation(labelHtml: string): boolean {
  // Check if label has for attribute
  const hasFor = /\bfor=["'][^"']+["']/.test(labelHtml);

  // Check if label wraps a control (implicit association)
  const wrapsControl = /<label[^>]*>[\s\S]*<(?:input|select|textarea)[^>]*>[\s\S]*<\/label>/i.test(
    labelHtml
  );

  return hasFor || wrapsControl;
}

/**
 * Check if content has any a11y label issues
 *
 * @param content - The source code content to validate
 * @returns True if no a11y label issues are found
 *
 * @requirements 1.3
 */
export function validateNoA11yLabelIssues(content: string): boolean {
  const detection = detectA11yLabelIssues(content);
  return !detection.hasIssues;
}
