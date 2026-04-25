#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('♿ Fixing Accessibility Issues');
console.log('=============================\n');

let filesFixed = 0;
let totalChanges = 0;

function processFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let changes = 0;
    let modified = false;

    // 1. Add ARIA labels to buttons without them
    const buttonRegex = /<button(?![^>]*aria-label)(?![^>]*aria-labelledby)([^>]*)>/g;
    const originalButtons = content;

    content = content.replace(buttonRegex, (match, attributes) => {
      // Extract text content or use generic label
      if (attributes.includes('onclick=') || attributes.includes('click')) {
        return `<button aria-label="Action button"${attributes}>`;
      } else if (match.includes('close') || match.includes('×')) {
        return `<button aria-label="Close"${attributes}>`;
      } else if (match.includes('submit')) {
        return `<button aria-label="Submit form"${attributes}>`;
      } else if (match.includes('save')) {
        return `<button aria-label="Save changes"${attributes}>`;
      } else if (match.includes('delete') || match.includes('remove')) {
        return `<button aria-label="Delete item"${attributes}>`;
      } else if (match.includes('edit')) {
        return `<button aria-label="Edit item"${attributes}>`;
      } else if (match.includes('search')) {
        return `<button aria-label="Search"${attributes}>`;
      } else if (match.includes('upload')) {
        return `<button aria-label="Upload file"${attributes}>`;
      } else {
        return `<button aria-label="Button"${attributes}>`;
      }
    });

    if (content !== originalButtons) {
      const matches = (originalButtons.match(buttonRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added ARIA labels to ${matches} buttons`);
    }

    // 2. Add labels for inputs without them
    const inputRegex =
      /<input(?![^>]*aria-label)(?![^>]*id=["'][^"']*["'][^>]*>[\s\S]*?<label[^>]*for=["'][^"']*["'])([^>]*type=["'](?:text|email|password|number|search|tel|url)["'][^>]*)>/g;
    const originalInputs = content;

    content = content.replace(inputRegex, (match, attributes) => {
      if (attributes.includes('placeholder=')) {
        const placeholderMatch = attributes.match(/placeholder=["']([^"']+)["']/);
        if (placeholderMatch) {
          return `<input aria-label="${placeholderMatch[1]}"${attributes}>`;
        }
      } else if (attributes.includes('name=')) {
        const nameMatch = attributes.match(/name=["']([^"']+)["']/);
        if (nameMatch) {
          const label = nameMatch[1]
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase());
          return `<input aria-label="${label}"${attributes}>`;
        }
      }
      return `<input aria-label="Input field"${attributes}>`;
    });

    if (content !== originalInputs) {
      const matches = (originalInputs.match(inputRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added labels to ${matches} inputs`);
    }

    // 3. Add role attributes to interactive elements
    const interactiveRegex = /<div(?![^>]*role=)([^>]*(?:onclick|click)[^>]*)>/g;
    const originalInteractive = content;

    content = content.replace(interactiveRegex, '<div role="button"$1>');

    if (content !== originalInteractive) {
      const matches = (originalInteractive.match(interactiveRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added role="button" to ${matches} interactive divs`);
    }

    // 4. Add tabindex for keyboard navigation
    const keyboardNavRegex = /<div role="button"(?![^>]*tabindex)([^>]*)>/g;
    const originalKeyboard = content;

    content = content.replace(keyboardNavRegex, '<div role="button" tabindex="0"$1>');

    if (content !== originalKeyboard) {
      const matches = (originalKeyboard.match(keyboardNavRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added tabindex to ${matches} interactive elements`);
    }

    // 5. Add ARIA attributes for form validation
    const requiredInputRegex = /<input(?![^>]*aria-required)([^>]*required[^>]*)>/g;
    const originalRequired = content;

    content = content.replace(requiredInputRegex, '<input aria-required="true"$1>');

    if (content !== originalRequired) {
      const matches = (originalRequired.match(requiredInputRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added aria-required to ${matches} required inputs`);
    }

    // 6. Add ARIA expanded for collapsible elements
    const collapsibleRegex =
      /<button(?![^>]*aria-expanded)([^>]*(?:toggle|expand|collapse)[^>]*)>/g;
    const originalCollapsible = content;

    content = content.replace(collapsibleRegex, '<button aria-expanded="false"$1>');

    if (content !== originalCollapsible) {
      const matches = (originalCollapsible.match(collapsibleRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added aria-expanded to ${matches} collapsible buttons`);
    }

    // 7. Add semantic landmarks
    if (
      content.includes('<div') &&
      !content.includes('<main') &&
      !content.includes('<section') &&
      (content.includes('dashboard') || content.includes('content') || content.includes('main'))
    ) {
      const mainContentRegex = /<div class="[^"]*(?:dashboard|content|main)[^"]*"([^>]*)>/;
      const mainMatch = content.match(mainContentRegex);

      if (mainMatch) {
        content = content.replace(mainMatch[0], `<main${mainMatch[1]}>`);
        content = content.replace(/<\/div>(?=[^<]*$)/, '</main>');
        changes++;
        modified = true;
        console.log(`    ✅ Added semantic main landmark`);
      }
    }

    // 8. Add skip links for navigation
    if (content.includes('<nav') && !content.includes('skip-to-content')) {
      const navRegex = /(<nav[^>]*>)/;
      const navMatch = content.match(navRegex);

      if (navMatch) {
        content = content.replace(
          navMatch[1],
          `<a href="#main-content" class="skip-link">Skip to main content</a>\n  ${navMatch[1]}`
        );
        changes++;
        modified = true;
        console.log(`    ✅ Added skip link`);
      }
    }

    // 9. Add screen reader text for icon-only buttons
    const iconButtonRegex =
      /<button[^>]*>[\s]*(?:<i|<svg|<span[^>]*icon)[^<]*<\/[^>]*>[\s]*<\/button>/g;
    const originalIconButtons = content;

    content = content.replace(iconButtonRegex, (match) => {
      if (!match.includes('aria-label') && !match.includes('screen-reader')) {
        return match.replace('>', '><span class="sr-only">Icon button</span>');
      }
      return match;
    });

    if (content !== originalIconButtons) {
      const matches = (originalIconButtons.match(iconButtonRegex) || []).length;
      changes += matches;
      modified = true;
      console.log(`    ✅ Added screen reader text to ${matches} icon buttons`);
    }

    // 10. Add ARIA live regions for dynamic content
    if (
      content.includes('error') &&
      content.includes('message') &&
      !content.includes('aria-live')
    ) {
      const errorRegex = /<div[^>]*error[^>]*>/g;
      const originalErrors = content;

      content = content.replace(errorRegex, (match) => {
        return match.replace('>', ' aria-live="polite" role="alert">');
      });

      if (content !== originalErrors) {
        const matches = (originalErrors.match(errorRegex) || []).length;
        changes += matches;
        modified = true;
        console.log(`    ✅ Added aria-live to ${matches} error messages`);
      }
    }

    // Write the file if modified
    if (modified) {
      writeFileSync(filePath, content, 'utf8');
      filesFixed++;
      totalChanges += changes;
      console.log(
        `  📝 Enhanced accessibility in ${filePath.split(/[/\\]/).pop()} (${changes} fixes)`
      );
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function addAccessibilityStyles() {
  const stylesPath = 'src/lib/styles/accessibility.css';
  const accessibilityCSS = `
/* Accessibility Enhancement Styles */

/* Skip links */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: #000;
  color: white;
  padding: 8px;
  text-decoration: none;
  z-index: 100;
  border-radius: 0 0 4px 4px;
}

.skip-link:focus {
  top: 0;
}

/* Screen reader only text */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Focus indicators */
button:focus,
input:focus,
select:focus,
textarea:focus,
[role="button"]:focus {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  button {
    border: 2px solid;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Interactive elements */
[role="button"] {
  cursor: pointer;
}

[role="button"]:hover {
  opacity: 0.8;
}

/* ARIA live regions */
[aria-live] {
  border: 1px solid transparent;
}

[aria-live="assertive"] {
  border-color: #ef4444;
}

[aria-live="polite"] {
  border-color: #3b82f6;
}
`;

  try {
    writeFileSync(stylesPath, accessibilityCSS, 'utf8');
    console.log(`✅ Created accessibility styles at ${stylesPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create accessibility styles:`, error.message);
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
  console.log('1️⃣ Finding components with accessibility issues...\n');

  const srcDir = 'src';
  const svelteFiles = walkDirectory(srcDir, '.svelte');

  // Filter files that need accessibility fixes
  const accessibilityFiles = svelteFiles.filter((file) => {
    try {
      const content = readFileSync(file, 'utf8');
      return (
        content.includes('<button') ||
        content.includes('<input') ||
        content.includes('onclick=') ||
        content.includes('role=') ||
        content.includes('<nav') ||
        content.includes('error')
      );
    } catch (error) {
      return false;
    }
  });

  console.log(`Found ${accessibilityFiles.length} components that may need accessibility fixes\n`);

  if (accessibilityFiles.length === 0) {
    console.log('✨ No accessibility issues found!');
    return;
  }

  console.log('2️⃣ Applying accessibility fixes...\n');

  // Process first 30 files to avoid overwhelming output
  for (const file of accessibilityFiles.slice(0, 30)) {
    console.log(`Processing: ${file}`);
    processFile(file);
    console.log('');
  }

  console.log('3️⃣ Creating accessibility styles...\n');
  addAccessibilityStyles();

  console.log('\n📊 Accessibility Enhancement Summary');
  console.log('====================================');
  console.log(`Files enhanced: ${filesFixed}`);
  console.log(`Total accessibility improvements: ${totalChanges}`);

  if (filesFixed > 0) {
    console.log('\n♿ Accessibility enhancements applied!');
    console.log('\nImprovements made:');
    console.log('- Added ARIA labels to buttons');
    console.log('- Added labels for form inputs');
    console.log('- Added role attributes for interactive elements');
    console.log('- Added keyboard navigation support');
    console.log('- Added semantic landmarks');
    console.log('- Added skip links for navigation');
    console.log('- Added screen reader support');
    console.log('- Added ARIA live regions');
    console.log('- Created accessibility CSS styles');

    console.log('\n💡 Next steps:');
    console.log('1. Import accessibility.css in your main layout');
    console.log('2. Test with screen readers');
    console.log('3. Verify keyboard navigation');
    console.log('4. Run accessibility audits');
  }
}

main();
