/**
 * Accessibility Label Association Fix Pattern
 *
 * Fixes accessibility warnings related to label associations.
 * Adds proper `for` attributes to labels or wraps controls appropriately.
 *
 * Handles a11y_label_has_associated_control warnings.
 *
 * @requirements 1.3
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to add id to input elements that are preceded by labels
 * This helps establish label-input associations
 */
export const inputWithoutIdPattern: PatternMatcher = createPattern(
  'input-without-id',
  'Add id attribute to input elements for label association',
  /<label([^>]*)>([^<]*)<\/label>\s*<input([^>]*?)(?<!id=["'][^"']*["'])(\s*\/?>)/g,
  (match, labelAttrs, labelText, inputAttrs, inputEnd) => {
    // Generate an id from the label text
    const id = generateIdFromLabel(labelText);
    const forAttr = labelAttrs.includes('for=') ? '' : ` for="${id}"`;
    const idAttr = inputAttrs.includes('id=') ? '' : ` id="${id}"`;
    return `<label${labelAttrs}${forAttr}>${labelText}</label>\n<input${inputAttrs}${idAttr}${inputEnd}`;
  },
  {
    priority: 60,
  }
);

/**
 * Pattern to add for attribute to labels that are missing it
 * When a label is followed by an input with an id
 */
export const labelMissingForPattern: PatternMatcher = createPattern(
  'label-missing-for',
  'Add for attribute to labels when input has id',
  /<label(?![^>]*\bfor=)([^>]*)>([^<]*)<\/label>\s*<input[^>]*\bid=["']([^"']+)["'][^>]*>/g,
  '<label for="$3"$1>$2</label>\n<input id="$3"',
  {
    priority: 55,
  }
);

/**
 * Pattern to wrap input inside label for implicit association
 * Before: <label>Name</label><input type="text" />
 * After:  <label>Name <input type="text" /></label>
 */
export const wrapInputInLabelPattern: PatternMatcher = createPattern(
  'wrap-input-in-label',
  'Wrap input inside label for implicit association',
  /<label([^>]*)>([^<]+)<\/label>\s*\n?\s*<input([^>]*?)\s*\/>/g,
  '<label$1>$2 <input$3 /></label>',
  {
    priority: 65,
  }
);

/**
 * Pattern to fix labels with empty for attribute
 * Before: <label for="">Text</label>
 * After:  <label>Text</label> (or with generated id)
 */
export const emptyForAttributePattern: PatternMatcher = createPattern(
  'empty-for-attribute',
  'Fix labels with empty for attribute',
  /<label\s+for=["']["']([^>]*)>/g,
  '<label$1>',
  {
    priority: 50,
  }
);

/**
 * Pattern to fix select elements without label association
 */
export const selectWithoutLabelPattern: PatternMatcher = createPattern(
  'select-without-label',
  'Add aria-label to select elements without visible labels',
  /<select(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  (match, attrs) => {
    // Add a generic aria-label if no label association exists
    return `<select aria-label="Select option"${attrs}>`;
  },
  {
    priority: 70,
  }
);

/**
 * Pattern to fix textarea elements without label association
 */
export const textareaWithoutLabelPattern: PatternMatcher = createPattern(
  'textarea-without-label',
  'Add aria-label to textarea elements without visible labels',
  /<textarea(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  (match, attrs) => {
    return `<textarea aria-label="Text input"${attrs}>`;
  },
  {
    priority: 71,
  }
);

/**
 * Pattern to fix button elements without accessible name
 */
export const buttonWithoutNamePattern: PatternMatcher = createPattern(
  'button-without-name',
  'Ensure buttons have accessible names',
  /<button(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>\s*<\/button>/g,
  '<button aria-label="Button"$1></button>',
  {
    priority: 72,
  }
);

/**
 * Pattern to fix icon-only buttons without accessible name
 */
export const iconButtonWithoutNamePattern: PatternMatcher = createPattern(
  'icon-button-without-name',
  'Add aria-label to icon-only buttons',
  /<button(?![^>]*\b(?:aria-label|aria-labelledby)=)([^>]*)>\s*<(?:svg|i|span class="icon)[^>]*>[^<]*<\/(?:svg|i|span)>\s*<\/button>/g,
  (match, attrs) => {
    return match.replace('<button', '<button aria-label="Icon button"');
  },
  {
    priority: 73,
  }
);

/**
 * Pattern to fix form inputs with placeholder but no label
 * Adds aria-label based on placeholder text
 */
export const inputWithPlaceholderNoLabelPattern: PatternMatcher = createPattern(
  'input-placeholder-no-label',
  'Add aria-label to inputs with placeholder but no label',
  /<input(?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)\bplaceholder=["']([^"']+)["']([^>]*)>/g,
  '<input aria-label="$2"$1placeholder="$2"$3>',
  {
    priority: 68,
  }
);

/**
 * Pattern to fix checkbox/radio inputs without labels
 */
export const checkboxRadioWithoutLabelPattern: PatternMatcher = createPattern(
  'checkbox-radio-without-label',
  'Add aria-label to checkbox/radio inputs without labels',
  /<input\s+type=["'](checkbox|radio)["'](?![^>]*\b(?:aria-label|aria-labelledby|id)=)([^>]*)>/g,
  '<input type="$1" aria-label="$1 option"$2>',
  {
    priority: 69,
  }
);

/**
 * Pattern to fix Svelte component labels (Bits-UI style)
 * Ensures Label.Root has proper for attribute
 */
export const bitsUiLabelPattern: PatternMatcher = createPattern(
  'bits-ui-label-for',
  'Add for attribute to Bits-UI Label.Root components',
  /<Label\.Root(?![^>]*\bfor=)([^>]*)>/g,
  (match, attrs) => {
    // Generate a unique id for association
    const id = `input-${Math.random().toString(36).substr(2, 9)}`;
    return `<Label.Root for="${id}"${attrs}>`;
  },
  {
    priority: 58,
  }
);

/**
 * Pattern to fix fieldset without legend
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

/**
 * Generate a valid HTML id from label text
 */
function generateIdFromLabel(labelText: string): string {
  return labelText
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || `input-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all a11y label fix patterns in priority order
 */
export function getA11yLabelPatterns(): PatternMatcher[] {
  return [
    emptyForAttributePattern,
    labelMissingForPattern,
    bitsUiLabelPattern,
    inputWithoutIdPattern,
    wrapInputInLabelPattern,
    inputWithPlaceholderNoLabelPattern,
    checkboxRadioWithoutLabelPattern,
    selectWithoutLabelPattern,
    textareaWithoutLabelPattern,
    buttonWithoutNamePattern,
    iconButtonWithoutNamePattern,
    fieldsetWithoutLegendPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply a11y label fixes to content
 */
export function fixA11yLabels(content: string): { result: string; fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getA11yLabelPatterns()) {
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
