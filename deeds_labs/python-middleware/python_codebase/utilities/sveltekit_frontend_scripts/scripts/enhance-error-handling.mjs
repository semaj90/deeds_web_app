#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🛡️ Enhancing Error Handling');
console.log('============================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Add try-catch to API calls without error handling
    const fetchRegex = /(const|let|var)\s+(\w+)\s*=\s*await\s+fetch\([^)]+\)(?!.*catch)/g;
    const originalFetches = content;

    content = content.replace(fetchRegex, (match, declaration, varName) => {
      return `try {
    ${match};
    if (!${varName}.ok) {
      throw new Error(\`HTTP error! status: \${${varName}.status}\`);
    }
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }`;
    });

    if (content !== originalFetches) {
      changes++;
      modified = true;
      console.log(`    ✅ Added error handling to API calls`);
    }

    // 2. Wrap JSON parsing in try-catch
    const jsonParseRegex = /([^.]\w+)\.json\(\)(?!.*catch)/g;
    const originalJsonParse = content;

    content = content.replace(jsonParseRegex, (match, responseVar) => {
      return `await (async () => {
      try {
        return await ${match};
      } catch (error) {
        console.error('JSON parsing failed:', error);
        throw new Error('Invalid JSON response');
      }
    })()`;
    });

    if (content !== originalJsonParse) {
      changes++;
      modified = true;
      console.log(`    ✅ Added error handling to JSON parsing`);
    }

    // 3. Add error boundaries to effects
    const effectRegex = /\$effect\(\(\) => \{([^}]+(?:\{[^}]*\})*[^}]*)\}\);?/g;
    const originalEffects = content;

    content = content.replace(effectRegex, (match, effectBody) => {
      if (!effectBody.includes('try') && !effectBody.includes('catch')) {
        return `$effect(() => {
    try {
${effectBody
  .split('\n')
  .map((line) => '      ' + line)
  .join('\n')}
    } catch (error) {
      console.error('Effect error:', error);
      // Handle error gracefully
    }
  });`;
      }
      return match;
    });

    if (content !== originalEffects) {
      changes++;
      modified = true;
      console.log(`    ✅ Added error boundaries to effects`);
    }

    // 4. Add validation for function parameters
    const functionRegex = /function\s+(\w+)\s*\(([^)]+)\)\s*\{/g;
    const originalFunctions = content;

    content = content.replace(functionRegex, (match, funcName, params) => {
      if (!match.includes('validate') && params.trim()) {
        const paramNames = params.split(',').map((p) => p.trim().split(':')[0].trim());
        const validations = paramNames
          .map((param) => {
            if (param === 'element') {
              return `if (!${param} || !(${param} instanceof HTMLElement)) {
      throw new Error('Invalid element parameter');
    }`;
            } else if (param.includes('id')) {
              return `if (!${param} || typeof ${param} !== 'string') {
      throw new Error('Invalid ${param} parameter');
    }`;
            } else if (param.includes('data') || param.includes('obj')) {
              return `if (!${param} || typeof ${param} !== 'object') {
      throw new Error('Invalid ${param} parameter');
    }`;
            }
            return null;
          })
          .filter(Boolean);

        if (validations.length > 0) {
          return `function ${funcName}(${params}) {
    // Parameter validation
${validations.map((v) => '    ' + v).join('\n')}
`;
        }
      }
      return match;
    });

    if (content !== originalFunctions) {
      changes++;
      modified = true;
      console.log(`    ✅ Added parameter validation to functions`);
    }

    // 5. Add error state management
    if (!content.includes('errorMessage') && content.includes('fetch(')) {
      // Add error state
      const stateRegex = /(let\s+\w+\s*=\s*\$state\([^)]+\);)/;
      const stateMatch = content.match(stateRegex);

      if (stateMatch) {
        content = content.replace(
          stateMatch[0],
          `${stateMatch[0]}\n  let errorMessage = $state('');`
        );

        changes++;
        modified = true;
        console.log(`    ✅ Added error state management`);
      }
    }

    // 6. Add loading state for async operations
    if (!content.includes('isLoading') && content.includes('async function')) {
      const stateRegex = /(let\s+\w+\s*=\s*\$state\([^)]+\);)/;
      const stateMatch = content.match(stateRegex);

      if (stateMatch) {
        content = content.replace(
          stateMatch[0],
          `${stateMatch[0]}\n  let isLoading = $state(false);`
        );

        changes++;
        modified = true;
        console.log(`    ✅ Added loading state`);
      }
    }

    // 7. Add error handling to form submissions
    const formSubmitRegex = /onsubmit=\{([^}]+)\}/g;
    const originalFormSubmits = content;

    content = content.replace(formSubmitRegex, (match, handler) => {
      if (!handler.includes('try') && !handler.includes('catch')) {
        const handlerName = handler.trim();
        return `onsubmit={(event: SubmitEvent) => {
      event.preventDefault();
      try {
        ${handlerName}(event);
      } catch (error) {
        console.error('Form submission error:', error);
        errorMessage = error instanceof Error ? error.message : 'Form submission failed';
      }
    }}`;
      }
      return match;
    });

    if (content !== originalFormSubmits) {
      changes++;
      modified = true;
      console.log(`    ✅ Added error handling to form submissions`);
    }

    // 8. Add Canvas error handling
    if (content.includes('canvas') || content.includes('getContext')) {
      const canvasRegex = /(\w+)\.getContext\(['"]([^'"]+)['"]\)/g;
      const originalCanvas = content;

      content = content.replace(canvasRegex, (match, canvasVar, contextType) => {
        return `(() => {
      const context = ${match};
      if (!context) {
        throw new Error('Could not get ${contextType} context');
      }
      return context;
    })()`;
      });

      if (content !== originalCanvas) {
        changes++;
        modified = true;
        console.log(`    ✅ Added Canvas context error handling`);
      }
    }

    // 9. Add WebGL error handling
    if (content.includes('WebGL') || content.includes('webgl')) {
      const webglRegex = /(gl\.\w+\([^)]*\);)/g;
      const originalWebGL = content;

      content = content.replace(webglRegex, (match) => {
        if (!match.includes('checkError')) {
          return `${match}
    checkWebGLError(gl);`;
        }
        return match;
      });

      if (content !== originalWebGL && content.includes('gl.')) {
        // Add error checking function
        if (!content.includes('function checkWebGLError')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  function checkWebGLError(gl: WebGLRenderingContext) {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(\`WebGL error: \${error}\`);
    }
  }`
          );
        }

        changes++;
        modified = true;
        console.log(`    ✅ Added WebGL error checking`);
      }
    }

    // 10. Add global error boundary component reference
    if (
      content.includes('error') &&
      !content.includes('ErrorBoundary') &&
      (content.includes('throw') || content.includes('catch'))
    ) {
      const errorHandlingComment = `
<!-- Consider wrapping this component in an ErrorBoundary for better error handling -->
<!-- import ErrorBoundary from '$lib/components/ErrorBoundary.svelte'; -->`;

      content = errorHandlingComment + '\n' + content;
      changes++;
      modified = true;
      console.log(`    ✅ Added ErrorBoundary recommendation`);
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(
        `  📝 Enhanced error handling in ${filePath.split(/[/\\]/).pop()} (${changes} improvements)`
      );
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function createErrorHandlingUtilities() {
  const utilsPath = 'src/lib/utils/error-handling.ts';
  const errorUtils = `
/**
 * Error handling utilities for Svelte 5 components
 */

export class ComponentError extends Error {
  constructor(
    message: string,
    public readonly component: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ComponentError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Safe fetch wrapper with error handling
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ data?: T; error?: string; success: boolean }> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new ApiError(
        \`HTTP error! status: \${response.status}\`,
        response.status,
        url
      );
    }

    const data = await response.json();
    return { data, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('API call failed:', error);
    return { error: errorMessage, success: false };
  }
}

// Safe JSON parsing
export function safeJsonParse<T = unknown>(
  json: string,
  fallback?: T
): { data?: T; error?: string; success: boolean } {
  try {
    const data = JSON.parse(json) as T;
    return { data, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'JSON parsing failed';
    console.error('JSON parsing error:', error);
    return {
      data: fallback,
      error: errorMessage,
      success: false
    };
  }
}

// Error boundary hook for Svelte 5
export function createErrorBoundary() {
  let errorMessage = \$state('');
  let hasError = \$state(false);

  function captureError(error: Error, context?: string) {
    console.error(\`Error\${context ? \` in \${context}\` : ''}:\`, error);
    errorMessage = error.message;
    hasError = true;
  }

  function clearError() {
    errorMessage = '';
    hasError = false;
  }

  function withErrorBoundary<T extends (...args: any[]) => any>(
    fn: T,
    context?: string
  ): T {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch(error => {
            captureError(error, context);
            throw error;
          });
        }
        return result;
      } catch (error) {
        captureError(error instanceof Error ? error : new Error(String(error)), context);
        throw error;
      }
    }) as T;
  }

  return {
    get errorMessage() { return errorMessage; },
    get hasError() { return hasError; },
    captureError,
    clearError,
    withErrorBoundary
  };
}

// Validation helpers
export function validateRequired<T>(value: T, fieldName: string): T {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(\`\${fieldName} is required\`, fieldName, value);
  }
  return value;
}

export function validateEmail(email: string): string {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+\$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format', 'email', email);
  }
  return email;
}

export function validateType<T>(
  value: unknown,
  type: string,
  fieldName: string
): T {
  if (typeof value !== type) {
    throw new ValidationError(
      \`\${fieldName} must be of type \${type}\`,
      fieldName,
      value
    );
  }
  return value as T;
}

// Canvas error handling
export function safeGetContext(
  canvas: HTMLCanvasElement,
  contextType: '2d' | 'webgl' | 'webgl2'
): CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext {
  const context = canvas.getContext(contextType);
  if (!context) {
    throw new ComponentError(
      \`Could not get \${contextType} context\`,
      'Canvas',
      { contextType }
    );
  }
  return context;
}

// WebGL error checking
export function checkWebGLError(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    let errorString: string;
    switch (error) {
      case gl.INVALID_ENUM:
        errorString = 'INVALID_ENUM';
        break;
      case gl.INVALID_VALUE:
        errorString = 'INVALID_VALUE';
        break;
      case gl.INVALID_OPERATION:
        errorString = 'INVALID_OPERATION';
        break;
      case gl.OUT_OF_MEMORY:
        errorString = 'OUT_OF_MEMORY';
        break;
      case gl.CONTEXT_LOST_WEBGL:
        errorString = 'CONTEXT_LOST_WEBGL';
        break;
      default:
        errorString = \`Unknown error \${error}\`;
    }
    throw new ComponentError(\`WebGL error: \${errorString}\`, 'WebGL');
  }
}

// Async operation wrapper
export async function withLoading<T>(
  operation: () => Promise<T>,
  loadingState: { value: boolean }
): Promise<T> {
  loadingState.value = true;
  try {
    return await operation();
  } finally {
    loadingState.value = false;
  }
}

// Retry mechanism
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i === maxRetries) {
        throw lastError;
      }

      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }

  throw lastError!;
}
`;

  try {
    writeFileSync(utilsPath, errorUtils, 'utf8');
    console.log(`✅ Created error handling utilities at ${utilsPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create error utilities:`, error.message);
    return false;
  }
}

function walkDirectory(dir, extension = '.svelte') {
  const files = [];

  function walk(currentDir) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(item)) {
          walk(fullPath);
        }
      } else if (stat.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function main() {
  console.log('1️⃣ Finding components that need error handling improvements...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that could benefit from error handling
  const errorHandlingFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('fetch(') ||
        content.includes('async function') ||
        content.includes('$effect(') ||
        content.includes('canvas') ||
        content.includes('WebGL') ||
        content.includes('onsubmit=') ||
        content.includes('.json()') ||
        content.includes('throw')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(
    `Found ${errorHandlingFiles.length} components that could benefit from better error handling\n`
  );

  if (errorHandlingFiles.length === 0) {
    console.log('✨ No error handling improvements needed!');
    return;
  }

  console.log('2️⃣ Creating error handling utilities...\n');
  createErrorHandlingUtilities();

  console.log('3️⃣ Enhancing error handling...\n');

  // Process first 15 files to avoid overwhelming output
  for (const file of errorHandlingFiles.slice(0, 15)) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Error Handling Enhancement Summary');
  console.log('=====================================');
  console.log(`Files enhanced: ${filesFixed}`);
  console.log(`Total error handling improvements: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n🛡️ Error handling enhancements applied!');
    console.log('\nImprovements made:');
    console.log('- Added try-catch to API calls');
    console.log('- Enhanced JSON parsing safety');
    console.log('- Added error boundaries to effects');
    console.log('- Added parameter validation');
    console.log('- Enhanced state management');
    console.log('- Improved form submission handling');
    console.log('- Added Canvas/WebGL error handling');
    console.log('- Created comprehensive error utilities');

    console.log('\n💡 Next steps:');
    console.log('1. Import error utilities from $lib/utils/error-handling');
    console.log('2. Test error scenarios in development');
    console.log('3. Add user-friendly error messages');
    console.log('4. Implement error reporting/monitoring');
  }
}

main();
