import fs from 'fs';
import path from 'path';

function replaceUrlsInFile(filePath) {
  console.log(`Updating URLs in ${filePath}`);

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace all hardcoded localhost:5173 URLs with relative paths
  content = content.replace(/http:\/\/localhost:5173\//g, '/');
  content = content.replace(/http:\/\/localhost:5174\//g, '/');

  fs.writeFileSync(filePath, content);
}

// Update all test files
const testDir = './tests';
const testFiles = fs.readdirSync(testDir).filter((file) => file.endsWith('.spec.ts'));

console.log('🔧 Updating test files to use relative URLs...');

testFiles.forEach((file) => {
  const filePath = path.join(testDir, file);
  replaceUrlsInFile(filePath);
});

console.log('✅ All test files updated!');
