
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..'); // Assuming scripts/ is one level deep
const servicesDir = path.join(rootDir, 'src', 'lib', 'services');
const corruptedDir = path.join(servicesDir, '_corrupted');

// THE GOLDEN LIST - These are the only 9 verified clean files
const keepFiles = new Set([
  'ai-service.ts',
  'ai-error-fixer.ts',
  'agentic-stream.ts',
  'case-link.service.ts',
  'agentShellMachine.ts',
  'adaptive-index-orchestrator.ts',
  'client-server-sync.ts',
  'ollamaService.ts',
  'get-ollama-endpoint.ts'
]);

console.log(`🧹 Cleaning services directory: ${servicesDir}`);
console.log(`📦 Moving garbage to: ${corruptedDir}`);

if (!fs.existsSync(corruptedDir)) {
  fs.mkdirSync(corruptedDir, { recursive: true });
}

const items = fs.readdirSync(servicesDir);
let movedCount = 0;

items.forEach(item => {
  // Skip the destination directory itself and any hidden files
  if (item === '_corrupted' || item.startsWith('.')) return;

  // Skip our golden files
  if (keepFiles.has(item)) {
    console.log(`✅ Keeping clean file: ${item}`);
    return;
  }

  const srcPath = path.join(servicesDir, item);
  const destPath = path.join(corruptedDir, item);

  try {
    fs.renameSync(srcPath, destPath);
    movedCount++;
  } catch (err) {
    console.error(`❌ Failed to move ${item}: ${err.message}`);
    // If it fails (e.g. locked file), try copy-delete
    try {
        if (fs.lstatSync(srcPath).isDirectory()) {
            // simpler to skip complex move if rename fails for dir
            console.error(`   Skipping locked directory: ${item}`);
        } else {
            fs.copyFileSync(srcPath, destPath);
            fs.unlinkSync(srcPath);
            movedCount++;
        }
    } catch (e2) {
        console.error(`   Retry failed: ${e2.message}`);
    }
  }
});

console.log(`\n🎉 Cleanup complete! Moved ${movedCount} corrupted items to _corrupted.`);
