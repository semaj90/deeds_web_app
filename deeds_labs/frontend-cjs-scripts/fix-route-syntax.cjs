#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';

// More specific patterns for route files
const patterns = [
  // Fix: "property": value,; -> "property": value,
  {
    regex: /(\w+:\s*[^,\n]+),\s*;\s*\n/g,
    replacement: '$1,\n',
    description: 'Fix object property with trailing comma-semicolon'
  },
  // Fix: } catch {} -> } catch (error) {}
  {
    regex: /}\s*catch\s*{\s*}/g,
    replacement: '} catch (error) {}',
    description: 'Fix empty catch blocks'
  },
  // Fix: } catch () {} -> } catch (error) {}
  {
    regex: /}\s*catch\s*\(\s*\)\s*{/g,
    replacement: '} catch (error) {',
    description: 'Fix catch blocks with empty parameters'
  },
  // Fix: async function() {} -> async function() { return null; }
  {
    regex: /async\s+function\s*\([^)]*\)\s*{\s*}/g,
    replacement: 'async function() { return null; }',
    description: 'Fix empty async functions'
  }
];

async function getAllTSFiles(dir) {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
    }
  }

  await traverse(dir);
  return files;
}

async function fixRouteSyntax() {
  console.log('🔍 Finding route files with syntax issues...');

  const files = await getAllTSFiles(srcDir);
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Fix specific malformed patterns
      if (content.includes(',;')) {
        newContent = newContent.replace(/,\s*;\s*\n/g, ',\n');
        fileFixCount++;
      }

      if (content.includes('} catch {')) {
        newContent = newContent.replace(/}\s*catch\s*{\s*}/g, '} catch (error) {}');
        fileFixCount++;
      }

      if (content.includes('} catch () {')) {
        newContent = newContent.replace(/}\s*catch\s*\(\s*\)\s*{/g, '} catch (error) {');
        fileFixCount++;
      }

      // Additional route-specific fixes
      if (content.includes('id: users.id,;')) {
        newContent = newContent.replace(/id:\s*users\.id,\s*;/g, 'id: users.id,');
        fileFixCount++;
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} syntax issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Route syntax fix complete!`);
  console.log(`📊 Fixed ${totalFixes} issues across ${totalFiles} files`);
}

// Run the fix
fixRouteSyntax().catch(console.error);