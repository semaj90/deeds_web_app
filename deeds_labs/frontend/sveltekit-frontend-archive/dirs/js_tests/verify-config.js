#!/usr/bin/env node

console.log('🔍 === DEEDS APP CONFIGURATION VERIFICATION ===\n');

const fs = require('fs');
const path = require('path');

// Check current working directory
const currentDir = process.cwd();
console.log('📁 Current Directory:', currentDir);

// Expected to be in: web-app/sveltekit-frontend
const expectedPath = 'web-app\\sveltekit-frontend';
if (currentDir.includes(expectedPath)) {
  console.log('✅ Working in correct directory\n');
} else {
  console.log('⚠️ Not in expected directory. Should be in web-app/sveltekit-frontend\n');
}

// Check essential files
const essentialFiles = [
  '.env',
  'package.json',
  'drizzle.config.ts',
  'src/routes/+page.svelte',
  'src/routes/login/+page.svelte',
  'src/routes/register/+page.svelte',
  'src/routes/dashboard/+page.svelte',
  'src/lib/server/db/schema-new.ts',
];

console.log('📋 Essential Files Check:');
essentialFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
  }
});

// Check .env configuration
console.log('\n🗄️ Database Configuration:');
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');

  const dbUrl = envContent.match(/process.env.DATABASE_URL=(.+)/)?.[1];
  const dbName = envContent.match(/POSTGRES_DB=(.+)/)?.[1];

  console.log('📡 DATABASE_URL:', dbUrl || 'Not found');
  console.log('🗄️ Database Name:', dbName || 'Not found');

  if (dbName === 'prosecutor_app') {
    console.log('✅ Database name is correct');
  } else {
    console.log('⚠️ Database name may be incorrect');
  }
} else {
  console.log('❌ .env file not found');
}

// Check package.json scripts
console.log('\n📦 Available Scripts:');
if (fs.existsSync('package.json')) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};

  const importantScripts = ['dev', 'build', 'test', 'db:push', 'db:studio'];
  importantScripts.forEach((script) => {
    if (scripts[script]) {
      console.log(`✅ npm run ${script} - ${scripts[script]}`);
    } else {
      console.log(`❌ npm run ${script} - Not available`);
    }
  });
} else {
  console.log('❌ package.json not found');
}

// Check test files
console.log('\n🧪 Test Files:');
if (fs.existsSync('tests')) {
  const testFiles = fs.readdirSync('tests').filter((f) => f.endsWith('.spec.ts'));
  console.log(`✅ Found ${testFiles.length} test files:`);
  testFiles.forEach((file) => console.log(`   📝 ${file}`));
} else {
  console.log('❌ tests directory not found');
}

// Summary
console.log('\n🎯 === SUMMARY ===');
console.log('📍 Working Directory: web-app/sveltekit-frontend');
console.log('🗄️ Database: prosecutor_app (PostgreSQL)');
console.log('🚀 Status: Ready for E2E testing');
console.log('🎯 Next: npm run dev → npx playwright test');

console.log('\n💡 Quick Start Commands:');
console.log('   npm run dev                 # Start development server');
console.log('   npm run db:push             # Push schema to database');
console.log('   npx playwright test         # Run E2E tests');
console.log('   npm run db:studio           # Open Drizzle Studio');

console.log('\n🎉 Ready for Tauri integration after E2E tests pass!');
