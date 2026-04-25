import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const buildDir = 'dist'; // Assuming build output is in 'dist'

function findExternalUrls(directory) {
  let externalUrls = [];
  const files = readdirSync(directory);

  for (const file of files) {
    const filePath = join(directory, file);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      externalUrls = externalUrls.concat(findExternalUrls(filePath));
    } else if (stats.isFile() && (file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.html'))) {
      const content = readFileSync(filePath, 'utf-8');
      const urlRegex = /(https?:\/\/[^\s"']+)/g;
      let match;
      while ((match = urlRegex.exec(content)) !== null) {
        externalUrls.push(match[1]);
      }
    }
  }
  return externalUrls;
}

console.log('🚀 Starting SvelteKit build...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: 'sveltekit-frontend' });
  console.log('✅ SvelteKit build completed.');
} catch (error) {
  console.error('❌ SvelteKit build failed:', error.message);
  process.exit(1);
}

console.log(`🔍 Scanning build output in "${buildDir}" for external URLs...`);
const foundUrls = findExternalUrls(buildDir);

if (foundUrls.length > 0) {
  console.warn('⚠️ Found external URLs in build output:');
  foundUrls.forEach(url => console.warn(`- ${url}`));
  process.exit(1);
} else {
  console.log('🎉 No external URLs found in build output. All assets are self-hosted!');
  process.exit(0);
}
