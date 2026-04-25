#!/usr/bin/env node
/**
 * Phase 79: Safety Gate - Validation Layer
 *
 * Prevents writing non-code content to source files.
 * Validates that AI-generated fixes are actually code before applying them.
 *
 * Features:
 * - Code language detection (TypeScript, JavaScript, Svelte, etc.)
 * - Syntax validation before file write
 * - Detects documentation/explanation bleed (prevents plaintext insertion)
 * - Rollback mechanism for failed writes
 * - Metadata tracking for validation confidence
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CONTENT VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detects if content is primarily code or documentation
 */
export function detectContentType(content) {
  const lines = content.trim().split('\n');
  const codeIndicators = [
    /^(?:import|export|const|let|var|function|class|interface|type|async|await|return|if|for|while|switch|case)/, // Code keywords
    /^[/*]/, // Comments
    /{|}/, // Braces
    /\(.*\)/, // Function calls
    /=>/, // Arrow functions
    /;$/ // Semicolons
  ];

  const docIndicators = [
    /^(The|This|A|An|If|However|Without|More|Therefore|it's|which|is|has)/, // English prose
    /^#/, // Markdown
    /^```/, // Code blocks in markdown
    /^-/, // Bullet points
    /\.\s*$/ // Sentence endings
  ];

  let codeScore = 0;
  let docScore = 0;

  for (const line of lines.slice(0, Math.min(20, lines.length))) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const regex of codeIndicators) {
      if (regex.test(trimmed)) codeScore++;
    }
    for (const regex of docIndicators) {
      if (regex.test(trimmed)) docScore++;
    }
  }

  return {
    type: codeScore > docScore ? 'code' : 'documentation',
    confidence: Math.abs(codeScore - docScore) / Math.max(codeScore, docScore, 1),
    codeScore,
    docScore
  };
}

/**
 * Validates TypeScript/JavaScript syntax
 */
export function validateTypeScriptSyntax(content) {
  const errors = [];

  // Check for unclosed braces, brackets, parentheses
  const braceCount = (content.match(/{/g) || []).length - (content.match(/}/g) || []).length;
  const bracketCount = (content.match(/\[/g) || []).length - (content.match(/]/g) || []).length;
  const parenCount = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;

  if (braceCount !== 0) errors.push(`Unmatched braces: ${braceCount > 0 ? braceCount + ' open' : Math.abs(braceCount) + ' close'}`);
  if (bracketCount !== 0) errors.push(`Unmatched brackets: ${bracketCount > 0 ? bracketCount + ' open' : Math.abs(bracketCount) + ' close'}`);
  if (parenCount !== 0) errors.push(`Unmatched parentheses: ${parenCount > 0 ? parenCount + ' open' : Math.abs(parenCount) + ' close'}`);

  // Check for unterminated strings
  const singleQuoteCount = (content.match(/(?<!\\)'/g) || []).length;
  const doubleQuoteCount = (content.match(/(?<!\\)"/g) || []).length;
  const backtickCount = (content.match(/(?<!\\)`/g) || []).length;

  if (singleQuoteCount % 2 !== 0) errors.push('Unterminated single-quoted string');
  if (doubleQuoteCount % 2 !== 0) errors.push('Unterminated double-quoted string');
  if (backtickCount % 2 !== 0) errors.push('Unterminated template literal');

  // Check for common syntax errors
  if (/;\s*;/.test(content)) errors.push('Double semicolons detected');
  if (/,\s*,/.test(content)) errors.push('Double commas detected');
  if (/\s{2,}$/.test(content)) errors.push('Trailing whitespace detected');

  return {
    valid: errors.length === 0,
    errors,
    confidence: 1 - (errors.length * 0.1)
  };
}

/**
 * Validates Svelte component syntax
 */
export function validateSvelteSyntax(content) {
  const errors = [];

  // Check for unclosed script tags
  const scriptTags = content.match(/<script[^>]*>|<\/script>/g) || [];
  if (scriptTags.length % 2 !== 0) errors.push('Unclosed script tag');

  // Check for unclosed style tags
  const styleTags = content.match(/<style[^>]*>|<\/style>/g) || [];
  if (styleTags.length % 2 !== 0) errors.push('Unclosed style tag');

  // Check for reserved keywords as identifiers
  const reservedInScript = /@const|@html|@debug/g;
  if (!reservedInScript.test(content)) {
    // Good, proper usage of directives
  }

  return {
    valid: errors.length === 0,
    errors,
    confidence: 1 - (errors.length * 0.15)
  };
}

/**
 * Comprehensive validation for a file's content
 */
export function validateFileContent(content, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const result = {
    filePath,
    extension: ext,
    contentType: detectContentType(content),
    syntaxValidation: null,
    isCodeLike: false,
    canWrite: false,
    issues: [],
    warnings: [],
    recommendations: []
  };

  // Step 1: Check if content is documentation bleeding
  if (result.contentType.type === 'documentation' && result.contentType.confidence > 0.7) {
    result.issues.push('Content detected as documentation, not code');
    result.recommendations.push('This appears to be explanatory text. Use --force to override or review the content.');
    return result;
  }

  // Step 2: Language-specific syntax validation
  if (['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'].includes(ext)) {
    result.syntaxValidation = validateTypeScriptSyntax(content);
    if (!result.syntaxValidation.valid) {
      result.issues.push(`Syntax errors in ${ext} file:`, ...result.syntaxValidation.errors);
    }
  } else if (['.svelte'].includes(ext)) {
    result.syntaxValidation = validateSvelteSyntax(content);
    if (!result.syntaxValidation.valid) {
      result.issues.push(`Syntax errors in Svelte file:`, ...result.syntaxValidation.errors);
    }
  }

  // Step 3: Check for minimum code requirements
  if (content.trim().length === 0) {
    result.issues.push('Content is empty');
  } else if (content.trim().length < 10) {
    result.issues.push('Content is too short to be functional code');
  } else {
    result.isCodeLike = true;
  }

  // Step 4: Determine if we can write
  result.canWrite = result.isCodeLike && result.issues.length === 0;

  if (result.canWrite) {
    result.recommendations.push('✅ Content is safe to write to file');
  }

  return result;
}

/**
 * Write file with validation
 */
export async function safeWriteFile(filePath, content, options = {}) {
  const { force = false, backup = true, validate = true } = options;

  // Validate content if requested
  if (validate) {
    const validation = validateFileContent(content, filePath);

    if (!validation.canWrite && !force) {
      return {
        success: false,
        filePath,
        validation,
        error: `Cannot write file: ${validation.issues.join(', ')}`
      };
    }

    if (validation.issues.length > 0) {
      console.warn(`⚠️  Writing with validation issues: ${validation.issues.join(', ')}`);
    }
  }

  // Create backup if file exists
  let backupPath = null;
  try {
    if (backup) {
      try {
        const existing = await fs.readFile(filePath, 'utf-8');
        backupPath = `${filePath}.backup-${Date.now()}`;
        await fs.writeFile(backupPath, existing);
      } catch (err) {
        // File doesn't exist yet, that's okay
      }
    }

    // Write the file
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');

    return {
      success: true,
      filePath,
      backupPath,
      bytesWritten: content.length
    };
  } catch (error) {
    // Rollback on error
    if (backupPath) {
      try {
        const backup = await fs.readFile(backupPath, 'utf-8');
        await fs.writeFile(filePath, backup);
        await fs.unlink(backupPath);
      } catch (rollbackErr) {
        console.error('Failed to rollback:', rollbackErr.message);
      }
    }

    return {
      success: false,
      filePath,
      error: error.message,
      backupPath
    };
  }
}

/**
 * Validate entire patch set before applying
 */
export function validatePatchSet(patches) {
  const validation = {
    totalPatches: patches.length,
    validPatches: [],
    invalidPatches: [],
    issues: []
  };

  for (const patch of patches) {
    const contentValidation = validateFileContent(patch.content, patch.filePath);

    if (contentValidation.canWrite) {
      validation.validPatches.push({
        filePath: patch.filePath,
        contentLength: patch.content.length
      });
    } else {
      validation.invalidPatches.push({
        filePath: patch.filePath,
        issues: contentValidation.issues
      });
      validation.issues.push(...contentValidation.issues);
    }
  }

  validation.successRate = (validation.validPatches.length / validation.totalPatches * 100).toFixed(1);

  return validation;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CLI INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'validate') {
    const filePath = process.argv[3];
    const force = process.argv.includes('--force');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const validation = validateFileContent(content, filePath);

      console.log(JSON.stringify(validation, null, 2));
      process.exit(validation.canWrite || force ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  } else if (command === 'write') {
    const filePath = process.argv[3];
    const force = process.argv.includes('--force');
    const content = await fs.readFile(0, 'utf-8');

    const result = await safeWriteFile(filePath, content, { force, validate: true });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  } else {
    console.log('Phase 79: Safety Gate - File Validation Layer');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/phase79-safety-gate.mjs validate <filePath> [--force]');
    console.log('  node scripts/phase79-safety-gate.mjs write <filePath> [--force]');
    console.log('');
    console.log('Validates that content is code, not documentation, before writing.');
  }
}

export default {
  validateFileContent,
  safeWriteFile,
  validatePatchSet,
  detectContentType,
  validateTypeScriptSyntax,
  validateSvelteSyntax
};
