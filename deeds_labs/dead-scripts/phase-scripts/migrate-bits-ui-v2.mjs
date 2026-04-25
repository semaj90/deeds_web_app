#!/usr/bin/env node

/**
 * Bits-UI v2 Migration Script
 * Updates all bits-ui imports from v1 sub-paths to v2 direct imports
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all Svelte, TypeScript, and JavaScript files
function findFiles(dir, extensions) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...findFiles(fullPath, extensions));
    } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

// Migration patterns for bits-ui v1 → v2
const migrationPatterns = [
  {
    // Button imports
    from: /import\s+type\s*\{\s*Button\s*\}\s+from\s+['"]bits-ui\/components\/ui\/button['"]/g,
    to: "import { Button } from 'bits-ui'"
  },
  {
    // Dialog imports
    from: /import\s+type\s*\{\s*Dialog[^}]*\}\s+from\s+['"]bits-ui\/components\/ui\/dialog['"]/g,
    to: "import { Dialog } from 'bits-ui'"
  },
  {
    // Dialog component imports (multiple)
    from: /import\s+type\s*\{\s*([^}]+)\s*\}\s+from\s+['"]bits-ui\/components\/ui\/dialog['"]/g,
    to: (match, components) => {
      const componentList = components.split(',').map(c => c.trim());
      return `import { ${componentList.join(', ')} } from 'bits-ui'`;
    }
  },
  {
    // Any other bits-ui/components imports
    from: /import\s+.*from\s+['"]bits-ui\/components\/[^'"]+['"]/g,
    to: (match) => {
      // Extract component names from the import
      const componentMatch = match.match(/import\s+(?:type\s+)?\{\s*([^}]+)\s*\}/);
      if (componentMatch) {
        const components = componentMatch[1].split(',').map(c => c.trim());
        return `import { ${components.join(', ')} } from 'bits-ui'`;
      }
      return match; // fallback
    }
  }
];

function migrateFile(filePath) {
  console.log(`🔄 Migrating: ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const pattern of migrationPatterns) {
    if (typeof pattern.to === 'string') {
      if (pattern.from.test(content)) {
        content = content.replace(pattern.from, pattern.to);
        changed = true;
      }
    } else {
      // Function replacement
      content = content.replace(pattern.from, pattern.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated: ${filePath}`);
    return true;
  }

  return false;
}

function main() {
  const srcDir = path.join(__dirname, 'src');
  const extensions = ['.svelte', '.ts', '.js'];

  console.log('🚀 Starting Bits-UI v2 Migration...');
  console.log('📁 Scanning directory:', srcDir);

  const files = findFiles(srcDir, extensions);
  console.log(`📋 Found ${files.length} files to check`);

  let migratedCount = 0;
  for (const file of files) {
    if (migrateFile(file)) {
      migratedCount++;
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`📊 Files updated: ${migratedCount}`);

  if (migratedCount > 0) {
    console.log('\n🔍 Running TypeScript check...');
    try {
      execSync('npx tsc --noEmit --skipLibCheck', { stdio: 'inherit' });
      console.log('✅ TypeScript check passed!');
    } catch (error) {
      console.log('⚠️  TypeScript check found issues. Please review.');
    }
  }
}

if (require.main === module) {
  main();
}