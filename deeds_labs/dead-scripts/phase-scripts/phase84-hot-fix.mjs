// scripts/phase84-hot-fix.mjs
import fs from 'node:fs';

const files = [
  {
    path: 'src/lib/server/services/CaseScoringServiceGrpc.ts',
    fix: (content) => {
      // Fix: info: (msg, /* PHASE82_COLON_CHAIN: string */ , ...args: unknown[])
      // -> info: (msg: string, ...args: unknown[])
      return content.replace(
        /(\w+):\s*\((\w+),\s*\/\*.*?\*\/\s*,\s*\.\.\.args:\s*unknown\[\]\)/g,
        '$1: ($2: string, ...args: unknown[])'
      );
    }
  },
  {
    path: 'src/lib/server/ai/rag-pipeline-enhanced.ts',
    fix: (content) => {
      // Clean up postgres call callbacks
      // onnotice: (notice: unknown) => ...
      // onparameter: (key: string, value: unknown) => ...
      // forcing clean replacement
      let s = content;
      if (s.includes('onnotice: (notice: unknown)')) {
        s = s.replace(/onnotice:\s*\(notice:\s*unknown\)\s*=>\s*console\.debug\('\[DB\] Notice:',\s*notice\),/,
                      "onnotice: (notice) => console.debug('[DB] Notice:', notice as any),");
      }
      if (s.includes('onparameter: (key: string, value: unknown)')) {
        s = s.replace(/onparameter:\s*\(key:\s*string,\s*value:\s*unknown\)\s*=>\s*console\.debug\(`\[DB\] Parameter \${key}:`,\s*value\),/,
                      "onparameter: (key, value) => console.debug(`[DB] Parameter ${key}:`, value as any),");
      }
      return s;
    }
  },
  {
    path: 'src/lib/services/qlora-rl-langextract-integration.ts',
    fix: (content) => {
      // Fix potential regex confusion on 'http://'
      // Replace the entire assignment line with a clean version
      return content.replace(
        /this\.langextractServiceUrl\s*=\s*options\.langextractServiceUrl\s*\|\|\s*'http:\/\/localhost:3001';/,
        "this.langextractServiceUrl = options.langextractServiceUrl || \"http://localhost:3001\";"
      );
    }
  }
];

files.forEach(({ path, fix }) => {
  if (fs.existsSync(path)) {
    const original = fs.readFileSync(path, 'utf8');
    const fixed = fix(original);
    if (original !== fixed) {
      fs.writeFileSync(path, fixed, 'utf8');
      console.log(`✅ Fixed verified patterns in ${path}`);
    } else {
      console.log(`⚠️ No patterns matched in ${path} (or already fixed)`);
    }
  } else {
    console.log(`❌ File not found: ${path}`);
  }
});
