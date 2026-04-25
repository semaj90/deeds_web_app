#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('🔧 Emergency Syntax Repair Script\n');

// Files that were corrupted by the batch script
const corruptedFiles = [
  'src/routes/(auth)/profile/+page.server.ts',
  'src/routes/(evidence)/main/upload/+page.server.ts',
  'src/routes/(legal)/cases/[id]/+page.server.ts',
  'src/routes/(tools)/search/+page.server.ts',
  'src/routes/admin/service-graph/+page.server.ts',
  'src/routes/admin/users/[userId]/+page.server.ts',
  'src/routes/admin/users/+page.server.ts',
  'src/routes/cache/redis-admin/+page.server.ts',
  'src/routes/cuda-streaming/+page.server.ts'
];

let totalFixes = 0;

corruptedFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping (not found): ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let fixes = 0;
    
    // Fix 1: type UserRow = { id: string;, email => type UserRow = { id: string; email
    if (content.includes('id: string;\n, email')) {
      content = content.replace(/id: string;\n,\s*email/g, 'id: string;\n  email');
      fixes++;
    }
    
    // Fix 2: { query: {, users => { query: { users
    if (content.includes('query: {\n,')) {
      content = content.replace(/query: {\n,\s*/g, 'query: {\n    ');
      fixes++;
    }
    
    // Fix 3: findFirst: (opts: {, columns => findFirst: (opts: { columns
    if (content.includes('opts: {\n,')) {
      content = content.replace(/opts: {\n,\s*/g, 'opts: {\n        ');
      fixes++;
    }
    
    // Fix 4: Misplaced commas at start of lines
    content = content.replace(/\n,\s+([a-zA-Z_$])/g, '\n  $1');
    
    // Fix 5: Unterminated template literals at end of error messages
    const unterminatedPattern = /error:\s*'([^']{50,})`/g;
    if (unterminatedPattern.test(content)) {
      content = content.replace(unterminatedPattern, "error: '$1'");
      fixes++;
    }
    
    // Fix 6: Backtick/quote mismatches in return statements
    content = content.replace(/return fail\([^)]+error:\s*'([^']+)`/g, (match, msg) => {
      return match.replace('`', "'");
    });
    
    if (fixes > 0) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} fixes applied`);
      totalFixes += fixes;
    } else {
      console.log(`ℹ️  ${filePath}: No fixes needed`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
});

console.log(`\n✅ Repair complete: ${totalFixes} total fixes applied\n`);
