#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Comprehensive syntax fixes for TypeScript/JavaScript
const SYNTAX_FIXES = [
  // Fix empty object assignments
  {
    from: /const\s+(\w+):\s*\{\s*\[key:\s*string\]:\s*[^}]+\}\s*=\s*;/g,
    to: 'const $1: { [key: string]: any[] } = {};',
  },

  // Fix broken $state declarations
  { from: /\$state<[^>]+>\([^)]*\)\s*\(\s*\)/g, to: '$state({})' },
  { from: /\$state<Record<string,\s*any>>\([^)]*\)\s*\(\s*\)/g, to: '$state({})' },

  // Fix console.error syntax
  { from: /console\.error\.error\)/g, to: 'console.error(error)' },

  // Fix incomplete object literals
  { from: /(\w+):\s*z\.string\.optional\(\),/g, to: '$1: z.string().optional(),' },
  {
    from: /z\.object\.min-max\((\d+),\s*'([^']+)'\),/g,
    to: "z.object({ title: z.string().min(1).max($1, '$2'),",
  },
  {
    from: /z\.enum\.default\('([^']+)'\),/g,
    to: "z.enum(['low', 'medium', 'high']).default('$1'),",
  },

  // Fix broken filter/map chains
  { from: /\.filter\([^)]*\)\.([a-zA-Z]+)/g, to: '.filter(item => item.$1)' },
  { from: /\.map\.([a-zA-Z]+)\.toString\(\),/g, to: '.map(item => ({ id: item.$1.toString(),' },
  {
    from: /\.filter\.([a-zA-Z]+)\s*===\s*'([^']+)'\)\.length,/g,
    to: ".filter(item => item.$1 === '$2').length,",
  },

  // Fix incomplete array/object destructuring
  { from: /\)\s*\(\s*\[/g, to: ') => [' },
  { from: /\|\s*null>\([^)]*\)\(/g, to: ' | null>(null); const data = ' },

  // Fix broken JSON.stringify calls
  { from: /JSON\.stringify\.([a-zA-Z]+)\)/g, to: 'JSON.stringify($1)' },

  // Fix crypto.subtle.digest calls
  {
    from: /crypto\.subtle\.digest\('([^']+)',\s*await\s+([^;]+);/g,
    to: "crypto.subtle.digest('$1', await $2);",
  },

  // Fix incomplete function calls
  { from: /onMount\(\(\)\s*=>\s*\{[^}]*\},\s*$/gm, to: 'onMount(() => {' },
  { from: /settings:\s*\{/g, to: '}); const settings = {' },

  // Fix broken string interpolation
  { from: /\$\{[^}]*\}\s*joined\s+the\s+case<\/span>/g, to: '${user.name} joined the case</span>' },

  // Fix incomplete method calls
  { from: /\.setItems\.([a-zA-Z]+)\s*\|\|\s*\[\]\)/g, to: '.setItems(data.$1 || [])' },

  // Fix navItems.filter permission checks
  {
    from: /navItems\.filter\.permission\)\)/g,
    to: 'navItems.filter(item => hasPermission(currentUserValue.role, item.permission))',
  },

  // Fix forEach.filter combinations
  {
    from: /\.forEach\.filter\(Boolean\);/g,
    to: '.filter(Boolean).forEach(item => { /* process item */ });',
  },

  // Fix incomplete array declarations
  { from: /const\s+(\w+)\s*\|\s*null>\([^)]*\)\s*\(\s*\[/g, to: 'const $1: any[] | null = [' },

  // Fix missing closing parentheses in function calls
  {
    from: /await\s+([^;]+);\s*$/gm,
    to: (match, p1) => {
      const openParens = (p1.match(/\(/g) || []).length;
      const closeParens = (p1.match(/\)/g) || []).length;
      if (openParens > closeParens) {
        return `await ${p1}${')'.repeat(openParens - closeParens)};`;
      }
      return match;
    },
  },
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    SYNTAX_FIXES.forEach(({ from, to }) => {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });

    // Additional custom fixes for specific patterns
    if (content.includes('const clusters: { [key: string]: any[] } = ;')) {
      content = content.replace(
        'const clusters: { [key: string]: any[] } = ;',
        'const clusters: { [key: string]: any[] } = {};'
      );
      modified = true;
    }

    if (content.includes("let nodeMeshes = $state<Record<string, THREE.Mesh>('')>( );")) {
      content = content.replace(
        "let nodeMeshes = $state<Record<string, THREE.Mesh>('')>( );",
        'let nodeMeshes = $state<Record<string, THREE.Mesh>>({});'
      );
      modified = true;
    }

    if (content.includes("let apiStatus = $state<Record<string, any>('')>( );")) {
      content = content.replace(
        "let apiStatus = $state<Record<string, any>('')>( );",
        'let apiStatus = $state<Record<string, any>>({});'
      );
      modified = true;
    }

    // Fix onMount with trailing comma
    content = content.replace(
      /onMount\(\(\)\s*=>\s*\{[^}]*\},\s*settings:\s*\{/g,
      'onMount(() => { /* initialization */ }); const settings = {'
    );

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed syntax in: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function findFiles(dir) {
  const files = [];

  function scanDir(currentDir) {
    try {
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
    } catch (err) {
      console.warn(`Warning: Cannot read directory ${currentDir}`);
    }
  }

  scanDir(dir);
  return files;
}

// Process all files
const srcDir = path.join(__dirname, '../src');
const files = findFiles(srcDir);

console.log(`🔄 Processing ${files.length} files for syntax fixes...`);

files.forEach(processFile);

console.log('✨ Syntax fixes complete!');
