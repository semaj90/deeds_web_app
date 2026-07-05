#!/usr/bin/env node
/**
 * validate-cluster-cards.mjs
 *
 * Validates cluster-cards.jsonl against JSON Schema Draft-07 using native JSON Schema validation.
 * Usage:
 *   node scripts/atlas/validate-cluster-cards.mjs
 */

import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { repoRoot: ROOT, frontendRoot: FRONTEND_ROOT } = resolveAtlasPaths(import.meta.url);
const SCHEMA_PATH = resolve(FRONTEND_ROOT, 'docs/cluster-cards.schema.json');
const DATA_PATH = resolve(FRONTEND_ROOT, 'memory/cluster-cards/cluster-cards.jsonl');

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

function validateObject(obj, schema, path = 'root') {
  const errors = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (!(field in obj)) {
        errors.push(`${path}: missing required field '${field}'`);
      }
    }
  }

  // Check property types
  if (schema.properties) {
    for (const [key, value] of Object.entries(obj)) {
      if (!(key in schema.properties)) {
        if (schema.additionalProperties === false) {
          errors.push(`${path}: unexpected property '${key}'`);
        }
        continue;
      }

      const propSchema = schema.properties[key];
      const propPath = `${path}.${key}`;

      // Type validation
      if (propSchema.type) {
        const types = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
        let actualType = typeof value;
        if (value === null) actualType = 'null';
        else if (Array.isArray(value)) actualType = 'array';
        else if (typeof value === 'number' && Number.isInteger(value)) actualType = 'integer';

        if (!types.includes(actualType) && !(types.includes('null') && value === null)) {
          errors.push(`${propPath}: expected type ${types.join('|')}, got ${actualType}`);
        }
      }

      // Array validation
      if (propSchema.type === 'array' && Array.isArray(value)) {
        if (propSchema.minItems && value.length < propSchema.minItems) {
          errors.push(`${propPath}: array too short (min ${propSchema.minItems})`);
        }
        if (propSchema.maxItems && value.length > propSchema.maxItems) {
          errors.push(`${propPath}: array too long (max ${propSchema.maxItems})`);
        }
      }

      // Number validation
      if (propSchema.minimum && typeof value === 'number' && value < propSchema.minimum) {
        errors.push(`${propPath}: number too small (min ${propSchema.minimum})`);
      }
      if (propSchema.maximum && typeof value === 'number' && value > propSchema.maximum) {
        errors.push(`${propPath}: number too large (max ${propSchema.maximum})`);
      }
    }
  }

  return errors;
}

try {
  log(`${c.b('🔍 Cluster Cards Validator')}`);
  log(`   SCHEMA: ${SCHEMA_PATH}`);
  log(`   DATA:   ${DATA_PATH}`);

  // Load schema
  if (!fs.existsSync(SCHEMA_PATH)) {
    warn(`${c.r('✗')} Schema not found: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  // Load and validate data
  if (!fs.existsSync(DATA_PATH)) {
    warn(`${c.r('✗')} Data file not found: ${DATA_PATH}`);
    process.exit(1);
  }

  const ndjson = fs.readFileSync(DATA_PATH, 'utf8');
  const lines = ndjson.trim().split('\n').filter(Boolean);
  
  log(`\n${c.b('Validating')} ${lines.length} cluster cards...`);

  let validCount = 0;
  let errorCount = 0;
  const allErrors = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      const errors = validateObject(obj, schema, `line ${i + 1}`);
      
      if (errors.length > 0) {
        errorCount += errors.length;
        allErrors.push(...errors);
      } else {
        validCount += 1;
      }
    } catch (err) {
      errorCount += 1;
      allErrors.push(`line ${i + 1}: JSON parse error: ${err.message}`);
    }
  }

  log(`\n${c.b('Results')}:`);
  log(`  ${c.g('✓')} Valid: ${validCount}`);
  if (errorCount > 0) {
    log(`  ${c.r('✗')} Errors: ${errorCount}`);
    log(`\n${c.r('First 10 errors:')}`);
    for (const err of allErrors.slice(0, 10)) {
      log(`    ${err}`);
    }
    process.exit(1);
  } else {
    log(`\n${c.g('✓')} All cluster cards valid`);
    process.exit(0);
  }
} catch (err) {
  warn(`${c.r('✗')} Error: ${err.message}`);
  process.exit(1);
}
