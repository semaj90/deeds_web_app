/**
 * Test Setup Configuration for Property-Based Testing
 *
 * This file provides common test utilities and fast-check configuration
 * for the Svelte5 Comprehensive Testing & Remediation spec.
 *
 * @module tests/setup
 */

import * as fc from 'fast-check';
import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Fast-Check Global Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default fast-check configuration for property-based tests
 * Ensures consistent behavior across all property tests
 */
export const defaultFcConfig: fc.Parameters<unknown> = {
  numRuns: 100,           // Minimum 100 iterations as per design spec
  verbose: false,         // Set to true for debugging
  seed: Date.now(),       // Reproducible with timestamp seed
  endOnFailure: true,     // Stop on first failure for faster feedback
  markInterruptAsFailure: true,
  skipAllAfterTimeLimit: 30000, // 30 second timeout for long-running tests
};

/**
 * Extended configuration for more thorough testing
 */
export const thoroughFcConfig: fc.Parameters<unknown> = {
  ...defaultFcConfig,
  numRuns: 500,
  skipAllAfterTimeLimit: 60000, // 60 second timeout
};

/**
 * Quick configuration for development/debugging
 */
export const quickFcConfig: fc.Parameters<unknown> = {
  ...defaultFcConfig,
  numRuns: 25,
  skipAllAfterTimeLimit: 10000,
};

// ═══════════════════════════════════════════════════════════════════════════
// Custom Arbitraries for Legal AI Platform
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Arbitrary for generating valid file paths (Svelte/TypeScript files)
 */
export const arbFilePath = fc.oneof(
  fc.constant('src/lib/components/ui/Button.svelte'),
  fc.constant('src/lib/stores/caseStore.ts'),
  fc.constant('src/routes/+page.svelte'),
  fc.string({ minLength: 5, maxLength: 50, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_/'.split('')) })
    .map(s => `src/${s}.ts`)
);

/**
 * Arbitrary for generating Svelte component names
 */
export const arbComponentName = fc.string({
  minLength: 3,
  maxLength: 30,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''))
}).filter(s => /^[A-Z]/.test(s)); // Must start with uppercase

/**
 * Arbitrary for generating valid CSS class names
 */
export const arbCssClassName = fc.string({
  minLength: 2,
  maxLength: 30,
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split(''))
}).filter(s => /^[a-z]/.test(s)); // Must start with letter

/**
 * Arbitrary for generating error codes (TypeScript/Svelte)
 */
export const arbErrorCode = fc.oneof(
  fc.constantFrom('ts(1005)', 'ts(1128)', 'ts(2304)', 'ts(2339)', 'ts(2345)'),
  fc.constantFrom('svelte(a11y-label-has-associated-control)', 'svelte(missing-declaration)'),
  fc.nat({ max: 9999 }).map(n => `ts(${n})`)
);

/**
 * Arbitrary for generating error categories
 */
export const arbErrorCategory = fc.constantFrom(
  'syntax',
  'type',
  'a11y',
  'import',
  'svelte5'
);

/**
 * Arbitrary for generating error severity
 */
export const arbErrorSeverity = fc.constantFrom('error', 'warning');

/**
 * Arbitrary for generating ErrorEntry objects (as per design.md)
 */
export const arbErrorEntry = fc.record({
  file: arbFilePath,
  line: fc.nat({ max: 1000 }),
  column: fc.nat({ max: 200 }),
  code: arbErrorCode,
  message: fc.string({ minLength: 10, maxLength: 200 }),
  category: arbErrorCategory,
  severity: arbErrorSeverity,
  fixable: fc.boolean(),
  fixPattern: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined })
});

/**
 * Arbitrary for generating route paths
 */
export const arbRoutePath = fc.oneof(
  fc.constant('/'),
  fc.constant('/login'),
  fc.constant('/dashboard'),
  fc.constant('/cases'),
  fc.constant('/evidence'),
  fc.constant('/evidence-library'),
  fc.string({ minLength: 1, maxLength: 30, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-/'.split('')) })
    .map(s => `/${s}`)
);

/**
 * Arbitrary for generating button actions
 */
export const arbButtonAction = fc.constantFrom('navigate', 'modal', 'submit', 'custom');

/**
 * Arbitrary for generating ButtonMapping objects (as per design.md)
 */
export const arbButtonMapping = fc.record({
  selector: fc.string({ minLength: 3, maxLength: 50 }).map(s => `#${s}`),
  action: arbButtonAction,
  target: fc.option(arbRoutePath, { nil: undefined }),
  handler: fc.option(fc.string({ minLength: 5, maxLength: 30 }), { nil: undefined })
});

// ═══════════════════════════════════════════════════════════════════════════
// Bits-UI Related Arbitraries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Arbitrary for generating valid Bits-UI component patterns
 */
export const arbBitsUiComponent = fc.constantFrom(
  'Button.Root',
  'Dialog.Root',
  'Dialog.Trigger',
  'Dialog.Portal',
  'Dialog.Overlay',
  'Dialog.Content',
  'Dialog.Title',
  'Dialog.Description',
  'Dialog.Close',
  'Select.Root',
  'Select.Trigger',
  'Select.Content',
  'Select.Item',
  'Popover.Root',
  'Tooltip.Root'
);

/**
 * Arbitrary for generating Svelte 5 runes patterns
 */
export const arbSvelte5Rune = fc.constantFrom(
  '$state',
  '$derived',
  '$effect',
  '$props',
  '$bindable'
);

/**
 * Arbitrary for generating deprecated Svelte 4 patterns (should NOT appear)
 */
export const arbDeprecatedSvelte4Pattern = fc.constantFrom(
  'export let',
  'on:click',
  'on:change',
  'on:submit',
  'on:input',
  '$$props',
  '$$restProps'
);

// ═══════════════════════════════════════════════════════════════════════════
// Test Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to run a property test with default configuration
 */
export function runProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  config: fc.Parameters<[T]> = defaultFcConfig as fc.Parameters<[T]>
): void {
  fc.assert(fc.property(arbitrary, predicate), config);
}

/**
 * Helper to run an async property test
 */
export async function runAsyncProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  config: fc.Parameters<[T]> = defaultFcConfig as fc.Parameters<[T]>
): Promise<void> {
  await fc.assert(fc.asyncProperty(arbitrary, predicate), config);
}

/**
 * Creates a property test annotation for requirement traceability
 * Use this in test descriptions to link to requirements
 */
export function validatesRequirement(requirementId: string): string {
  return `**Validates: Requirements ${requirementId}**`;
}

/**
 * Helper to check if a string contains Svelte 5 runes syntax
 */
export function containsSvelte5Runes(content: string): boolean {
  const runesPatterns = [
    /\$state\s*[<(]/,
    /\$derived\s*[<(]/,
    /\$effect\s*\(/,
    /\$props\s*\(/,
    /\$bindable\s*\(/
  ];
  return runesPatterns.some(pattern => pattern.test(content));
}

/**
 * Helper to check if a string contains deprecated Svelte 4 patterns
 */
export function containsDeprecatedSvelte4(content: string): boolean {
  const deprecatedPatterns = [
    /export\s+let\s+\w+/,
    /on:click\s*=/,
    /on:change\s*=/,
    /on:submit\s*=/,
    /\$\$props/,
    /\$\$restProps/
  ];
  return deprecatedPatterns.some(pattern => pattern.test(content));
}

/**
 * Helper to check if a string contains Bits-UI Root patterns
 */
export function containsBitsUiRootPattern(content: string): boolean {
  const bitsUiPatterns = [
    /Button\.Root/,
    /Dialog\.Root/,
    /Select\.Root/,
    /Popover\.Root/,
    /Tooltip\.Root/
  ];
  return bitsUiPatterns.some(pattern => pattern.test(content));
}

/**
 * Helper to check for colon-chain corruption patterns
 */
export function containsColonChainCorruption(content: string): boolean {
  // Matches patterns like "key: value, key: value" which indicate corruption
  const corruptionPattern = /\w+:\s*\w+:\s*\w+:\s*\w+/;
  return corruptionPattern.test(content);
}

/**
 * Helper to check for proper label accessibility
 * @param labelHtml - The HTML string containing the label element
 * @param _formControlId - Optional form control ID (reserved for future use)
 */
export function hasProperLabelAssociation(labelHtml: string, _formControlId?: string): boolean {
  // Check if label has 'for' attribute or wraps the control
  const hasForAttribute = /for\s*=\s*["'][^"']+["']/.test(labelHtml);
  const wrapsControl = /<label[^>]*>.*<(input|select|textarea)/s.test(labelHtml);
  return hasForAttribute || wrapsControl;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mock Utilities for Svelte Components
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock for SvelteKit's goto function
 */
export const mockGoto = vi.fn();

/**
 * Mock for SvelteKit's invalidate function
 */
export const mockInvalidate = vi.fn();

/**
 * Mock for fetch API with configurable responses
 */
export function createMockFetch(responses: Record<string, unknown> = {}) {
  return vi.fn((url: string) => {
    const response = responses[url] || { ok: true, data: {} };
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Global Test Lifecycle Hooks
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  // Set up global test environment
  console.log('🧪 Property-based testing environment initialized');
  console.log(`   Fast-check version: ${fc.__version}`);
  console.log(`   Default numRuns: ${defaultFcConfig.numRuns}`);
});

afterAll(() => {
  // Clean up global test environment
  console.log('🧪 Property-based testing environment cleaned up');
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Export all utilities
// ═══════════════════════════════════════════════════════════════════════════

export { fc };
