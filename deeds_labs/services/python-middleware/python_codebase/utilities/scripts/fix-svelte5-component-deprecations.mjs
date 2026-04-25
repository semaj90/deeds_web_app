#!/usr/bin/env node

/**
 * Fix Svelte 5 Component Deprecations and Accessibility Issues
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FIXES_APPLIED = {
  svelteComponent: 0,
  quotedAttributes: 0,
  labelAssociation: 0,
  stateReferences: 0,
  staticInteractions: 0
};

function findSvelteFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.svelte-kit'].includes(item)) {
        findSvelteFiles(fullPath, files);
      }
    } else if (item.endsWith('.svelte')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixSvelteComponentDeprecations(content) {
  // Fix <svelte:component> deprecations - replace with dynamic components
  const svelteComponentPattern = /<svelte:component\s+this=\{([^}]+)\}([^>]*)>/g;
  
  content = content.replace(svelteComponentPattern, (match, component, attributes) => {
    FIXES_APPLIED.svelteComponent++;
    // Use dynamic component syntax
    return `{#if ${component}}<${component.replace(/^get\w*\(/, '').replace(/\)$/, '')}${attributes}>{/if}`;
  });
  
  return content;
}

function fixQuotedAttributes(content) {
  // Fix quoted class attributes that will be stringified
  const quotedClassPattern = /class="\{([^}]+)\}"/g;
  
  content = content.replace(quotedClassPattern, (match, expression) => {
    FIXES_APPLIED.quotedAttributes++;
    return `class={${expression}}`;
  });
  
  return content;
}

function fixLabelAssociations(content) {
  // Fix form labels without proper associations
  const labelPattern = /<label[^>]*>([^<]+)<\/label>\s*<(input|select|textarea)/g;
  
  content = content.replace(labelPattern, (match, labelText, inputType) => {
    const id = labelText.toLowerCase().replace(/[^a-z0-9]/g, '-');
    FIXES_APPLIED.labelAssociation++;
    return `<label for="${id}">${labelText}</label><${inputType} id="${id}"`;
  });
  
  return content;
}

function fixStateReferences(content) {
  // Fix state references that only capture initial values
  const stateRefPattern = /(const\s+response\s*=\s*await\s+fetch\()(\w+)(\);)/g;
  
  content = content.replace(stateRefPattern, (match, fetchCall, endpoint, end) => {
    FIXES_APPLIED.stateReferences++;
    return `${fetchCall}${endpoint}()${end}`;
  });
  
  return content;
}

function fixStaticInteractions(content) {
  // Fix div elements with click handlers - add proper ARIA roles
  const clickablePattern = /<div([^>]*)\s+onclick=([^>]*>)/g;
  
  content = content.replace(clickablePattern, (match, attributes, rest) => {
    if (!attributes.includes('role=')) {
      FIXES_APPLIED.staticInteractions++;
      return `<div${attributes} role="button" tabindex="0"${rest}`;
    }
    return match;
  });
  
  return content;
}

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply fixes
    content = fixSvelteComponentDeprecations(content);
    content = fixQuotedAttributes(content);
    content = fixLabelAssociations(content);
    content = fixStateReferences(content);
    content = fixStaticInteractions(content);
    
    // Only write if content changed
    if (content !== originalContent) {
      writeFileSync(filePath, content);
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Starting Svelte 5 Component & Accessibility Fixes...\n');
  
  const svelteFiles = findSvelteFiles('sveltekit-frontend/src');
  console.log(`📁 Found ${svelteFiles.length} Svelte files to process\n`);
  
  let fixedCount = 0;
  
  for (const file of svelteFiles) {
    if (processFile(file)) {
      fixedCount++;
    }
  }
  
  console.log('\n📊 Fix Summary:');
  console.log(`Files processed: ${svelteFiles.length}`);
  console.log(`Files fixed: ${fixedCount}`);
  console.log('\n🔧 Fixes applied:');
  Object.entries(FIXES_APPLIED).forEach(([fix, count]) => {
    if (count > 0) {
      console.log(`  ${fix}: ${count}`);
    }
  });
  
  console.log('\n✅ Component & accessibility fixes complete!');
}

main();