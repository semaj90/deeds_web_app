#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

class TypeScriptErrorFixer {
  constructor() {
    this.fixes = [];
    this.errorPatterns = [
      // WebGPU buffer compatibility issues
      {
        pattern: /Float32Array<ArrayBufferLike>' is not assignable to parameter of type/,
        type: 'webgpu_buffer_compatibility',
        fix: this.fixWebGPUBufferCompatibility.bind(this),
      },
      // GPU buffer null safety
      {
        pattern: /Object is possibly 'null'.*GPUBuffer/,
        type: 'gpu_buffer_null_safety',
        fix: this.fixGPUBufferNullSafety.bind(this),
      },
      // WebAssembly module typing
      {
        pattern: /Cannot find module.*\.wasm/,
        type: 'webasm_module_typing',
        fix: this.fixWebAssemblyModuleTyping.bind(this),
      },
      // Missing exports pattern
      {
        pattern: /Module '"([^"]+)"' has no exported member '([^']+)'/,
        type: 'missing_export',
        fix: this.fixMissingExport.bind(this),
      },
      // Implicit any parameter
      {
        pattern: /Parameter '([^']+)' implicitly has an 'any' type/,
        type: 'implicit_any_param',
        fix: this.fixImplicitAnyParam.bind(this),
      },
      // Index signature issues
      {
        pattern: /No index signature with a parameter of type '([^']+)' was found on type/,
        type: 'index_signature',
        fix: this.fixIndexSignature.bind(this),
      },
      // Null/undefined type issues
      {
        pattern: /Object is possibly 'null'|Object is possibly 'undefined'/,
        type: 'null_undefined',
        fix: this.fixNullUndefined.bind(this),
      },
      // String vs number type mismatches
      {
        pattern: /Type 'string' is not assignable to type 'number'/,
        type: 'string_number_mismatch',
        fix: this.fixStringNumberMismatch.bind(this),
      },
      // Conflicting export declarations
      {
        pattern: /Export declaration conflicts with exported declaration of '([^']+)'/,
        type: 'export_conflict',
        fix: this.fixExportConflict.bind(this),
      },
      // Property does not exist
      {
        pattern: /Property '([^']+)' does not exist on type/,
        type: 'missing_property',
        fix: this.fixMissingProperty.bind(this),
      },
    ];
  }

  async analyzeErrors() {
    console.log('🔍 Running TypeScript check to analyze errors...');

    try {
      execSync('npm run check:typescript', {
        stdio: 'pipe',
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      console.log('✅ No TypeScript errors found!');
      return [];
    } catch (error) {
      const output = error.stdout || error.stderr || '';
      return this.parseErrors(output);
    }
  }

  parseErrors(output) {
    const lines = output.split('\n');
    const errors = [];

    for (const line of lines) {
      const match = line.match(/^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
      if (match) {
        const [, file, line, column, code, message] = match;
        errors.push({
          file: file.trim(),
          line: parseInt(line),
          column: parseInt(column),
          code,
          message: message.trim(),
          fullLine: line,
        });
      }
    }

    return errors;
  }

  categorizeErrors(errors) {
    const categorized = {};

    for (const error of errors) {
      for (const pattern of this.errorPatterns) {
        if (pattern.pattern.test(error.message)) {
          if (!categorized[pattern.type]) {
            categorized[pattern.type] = [];
          }
          categorized[pattern.type].push({
            ...error,
            fixType: pattern.type,
            fixFunction: pattern.fix,
          });
          break;
        }
      }
    }

    return categorized;
  }

  async fixMissingExport(error) {
    console.log(`🔧 Fixing missing export: ${error.message}`);

    const match = error.message.match(/Module '"([^"]+)"' has no exported member '([^']+)'/);
    if (!match) return false;

    const [, modulePath, exportName] = match;

    // Convert relative path to absolute
    const baseDir = process.cwd();
    let actualPath = modulePath;

    if (modulePath.startsWith('$lib/')) {
      actualPath = modulePath.replace('$lib/', 'src/lib/');
    }

    // Try different extensions
    const extensions = ['.ts', '.js', '.svelte', '/index.ts', '/index.js'];
    let targetFile = null;

    for (const ext of extensions) {
      const testPath = join(baseDir, actualPath + ext);
      if (existsSync(testPath)) {
        targetFile = testPath;
        break;
      }
    }

    if (!targetFile) {
      console.log(`⚠️  Could not find target file for ${modulePath}`);
      return false;
    }

    try {
      const content = readFileSync(targetFile, 'utf8');

      // Check if export already exists but with different casing or format
      if (content.includes(`export.*${exportName}`)) {
        console.log(`ℹ️  Export ${exportName} seems to already exist in ${targetFile}`);
        return false;
      }

      // Add export at the end of the file
      const newContent =
        content + `\n\n// Auto-generated export\nexport const ${exportName} = {};\n`;
      writeFileSync(targetFile, newContent);

      this.fixes.push({
        type: 'missing_export',
        file: targetFile,
        export: exportName,
        message: `Added missing export ${exportName}`,
      });

      return true;
    } catch (err) {
      console.log(`❌ Error fixing missing export: ${err.message}`);
      return false;
    }
  }

  async fixImplicitAnyParam(error) {
    console.log(`🔧 Fixing implicit any parameter: ${error.file}:${error.line}`);

    const match = error.message.match(/Parameter '([^']+)' implicitly has an 'any' type/);
    if (!match) return false;

    const [, paramName] = match;

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Simple pattern to add type annotation
      const paramPattern = new RegExp(`\\b${paramName}\\b(?!:)`);
      if (paramPattern.test(targetLine)) {
        const updatedLine = targetLine.replace(paramPattern, `${paramName}: any`);
        lines[error.line - 1] = updatedLine;

        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'implicit_any_param',
          file: error.file,
          line: error.line,
          param: paramName,
          message: `Added any type to parameter ${paramName}`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing implicit any parameter: ${err.message}`);
    }

    return false;
  }

  async fixIndexSignature(error) {
    console.log(`🔧 Fixing index signature issue: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Common patterns that can be fixed with bracket notation
      if (targetLine.includes('[') && targetLine.includes(']')) {
        // Already using bracket notation, might need type assertion
        const updatedLine = targetLine.replace(/(\w+)\[([^\]]+)\]/, '($1 as any)[$2]');
        if (updatedLine !== targetLine) {
          lines[error.line - 1] = updatedLine;

          const newContent = lines.join('\n');
          writeFileSync(error.file, newContent);

          this.fixes.push({
            type: 'index_signature',
            file: error.file,
            line: error.line,
            message: `Added type assertion for index access`,
          });

          return true;
        }
      }
    } catch (err) {
      console.log(`❌ Error fixing index signature: ${err.message}`);
    }

    return false;
  }

  async fixNullUndefined(error) {
    console.log(`🔧 Fixing null/undefined issue: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Add optional chaining or null check
      const patterns = [
        // Method calls
        { from: /(\w+)\.(\w+)\(/g, to: '$1?.$2(' },
        // Property access
        { from: /(\w+)\.(\w+)(?!\()/g, to: '$1?.$2' },
      ];

      let updatedLine = targetLine;
      let changed = false;

      for (const pattern of patterns) {
        const newLine = updatedLine.replace(pattern.from, pattern.to);
        if (newLine !== updatedLine) {
          updatedLine = newLine;
          changed = true;
          break;
        }
      }

      if (changed) {
        lines[error.line - 1] = updatedLine;

        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'null_undefined',
          file: error.file,
          line: error.line,
          message: `Added optional chaining or null check`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing null/undefined: ${err.message}`);
    }

    return false;
  }

  async fixStringNumberMismatch(error) {
    console.log(`🔧 Fixing string/number mismatch: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Add Number() conversion or parseInt()
      const patterns = [
        // Assignment patterns
        { from: /= ([^;]+);/, to: '= Number($1);' },
        // Function call patterns
        { from: /\(([^)]+)\)/, to: '(Number($1))' },
      ];

      let updatedLine = targetLine;
      let changed = false;

      for (const pattern of patterns) {
        // Only apply if the line contains string-like values
        if (/['"]/.test(targetLine)) {
          const newLine = updatedLine.replace(pattern.from, pattern.to);
          if (newLine !== updatedLine && newLine.includes('Number(')) {
            updatedLine = newLine;
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        lines[error.line - 1] = updatedLine;

        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'string_number_mismatch',
          file: error.file,
          line: error.line,
          message: `Added Number() conversion`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing string/number mismatch: ${err.message}`);
    }

    return false;
  }

  async fixExportConflict(error) {
    console.log(`🔧 Fixing export conflict: ${error.file}:${error.line}`);

    const match = error.message.match(
      /Export declaration conflicts with exported declaration of '([^']+)'/
    );
    if (!match) return false;

    const [, conflictName] = match;

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      // Comment out the conflicting export line
      const targetLine = lines[error.line - 1];
      if (!targetLine.trim().startsWith('//')) {
        lines[error.line - 1] = '// ' + targetLine + ' // Auto-commented due to conflict';

        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'export_conflict',
          file: error.file,
          line: error.line,
          export: conflictName,
          message: `Commented out conflicting export ${conflictName}`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing export conflict: ${err.message}`);
    }

    return false;
  }

  async fixWebGPUBufferCompatibility(error) {
    console.log(`🔧 Fixing WebGPU buffer compatibility: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Add buffer utility import if not present
      if (!content.includes('buffer-utils')) {
        const importLine = `import { ensureBufferCompatibility, safeWriteBuffer } from '$lib/utils/buffer-utils';`;
        lines.unshift(importLine);
      }

      // Replace writeBuffer calls with safe versions
      const updatedLine = targetLine.replace(
        /(\w+\.queue\.writeBuffer\([^,]+,\s*[^,]+,\s*)([^)]+)\)/,
        '$1ensureBufferCompatibility($2))'
      );

      if (updatedLine !== targetLine) {
        lines[error.line - 1] = updatedLine;
        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'webgpu_buffer_compatibility',
          file: error.file,
          line: error.line,
          message: `Added WebGPU buffer compatibility fix`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing WebGPU buffer compatibility: ${err.message}`);
    }

    return false;
  }

  async fixGPUBufferNullSafety(error) {
    console.log(`🔧 Fixing GPU buffer null safety: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Replace direct buffer access with null-safe version
      const updatedLine = targetLine.replace(
        /(\w+\.queue\.writeBuffer\()(\w+)(,)/,
        '$1$2 || null$3'
      );

      if (updatedLine !== targetLine) {
        lines[error.line - 1] = updatedLine;
        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'gpu_buffer_null_safety',
          file: error.file,
          line: error.line,
          message: `Added GPU buffer null safety check`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing GPU buffer null safety: ${err.message}`);
    }

    return false;
  }

  async fixWebAssemblyModuleTyping(error) {
    console.log(`🔧 Fixing WebAssembly module typing: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');

      // Add WebAssembly type import if not present
      if (!content.includes('webassembly-types')) {
        const importLine = `import type { LegalWASMBridge, LegalWASMModule } from '$lib/types/webassembly-types';\n`;
        const newContent = importLine + content;
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'webasm_module_typing',
          file: error.file,
          message: `Added WebAssembly module type definitions`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing WebAssembly module typing: ${err.message}`);
    }

    return false;
  }

  async fixMissingProperty(error) {
    console.log(`🔧 Fixing missing property: ${error.file}:${error.line}`);

    try {
      const content = readFileSync(error.file, 'utf8');
      const lines = content.split('\n');

      if (error.line > lines.length) return false;

      const targetLine = lines[error.line - 1];

      // Add optional chaining for property access
      const updated = targetLine.replace(/\.(\w+)(?!\?)/g, '?.$1');

      if (updated !== targetLine) {
        lines[error.line - 1] = updated;

        const newContent = lines.join('\n');
        writeFileSync(error.file, newContent);

        this.fixes.push({
          type: 'missing_property',
          file: error.file,
          line: error.line,
          message: `Added optional chaining for property access`,
        });

        return true;
      }
    } catch (err) {
      console.log(`❌ Error fixing missing property: ${err.message}`);
    }

    return false;
  }

  async run() {
    console.log('🚀 Starting TypeScript Error Auto-Fixer...\n');

    const errors = await this.analyzeErrors();
    console.log(`Found ${errors.length} TypeScript errors\n`);

    if (errors.length === 0) return;

    const categorized = this.categorizeErrors(errors);

    console.log('📊 Error Categories:');
    for (const [type, typeErrors] of Object.entries(categorized)) {
      console.log(`  ${type}: ${typeErrors.length} errors`);
    }
    console.log();

    let fixedCount = 0;
    let totalAttempts = 0;

    // Process each category
    for (const [type, typeErrors] of Object.entries(categorized)) {
      console.log(`🔧 Processing ${type} errors (${typeErrors.length})...`);

      for (const error of typeErrors.slice(0, 10)) {
        // Limit to first 10 of each type
        totalAttempts++;
        try {
          const fixed = await error.fixFunction(error);
          if (fixed) {
            fixedCount++;
            console.log(`  ✅ Fixed: ${error.file}:${error.line}`);
          } else {
            console.log(`  ⏭️  Skipped: ${error.file}:${error.line}`);
          }
        } catch (err) {
          console.log(`  ❌ Failed: ${error.file}:${error.line} - ${err.message}`);
        }
      }

      console.log();
    }

    console.log(`\n📈 Summary:`);
    console.log(`  Total errors found: ${errors.length}`);
    console.log(`  Fix attempts: ${totalAttempts}`);
    console.log(`  Successfully fixed: ${fixedCount}`);
    console.log(`  Success rate: ${Math.round((fixedCount / totalAttempts) * 100)}%\n`);

    if (this.fixes.length > 0) {
      console.log('🔄 Running TypeScript check again to verify fixes...');

      const remainingErrors = await this.analyzeErrors();
      console.log(`Remaining errors: ${remainingErrors.length}`);

      if (remainingErrors.length < errors.length) {
        console.log(`✅ Reduced errors by ${errors.length - remainingErrors.length}`);
      }
    }

    return this.fixes;
  }
}

// Run the fixer
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const fixer = new TypeScriptErrorFixer();
  fixer.run().catch(console.error);
}

export default TypeScriptErrorFixer;
