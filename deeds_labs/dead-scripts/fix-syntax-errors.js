#!/usr/bin/env node

import fs from 'fs';
import { glob } from 'glob';

function fixSyntaxErrors(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix .set. pattern to .set()
    const setBugPattern = /(\w+)\.set\.(\w+)/g;
    if (setBugPattern.test(content)) {
      content = content.replace(setBugPattern, (match, obj, prop) => {
        return `${obj}.set(${prop})`;
      });
      changed = true;
    }

    // Fix JSON.stringify. pattern
    const jsonStringifyPattern = /JSON\.stringify\.(\w+)/g;
    if (jsonStringifyPattern.test(content)) {
      content = content.replace(jsonStringifyPattern, (match, prop) => {
        return `JSON.stringify(${prop})`;
      });
      changed = true;
    }

    // Fix $state declarations with wrong syntax
    const statePattern = /\$state<([^>]+)>\((['"][^'"]*['"])\)\s*\(\s*\)/g;
    if (statePattern.test(content)) {
      content = content.replace(statePattern, (match, type, defaultValue) => {
        if (defaultValue === "''") return `$state<${type}>({})`;
        if (defaultValue === '"false"') return `$state<${type}>({})`;
        return `$state<${type}>({})`;
      });
      changed = true;
    }

    // Fix function parameter syntax errors (= )
    const paramPattern = /(\w+\s*:\s*\w+\s*=\s*)\)/g;
    if (paramPattern.test(content)) {
      content = content.replace(paramPattern, (match, param) => {
        return param + '{}';
      });
      changed = true;
    }

    // Fix CSS missing semicolons
    const cssPropertyPattern = /(\s+)([a-z-]+:\s*[^;]+)(\n\s+[a-z-]+:|$)/g;
    if (cssPropertyPattern.test(content)) {
      content = content.replace(cssPropertyPattern, (match, indent, property, ending) => {
        if (!property.endsWith(';')) {
          return `${indent}${property};${ending}`;
        }
        return match;
      });
      changed = true;
    }

    // Fix Object.keys syntax errors
    const objectKeysPattern = /Object\.keys\.length/g;
    if (objectKeysPattern.test(content)) {
      content = content.replace(objectKeysPattern, 'Object.keys(errors).length');
      changed = true;
    }

    // Fix CSS pseudo-class with space
    const pseudoClassPattern = /(\w+):\s:([a-z-]+)/g;
    if (pseudoClassPattern.test(content)) {
      content = content.replace(pseudoClassPattern, '$1::$2');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed syntax errors in: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Find all .svelte and .ts files
// removed unused srcDir assignment
const patterns = ['src/**/*.svelte', 'src/**/*.ts'];

let totalFixed = 0;

patterns.forEach((pattern) => {
  const files = glob.sync(pattern, { cwd: '.' });

  files.forEach((file) => {
    if (fixSyntaxErrors(file)) {
      totalFixed++;
    }
  });
});

console.log(`\nFixed syntax errors in ${totalFixed} files.`);
