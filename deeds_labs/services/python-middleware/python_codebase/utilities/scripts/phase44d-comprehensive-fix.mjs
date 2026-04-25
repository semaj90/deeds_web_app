#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../sveltekit-frontend/src');
let stats = {
  filesProcessed: 0,
  filesFixed: 0,
  issuesFixed: 0,
  patterns: {}
};

/**
 * PHASE 44D: Comprehensive Corruption Fixer
 * Targets: Single-line collapse, unterminated strings, malformed tags
 */

const patterns = [
  {
    name: 'COLLAPSE001: Single-line file collapse with unterminated strings',
    detect: (content) => {
      // Files with very few newlines but very long lines (collapse indicator)
      const lines = content.split('\n');
      return lines.length < 10 && lines.some(l => l.length > 200);
    },
    fix: (filePath, content) => {
      // This is tricky - we need to find matching pairs and break them
      // Strategy: Look for common Svelte/HTML patterns and re-collapse appropriately

      // First, try to identify script/style/markup boundaries
      let fixed = content;

      // Pattern: <script> ... </script> - should be on separate lines
      fixed = fixed.replace(/<script([^>]*)>/g, '\n<script$1>\n');
      fixed = fixed.replace(/<\/script>/g, '\n</script>\n');

      // Pattern: <style> ... </style>
      fixed = fixed.replace(/<style([^>]*)>/g, '\n<style$1>\n');
      fixed = fixed.replace(/<\/style>/g, '\n</style>\n');

      // Pattern: Major section divs
      fixed = fixed.replace(/<div class="([^"]{20,})/g, '\n<div class="$1');

      // Clean up excessive spacing
      fixed = fixed.replace(/\n\n\n+/g, '\n\n');

      if (fixed !== content) {
        return { fixed, issues: 1 };
      }
      return null;
    }
  },

  {
    name: 'UNTERMINATED001: Unterminated string literals',
    detect: (content) => {
      // Look for patterns like: "unclosed string ... end of line
      // Common: class="something without closing quote
      return /class="[^"]*$|id="[^"]*$|style="[^"]*$/m.test(content);
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Fix class=" without closing quote at end of line
      fixed = fixed.replace(/class="([^"]*?)(\n|$)/g, (match, inner, end) => {
        if (!inner.includes('"')) {
          count++;
          return `class="${inner}"${end}`;
        }
        return match;
      });

      // Fix id=" without closing quote
      fixed = fixed.replace(/id="([^"]*?)(\n|$)/g, (match, inner, end) => {
        if (!inner.includes('"')) {
          count++;
          return `id="${inner}"${end}`;
        }
        return match;
      });

      if (count > 0) {
        return { fixed, issues: count };
      }
      return null;
    }
  },

  {
    name: 'MALFORMED002: Orphaned closing tags',
    detect: (content) => {
      // {/if}, {/each}, {/await} without corresponding opening
      const opens = (content.match(/{#(if|each|await)/g) || []).length;
      const closes = (content.match(/{\/\s*(if|each|await)/g) || []).length;
      return closes > opens;
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Remove orphaned {/if} that have no matching {#if}
      // This is conservative - only remove if clearly orphaned
      const lines = fixed.split('\n');
      const ifStack = [];
      const toRemove = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('{#if')) ifStack.push(i);
        if (lines[i].includes('{/if}')) {
          if (ifStack.length > 0) {
            ifStack.pop();
          } else {
            toRemove.push(i);
            count++;
          }
        }
      }

      // Remove orphaned closes in reverse order to preserve indices
      for (let i = toRemove.length - 1; i >= 0; i--) {
        lines.splice(toRemove[i], 1);
      }

      fixed = lines.join('\n');

      if (count > 0) {
        return { fixed, issues: count };
      }
      return null;
    }
  },

  {
    name: 'TAGMISMATCH003: Mismatched closing tags',
    detect: (content) => {
      // </button> closing <h1>, </p> closing <div>, etc.
      return /<\/(?:button|div|span|p|h[1-6]|li|li|section)>/.test(content) &&
             /<(?:h[1-6]|p|div|section|li)(?:\s|>)/.test(content);
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Common mismatch: </button> with wrong context
      if (fixed.includes('</button>')) {
        const buttonCount = (fixed.match(/<button/g) || []).length;
        const closeButtonCount = (fixed.match(/<\/button>/g) || []).length;

        if (closeButtonCount > buttonCount) {
          // Replace excess closing buttons with likely intended closes
          // Look for context: if after </div> or at end of content, probably should be something else
          fixed = fixed.replace(/(\n\s*)<\/button>(\n|$)/g, (match, before, after) => {
            count++;
            return `${before}<\/div>${after}`;
          });
        }
      }

      if (count > 0) {
        return { fixed, issues: count };
      }
      return null;
    }
  },

  {
    name: 'CSS004: Malformed CSS class attributes',
    detect: (content) => {
      // :hover, :focus appearing in class names, or missing spaces in Tailwind
      return /:(?:hover|focus|active)[,\s]|(?:lg|md|sm)-(?:cols|items)|:\w+(?:bg|text|border)/.test(content);
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Fix :hover as separate from class
      if (fixed.includes(':hover')) {
        const before = fixed;
        fixed = fixed.replace(/class="([^"]*):hover([^"]*)"/, (match, before, after) => {
          count++;
          return `class="${before} hover:${after}"`;
        });
      }

      // Fix malformed Tailwind grid (lg-cols should be lg:cols)
      fixed = fixed.replace(/(?:grid|lg|md|sm)-(cols|items|gap)(?!\s*["{])/g, (match) => {
        const parts = match.split('-');
        count++;
        return parts[0] + ':' + parts[1];
      });

      if (count > 0 && fixed !== content) {
        return { fixed, issues: count };
      }
      return null;
    }
  },

  {
    name: 'SCRIPT001: Malformed script blocks',
    detect: (content) => {
      // Script tag not on own line or missing closing
      const scriptCount = (content.match(/<script/g) || []).length;
      const closeScriptCount = (content.match(/<\/script>/g) || []).length;
      return scriptCount !== closeScriptCount || /<script[^>]*>[^\n]/.test(content);
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Ensure script tags are on their own lines
      fixed = fixed.replace(/<script([^>]*)>\s*/g, () => {
        count++;
        return '<script$1>\n';
      });

      fixed = fixed.replace(/\s*<\/script>/g, () => {
        count++;
        return '\n</script>';
      });

      if (count > 0) {
        return { fixed, issues: count };
      }
      return null;
    }
  },

  {
    name: 'IMPORT001: Malformed imports',
    detect: (content) => {
      // import statements with misplaced commas or missing braces
      return /import\s+{?\s*[a-zA-Z].*?;/.test(content) &&
             /import.*,\s*,|import.*{\s*,|,\s*}/.test(content);
    },
    fix: (filePath, content) => {
      let fixed = content;
      let count = 0;

      // Remove duplicate commas in imports
      const before = fixed;
      fixed = fixed.replace(/import\s*{([^}]*?)}\s*from/g, (match, imports) => {
        const cleaned = imports
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .join(', ');
        count += (imports.match(/,\s*,/g) || []).length;
        return `import { ${cleaned} } from`;
      });

      if (fixed !== before) {
        return { fixed, issues: count };
      }
      return null;
    }
  }
];

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    stats.filesProcessed++;

    let fileFixed = false;
    let fileIssues = 0;
    let fixed = content;

    for (const pattern of patterns) {
      if (pattern.detect(fixed)) {
        const result = pattern.fix(filePath, fixed);

        if (result) {
          fixed = result.fixed;
          fileIssues += result.issues;
          fileFixed = true;
          stats.patterns[pattern.name] = (stats.patterns[pattern.name] || 0) + result.issues;
        }
      }
    }

    if (fileFixed) {
      fs.writeFileSync(filePath, fixed, 'utf-8');
      stats.filesFixed++;
      stats.issuesFixed += fileIssues;
      console.log(`✅ Fixed: ${path.relative(srcDir, filePath)} (${fileIssues} issues)`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      processFile(filePath);
    }
  }
}

console.log('🚀 Phase 44D: Comprehensive Corruption Fixer');
console.log('='.repeat(60));
console.log(`Scanning: ${srcDir}`);
console.log('');

walkDir(srcDir);

console.log('\n' + '='.repeat(60));
console.log('✅ Phase 44D Complete!');
console.log(`Files processed: ${stats.filesProcessed}`);
console.log(`Files fixed: ${stats.filesFixed}`);
console.log(`Issues fixed: ${stats.issuesFixed}`);
console.log('\nPattern Breakdown:');
Object.entries(stats.patterns)
  .sort((a, b) => b[1] - a[1])
  .forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count} fixes`);
  });
