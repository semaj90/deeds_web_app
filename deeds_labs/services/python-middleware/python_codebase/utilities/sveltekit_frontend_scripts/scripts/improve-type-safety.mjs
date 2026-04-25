#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🔒 Improving Type Safety');
console.log('========================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Replace unknown with specific API response types
    if (content.includes('fetch(') && content.includes(': unknown')) {
      const apiResponseRegex = /(\w+)\s*:\s*unknown(?=.*fetch|.*response|.*data)/g;
      const originalApiTypes = content;

      content = content.replace(apiResponseRegex, (match, varName) => {
        if (varName.includes('response') || varName.includes('data')) {
          return `${varName}: ApiResponse`;
        } else if (varName.includes('evidence')) {
          return `${varName}: EvidenceItem`;
        } else if (varName.includes('case')) {
          return `${varName}: CaseData`;
        } else if (varName.includes('user')) {
          return `${varName}: UserData`;
        } else if (varName.includes('file') || varName.includes('upload')) {
          return `${varName}: FileData`;
        } else {
          return `${varName}: Record<string, unknown>`;
        }
      });

      if (content !== originalApiTypes) {
        // Add type imports if not present
        if (!content.includes('import type {')) {
          content = content.replace(
            /<script[^>]*>/,
            `<script lang="ts">
  import type { ApiResponse, EvidenceItem, CaseData, UserData, FileData } from '$lib/types';`
          );
        }
        changes++;
        modified = true;
        console.log(`    ✅ Improved API response types`);
      }
    }

    // 2. Add specific event handler types
    const eventHandlerRegex = /(onclick|onchange|oninput|onsubmit)=\{([^}]+)\}/g;
    const originalEventHandlers = content;

    content = content.replace(eventHandlerRegex, (match, eventType, handler) => {
      if (!handler.includes('event:') && !handler.includes('(event')) {
        switch (eventType) {
          case 'onclick':
            return `${eventType}={(event: MouseEvent) => ${handler.replace(/^\(/, '').replace(/\)$/, '')}}`;
          case 'onchange':
          case 'oninput':
            return `${eventType}={(event: Event) => ${handler.replace(/^\(/, '').replace(/\)$/, '')}}`;
          case 'onsubmit':
            return `${eventType}={(event: SubmitEvent) => ${handler.replace(/^\(/, '').replace(/\)$/, '')}}`;
          default:
            return match;
        }
      }
      return match;
    });

    if (content !== originalEventHandlers) {
      changes++;
      modified = true;
      console.log(`    ✅ Added typed event handlers`);
    }

    // 3. Add specific prop types for components
    if (content.includes('$props()') && content.includes(': unknown')) {
      const propsRegex = /let\s*\{\s*([^}]+)\s*\}\s*=\s*\$props\(\);/;
      const propsMatch = content.match(propsRegex);

      if (propsMatch) {
        const props = propsMatch[1];
        const updatedProps = props.replace(/(\w+)\s*:\s*unknown/g, (match, propName) => {
          if (propName.includes('data') || propName.includes('item')) {
            return `${propName}: Record<string, unknown>`;
          } else if (propName.includes('callback') || propName.includes('handler')) {
            return `${propName}: () => void`;
          } else if (propName.includes('id')) {
            return `${propName}: string`;
          } else if (propName.includes('count') || propName.includes('index')) {
            return `${propName}: number`;
          } else if (propName.includes('enabled') || propName.includes('visible')) {
            return `${propName}: boolean`;
          } else {
            return `${propName}: unknown`;
          }
        });

        if (updatedProps !== props) {
          content = content.replace(propsMatch[0], `let { ${updatedProps} } = $props();`);
          changes++;
          modified = true;
          console.log(`    ✅ Improved prop types`);
        }
      }
    }

    // 4. Add interface definitions for common data structures
    if (content.includes('evidence') && !content.includes('interface Evidence')) {
      const needsEvidenceInterface =
        content.includes('evidence.') || content.includes('evidenceData');

      if (needsEvidenceInterface) {
        const interfaceDefinition = `
interface EvidenceItem {
  id: string;
  title: string;
  description?: string;
  type: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface CaseData {
  id: string;
  title: string;
  status: string;
  evidence?: EvidenceItem[];
  createdAt: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface FileData {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

interface UserData {
  id: string;
  name: string;
  email?: string;
  role?: string;
}
`;

        content = content.replace(/<script[^>]*>/, `<script lang="ts">${interfaceDefinition}`);

        changes++;
        modified = true;
        console.log(`    ✅ Added interface definitions`);
      }
    }

    // 5. Replace function parameter types
    const functionRegex = /function\s+(\w+)\s*\(\s*([^)]*unknown[^)]*)\s*\)/g;
    const originalFunctions = content;

    content = content.replace(functionRegex, (match, funcName, params) => {
      const updatedParams = params.replace(/(\w+)\s*:\s*unknown/g, (paramMatch, paramName) => {
        if (paramName.includes('event')) {
          return `${paramName}: Event`;
        } else if (paramName.includes('data')) {
          return `${paramName}: Record<string, unknown>`;
        } else if (paramName.includes('id')) {
          return `${paramName}: string`;
        } else if (paramName.includes('element')) {
          return `${paramName}: HTMLElement`;
        } else {
          return `${paramName}: unknown`;
        }
      });

      return `function ${funcName}(${updatedParams})`;
    });

    if (content !== originalFunctions) {
      changes++;
      modified = true;
      console.log(`    ✅ Improved function parameter types`);
    }

    // 6. Add HTML element types for bind:this
    const bindThisRegex = /bind:this=\{(\w+)\}/g;
    const originalBindThis = content;

    content.replace(bindThisRegex, (match, varName) => {
      if (!content.includes(`let ${varName}:`)) {
        const elementType = determineElementType(content, varName);
        content = content.replace(
          /let\s+(\w+)\s*=\s*\$state\([^)]*\);/,
          `$&\n  let ${varName}: ${elementType} | null = null;`
        );
        changes++;
        modified = true;
      }
      return match;
    });

    if (content !== originalBindThis) {
      console.log(`    ✅ Added HTML element types`);
    }

    // 7. Replace array types
    const arrayTypeRegex = /(\w+)\s*:\s*unknown\[\]/g;
    const originalArrayTypes = content;

    content = content.replace(arrayTypeRegex, (match, varName) => {
      if (varName.includes('evidence')) {
        return `${varName}: EvidenceItem[]`;
      } else if (varName.includes('case')) {
        return `${varName}: CaseData[]`;
      } else if (varName.includes('file')) {
        return `${varName}: FileData[]`;
      } else if (varName.includes('user')) {
        return `${varName}: UserData[]`;
      } else {
        return `${varName}: Record<string, unknown>[]`;
      }
    });

    if (content !== originalArrayTypes) {
      changes++;
      modified = true;
      console.log(`    ✅ Improved array types`);
    }

    // 8. Add Canvas and WebGL types
    if (content.includes('canvas') || content.includes('WebGL')) {
      const canvasRegex = /(\w+)\s*:\s*unknown(?=.*canvas|.*webgl|.*context)/gi;
      const originalCanvasTypes = content;

      content = content.replace(canvasRegex, (match, varName) => {
        if (varName.toLowerCase().includes('canvas')) {
          return `${varName}: HTMLCanvasElement`;
        } else if (
          varName.toLowerCase().includes('context') ||
          varName.toLowerCase().includes('ctx')
        ) {
          return `${varName}: CanvasRenderingContext2D | WebGLRenderingContext`;
        } else if (
          varName.toLowerCase().includes('webgl') ||
          varName.toLowerCase().includes('gl')
        ) {
          return `${varName}: WebGLRenderingContext`;
        } else {
          return match;
        }
      });

      if (content !== originalCanvasTypes) {
        changes++;
        modified = true;
        console.log(`    ✅ Added Canvas/WebGL types`);
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(
        `  📝 Improved type safety in ${filePath.split(/[/\\]/).pop()} (${changes} improvements)`
      );
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function determineElementType(content, varName) {
  if (content.includes('<canvas') && varName.toLowerCase().includes('canvas')) {
    return 'HTMLCanvasElement';
  } else if (content.includes('<input') && varName.toLowerCase().includes('input')) {
    return 'HTMLInputElement';
  } else if (content.includes('<button') && varName.toLowerCase().includes('button')) {
    return 'HTMLButtonElement';
  } else if (content.includes('<div') && varName.toLowerCase().includes('div')) {
    return 'HTMLDivElement';
  } else if (content.includes('<form') && varName.toLowerCase().includes('form')) {
    return 'HTMLFormElement';
  } else {
    return 'HTMLElement';
  }
}

function createTypeDefinitions() {
  const typesPath = 'src/lib/types/component-types.ts';
  const typeDefinitions = `
/**
 * Common component types for better type safety
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  description?: string;
  type: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  chainOfCustody?: ChainOfCustodyEntry[];
  fileData?: FileData;
}

export interface ChainOfCustodyEntry {
  officerId: string;
  officerName: string;
  timestamp: string;
  action: string;
  location: string;
  notes?: string;
}

export interface CaseData {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'closed' | 'pending' | 'archived';
  evidence?: EvidenceItem[];
  createdAt: string;
  updatedAt?: string;
  assignedTo?: UserData[];
  metadata?: Record<string, unknown>;
}

export interface FileData {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  path?: string;
  url?: string;
  checksum?: string;
}

export interface UserData {
  id: string;
  name: string;
  email?: string;
  role?: 'admin' | 'investigator' | 'attorney' | 'analyst';
  permissions?: string[];
  avatar?: string;
}

export interface UploadProgress {
  file: FileData;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface SearchResult<T = unknown> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ComponentProps {
  className?: string;
  style?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
}

export interface EventHandlers {
  onclick?: (event: MouseEvent) => void;
  onchange?: (event: Event) => void;
  oninput?: (event: Event) => void;
  onsubmit?: (event: SubmitEvent) => void;
  onkeydown?: (event: KeyboardEvent) => void;
  onkeyup?: (event: KeyboardEvent) => void;
  onfocus?: (event: FocusEvent) => void;
  onblur?: (event: FocusEvent) => void;
}

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | WebGLRenderingContext;
  width: number;
  height: number;
}

export interface WebGPUContext {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

// Utility types
export type AsyncFunction<T = void> = () => Promise<T>;
export type EventCallback<T = Event> = (event: T) => void;
export type ValidationResult = { valid: boolean; errors: string[] };
export type ComponentState = 'idle' | 'loading' | 'success' | 'error';
`;

  try {
    writeFileSync(typesPath, typeDefinitions, 'utf8');
    console.log(`✅ Created type definitions at ${typesPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create type definitions:`, error.message);
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
  console.log('1️⃣ Finding components with type safety issues...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that have unknown types
  const typeSafetyFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes(': unknown') ||
        content.includes('bind:this=') ||
        content.includes('onclick=') ||
        content.includes('fetch(') ||
        content.includes('canvas') ||
        content.includes('WebGL')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${typeSafetyFiles.length} components that may need type improvements\n`);

  if (typeSafetyFiles.length === 0) {
    console.log('✨ No type safety issues found!');
    return;
  }

  console.log('2️⃣ Creating type definitions...\n');
  createTypeDefinitions();

  console.log('3️⃣ Improving type safety...\n');

  // Process first 25 files to avoid overwhelming output
  for (const file of typeSafetyFiles.slice(0, 25)) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('📊 Type Safety Enhancement Summary');
  console.log('==================================');
  console.log(`Files enhanced: ${filesFixed}`);
  console.log(`Total type improvements: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n🔒 Type safety enhancements applied!');
    console.log('\nImprovements made:');
    console.log('- Replaced unknown with specific API types');
    console.log('- Added typed event handlers');
    console.log('- Improved prop types');
    console.log('- Added interface definitions');
    console.log('- Enhanced function parameter types');
    console.log('- Added HTML element types');
    console.log('- Improved array types');
    console.log('- Added Canvas/WebGL types');
    console.log('- Created comprehensive type definitions');

    console.log('\n💡 Next steps:');
    console.log('1. Import types from $lib/types/component-types');
    console.log('2. Run TypeScript compiler to check for remaining issues');
    console.log('3. Update remaining components gradually');
    console.log('4. Add unit tests for type safety');
  }
}

main();
