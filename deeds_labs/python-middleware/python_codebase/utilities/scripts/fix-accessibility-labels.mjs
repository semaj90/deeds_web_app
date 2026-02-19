#!/usr/bin/env node

/**
 * Phase 5: Add accessibility improvements (form labels)
 * High user impact - fixes 151+ accessibility warnings
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FIXES_APPLIED = {
  labelAssociations: 0,
  ariaRoles: 0,
  keyboardHandlers: 0
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

function fixFormLabelAssociations(content) {
  // Fix form labels that need to be associated with controls
  const labelPatterns = [
    // Pattern 1: <label>Text</label><input> -> <label for="id">Text</label><input id="id">
    {
      pattern: /<label([^>]*)>([^<]+)<\/label>\s*<(input|select|textarea)([^>]*?)>/g,
      replacement: (match, labelAttrs, labelText, inputType, inputAttrs) => {
        if (labelAttrs.includes('for=')) return match; // Already has for attribute
        
        const id = labelText.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 20);
          
        FIXES_APPLIED.labelAssociations++;
        
        if (inputAttrs.includes('id=')) {
          // Input already has id, extract it
          const idMatch = inputAttrs.match(/id=["']([^"']+)["']/);
          const existingId = idMatch ? idMatch[1] : id;
          return `<label${labelAttrs} for="${existingId}">${labelText}</label><${inputType}${inputAttrs}>`;
        } else {
          // Add new id
          return `<label${labelAttrs} for="${id}">${labelText}</label><${inputType} id="${id}"${inputAttrs}>`;
        }
      }
    },
    
    // Pattern 2: Adjacent labels and inputs
    {
      pattern: /<label class="([^"]*)"[^>]*>([^<]+)<\/label>\s*<(input|select|textarea)/g,
      replacement: (match, className, labelText, inputType) => {
        const id = labelText.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 20);
          
        FIXES_APPLIED.labelAssociations++;
        return `<label class="${className}" for="${id}">${labelText}</label><${inputType} id="${id}"`;
      }
    }
  ];

  labelPatterns.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });

  return content;
}

function fixAriaRoles(content) {
  // Add ARIA roles to clickable divs
  const ariaPatterns = [
    // Clickable divs need role="button"
    {
      pattern: /<div([^>]*)\s+onclick=([^>]*>)/g,
      replacement: (match, attributes, rest) => {
        if (!attributes.includes('role=')) {
          FIXES_APPLIED.ariaRoles++;
          return `<div${attributes} role="button" tabindex="0"${rest}`;
        }
        return match;
      }
    },
    
    // Drag and drop areas need role
    {
      pattern: /<div([^>]*)\s+(ondrop|ondragover)=([^>]*>)/g,
      replacement: (match, attributes, handler, rest) => {
        if (!attributes.includes('role=')) {
          FIXES_APPLIED.ariaRoles++;
          return `<div${attributes} role="region" aria-label="Drop zone" ${handler}=${rest}`;
        }
        return match;
      }
    }
  ];

  ariaPatterns.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });

  return content;
}

function addKeyboardHandlers(content) {
  // Add keyboard handlers for clickable elements
  const keyboardPatterns = [
    // Add onkeydown for onclick handlers
    {
      pattern: /onclick=\{([^}]+)\}/g,
      replacement: (match, handler) => {
        FIXES_APPLIED.keyboardHandlers++;
        return `onclick={${handler}} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { ${handler}; } }}`;
      }
    }
  ];

  keyboardPatterns.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });

  return content;
}

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply fixes
    content = fixFormLabelAssociations(content);
    content = fixAriaRoles(content);
    content = addKeyboardHandlers(content);
    
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
  console.log('♿ Phase 5: Adding accessibility improvements...\n');
  
  const svelteFiles = findSvelteFiles('sveltekit-frontend/src');
  console.log(`📁 Found ${svelteFiles.length} Svelte files to process\n`);
  
  let fixedCount = 0;
  
  for (const file of svelteFiles) {
    // Skip backup files
    if (file.includes('backup') || file.includes('archive')) continue;
    
    if (processFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n📊 Phase 5 Results:`);
  console.log(`Files processed: ${svelteFiles.length}`);
  console.log(`Files fixed: ${fixedCount}`);
  console.log(`Label associations added: ${FIXES_APPLIED.labelAssociations}`);
  console.log(`ARIA roles added: ${FIXES_APPLIED.ariaRoles}`);
  console.log(`Keyboard handlers added: ${FIXES_APPLIED.keyboardHandlers}`);
  
  if (fixedCount > 0) {
    console.log('\n✅ Phase 5 complete! Accessibility significantly improved.');
    console.log('Run `npm run build` to verify all fixes work correctly.');
  } else {
    console.log('\n✅ No accessibility changes needed');
  }
}

main();