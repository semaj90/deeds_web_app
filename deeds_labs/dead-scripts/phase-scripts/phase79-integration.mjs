#!/usr/bin/env node
/**
 * Phase 79: Integration Hook
 *
 * Integrates the Safety Gate validation into existing fix pipelines.
 * This ensures that all auto-repair scripts use validation before writing.
 *
 * Usage:
 * - Wrap existing fix functions with validateBeforeWrite()
 * - Add to package.json scripts as a pre-execution check
 */

import fs from 'fs/promises';
import { safeWriteFile, validatePatchSet } from './phase79-safety-gate.mjs';

/**
 * Wraps a fix function to validate before writing
 */
export function validateBeforeWrite(fixFunction) {
  return async function wrappedFix(...args) {
    const result = await fixFunction(...args);

    if (!result.patch) {
      console.warn('⚠️  Fix function did not return a patch object');
      return result;
    }

    // Validate the patch before writing
    const { filePath, content } = result.patch;
    const validation = await validateFileContent(content, filePath);

    if (!validation.canWrite) {
      console.error(
        `❌ BLOCKED: Patch validation failed for ${filePath}`,
        validation.issues
      );
      return {
        ...result,
        blocked: true,
        validation,
        message: `Safety gate blocked write: ${validation.issues.join(', ')}`
      };
    }

    // If validation passed, write safely
    const writeResult = await safeWriteFile(filePath, content, {
      validate: false, // Already validated above
      backup: true
    });

    return {
      ...result,
      writeResult,
      message: writeResult.success ? 'Patch applied successfully' : `Write failed: ${writeResult.error}`
    };
  };
}

/**
 * Batch validate patches before applying them
 */
export async function batchValidatePatches(patches) {
  const validation = validatePatchSet(patches);

  console.log(`\n📋 Patch Validation Report:`);
  console.log(`   Valid patches: ${validation.validPatches.length}/${validation.totalPatches}`);
  console.log(`   Success rate: ${validation.successRate}%`);

  if (validation.invalidPatches.length > 0) {
    console.log(`\n⚠️  Invalid patches detected:`);
    for (const invalid of validation.invalidPatches) {
      console.log(`   - ${invalid.filePath}: ${invalid.issues.join(', ')}`);
    }
  }

  return validation;
}

/**
 * Safe batch apply with validation
 */
export async function safeBatchApply(patches, options = {}) {
  const { dryRun = false, stopOnError = false } = options;

  // Validate all patches first
  const validation = await batchValidatePatches(patches);

  if (dryRun) {
    console.log('\n🔄 Dry-run mode: No files will be written');
    return {
      dryRun: true,
      validation,
      results: []
    };
  }

  const results = [];
  for (const patch of patches) {
    if (validation.invalidPatches.some(p => p.filePath === patch.filePath)) {
      results.push({
        filePath: patch.filePath,
        success: false,
        reason: 'Validation failed'
      });

      if (stopOnError) {
        console.error(`\n❌ Stopping batch apply due to validation error`);
        break;
      }
      continue;
    }

    const result = await safeWriteFile(patch.filePath, patch.content, {
      validate: false, // Already validated
      backup: true
    });

    results.push({
      filePath: patch.filePath,
      success: result.success,
      error: result.error,
      backupPath: result.backupPath
    });

    if (!result.success && stopOnError) {
      console.error(`\n❌ Stopping batch apply due to write error`);
      break;
    }
  }

  return {
    dryRun: false,
    validation,
    results,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length
  };
}

/**
 * Exports validation as middleware for Express/API routes
 */
export function createValidationMiddleware() {
  return async (req, res, next) => {
    // If request has patch data, validate it
    if (req.body.patch) {
      const { filePath, content } = req.body.patch;
      const { validateFileContent } = await import('./phase79-safety-gate.mjs');
      const validation = validateFileContent(content, filePath);

      if (!validation.canWrite) {
        return res.status(400).json({
          success: false,
          error: 'Patch validation failed',
          validation
        });
      }

      // Attach validation result to request
      req.validation = validation;
    }

    next();
  };
}

/**
 * CLI interface for batch validation
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'batch-validate') {
    const patchesFile = process.argv[3];

    try {
      const content = await fs.readFile(patchesFile, 'utf-8');
      const patches = JSON.parse(content);
      const validation = await batchValidatePatches(patches);

      console.log(`\n📊 Result: ${validation.validPatches.length}/${validation.totalPatches} patches valid`);
      process.exit(validation.invalidPatches.length === 0 ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  } else {
    console.log('Phase 79: Integration Hook');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/phase79-integration.mjs batch-validate <patchesFile.json>');
  }
}

export default {
  validateBeforeWrite,
  batchValidatePatches,
  safeBatchApply,
  createValidationMiddleware
};
