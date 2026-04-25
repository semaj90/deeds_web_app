#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Common melt to bits-ui replacements
const REPLACEMENTS = [
  // Import replacements
  {
    from: /import.*{.*createProgress.*}.*from.*['"]melt['"];?/g,
    to: "import * as Progress from 'bits-ui';",
  },
  {
    from: /import.*{.*createDialog.*}.*from.*['"]melt['"];?/g,
    to: "import * as Dialog from 'bits-ui';",
  },
  {
    from: /import.*{.*createAccordion.*}.*from.*['"]melt['"];?/g,
    to: "import * as Accordion from 'bits-ui';",
  },
  {
    from: /import.*{.*createSelect.*}.*from.*['"]melt['"];?/g,
    to: "import * as Select from 'bits-ui';",
  },
  {
    from: /import.*{.*createDropdownMenu.*}.*from.*['"]melt['"];?/g,
    to: "import * as DropdownMenu from 'bits-ui';",
  },
  {
    from: /import.*{.*createTooltip.*}.*from.*['"]melt['"];?/g,
    to: "import * as Tooltip from 'bits-ui';",
  },
  {
    from: /import.*{.*createContextMenu.*}.*from.*['"]@melt-ui\/svelte['"];?/g,
    to: "import * as ContextMenu from 'bits-ui';",
  },
  {
    from: /import.*{.*createToolbar.*}.*from.*['"]melt['"];?/g,
    to: '// Toolbar functionality can be implemented with regular HTML',
  },

  // Generic melt imports
  {
    from: /import.*{.*melt.*}.*from.*['"]melt['"];?/g,
    to: '// Replaced melt with bits-ui components',
  },
  { from: /from.*['"]melt['"];?/g, to: '// Replaced melt with bits-ui components' },

  // Comment out broken accordion imports
  {
    from: /import.*{.*Accordion.*}.*from.*['"]melt['"];?/g,
    to: "// import * as Accordion from 'bits-ui';",
  },

  // Usage patterns that need to be removed/commented
  {
    from: /const.*{[\s\S]*?}.*=.*create\w+\([\s\S]*?\);/g,
    to: '// Melt UI component creation removed - replace with bits-ui declarative components',
  },
  { from: /use:melt={\$\w+}/g, to: '' },
  { from: /\$melt\(\w+\)/g, to: '' },
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    REPLACEMENTS.forEach(({ from, to }) => {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function findSvelteFiles(dir) {
  const files = [];

  function scanDir(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
        scanDir(fullPath);
      } else if (item.endsWith('.svelte') || item.endsWith('.ts') || item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  scanDir(dir);
  return files;
}

// Process all files
const srcDir = path.join(__dirname, '../src');
const files = findSvelteFiles(srcDir);

console.log(`🔄 Processing ${files.length} files...`);

files.forEach(processFile);

console.log('✨ Melt-UI to bits-ui replacement complete!');
