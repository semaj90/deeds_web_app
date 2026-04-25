#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const srcDir = './src';
const generatedDir = './.svelte-kit/types';

async function getAllTypeScriptFiles() {
  const files = [];

  async function traverse(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await traverse(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
    }
  }

  await traverse(srcDir);

  // Also include generated proxy files if they exist
  try {
    await traverse(generatedDir);
  } catch (error) {
    console.log('No generated files found - this is expected');
  }

  return files;
}

async function fixPropertyAssignmentErrors() {
  console.log('🚀 Starting comprehensive fix for Property Assignment Expected errors...');

  const files = await getAllTypeScriptFiles();
  let totalFiles = 0;
  let totalFixes = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixCount = 0;

      // Fix patterns that cause "Property assignment expected" errors
      const propertyAssignmentFixes = [
        // Fix object property trailing commas in interfaces: "prop: type;," -> "prop: type;"
        [/([a-zA-Z_$][a-zA-Z0-9_$]*:\s*[^;,}]+);,/g, '$1;'],

        // Fix function parameter trailing commas with semicolons: "param;," -> "param"
        [/([a-zA-Z_$][a-zA-Z0-9_$]*);,/g, '$1'],

        // Fix type annotation trailing commas: ": string;," -> ": string;"
        [/:\s*([^;,}]+);,/g, ': $1;'],

        // Fix interface property with trailing comma and semicolon: "prop: type;," -> "prop: type"
        [/([a-zA-Z_$][a-zA-Z0-9_$]*:\s*[^;,}]+);,(\s*[;}])/g, '$1$2'],

        // Fix case statement trailing semicolons: "case 'value':;" -> "case 'value':"
        [/case\s+(['"][^'"]*['"]):\s*;/g, 'case $1:'],

        // Fix default case trailing semicolons: "default:;" -> "default:"
        [/default:\s*;/g, 'default:']
      ];

      for (const [pattern, replacement] of propertyAssignmentFixes) {
        const matches = newContent.match(pattern);
        if (matches) {
          newContent = newContent.replace(pattern, replacement);
          fileFixCount += matches.length;
        }
      }

      if (fileFixCount > 0) {
        await fs.writeFile(file, newContent, 'utf8');
        console.log(`✅ Fixed ${fileFixCount} property assignment issues in ${file}`);
        totalFiles++;
        totalFixes += fileFixCount;
      }

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n🎉 Property assignment fix complete!`);
  console.log(`📊 Fixed ${totalFixes} property assignment issues across ${totalFiles} files`);
  console.log(`📁 Total files scanned: ${files.length}`);
}

// Run the fix
fixPropertyAssignmentErrors().catch(console.error);