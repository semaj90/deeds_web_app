#!/usr/bin/env node
const fs = require('fs');

console.log('🔧 Targeted File Fixer for Critical Routes\n');

const fixes = {
  'src/routes/(auth)/profile/+page.server.ts': [
    {
      search: /, email: string; id: string;/,
      replace: `type UserRow = {\n  id: string;\n  email: string;`
    },
    {
      search: /, columns: {indFirst: \(opts: {/,
      replace: `  query: {\n    users: {\n      findFirst: (opts: {\n        columns: {`
    }
  ],
  'src/routes/(evidence)/main/upload/+page.server.ts': [
    {
      search: /'([^']{100,})`/,
      replace: (match, p1) => `'${p1.substring(0, p1.lastIndexOf("'") + 1)}`
    }
  ],
  'src/routes/(legal)/cases/[id]/+page.server.ts': [
    {
      search: /'([^']{50,})`/,
      replace: (match, p1) => `'${p1}'`
    }
  ]
};

Object.entries(fixes).forEach(([filePath, replacements]) => {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    replacements.forEach(({ search, replace }) => {
      if (content.match(search)) {
        content = content.replace(search, replace);
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed: ${filePath}`);
    } else {
      console.log(`ℹ️  No changes needed: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
  }
});

console.log('\n✅ Targeted fixes complete');
