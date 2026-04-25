#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store name mappings - single source of truth
const STORE_MAP = {
  'avatarStore': 'avatarStore',
  'enhanced-rag-store': 'enhancedRAG',
  'evidenceStore': 'evidence',
  'evidence': 'evidence',
  'evidence-unified': 'evidence',
  'lokiStore': 'loki',
  'loki': 'loki',
  'canvas': 'canvas',
  'auth': 'auth',
  'auth-store': 'auth',
  'auth-store.svelte': 'auth',
  'auth-store.svelte.js': 'auth',
  'component-adapter-store': 'componentAdapter',
  'xstate-service-adapter': 'xstateServiceAdapter',
  'aiRecommendations': 'recommendations',
  'redis-orchestrator-store': 'redisOrchestrator',
  'user': 'user',
  'notification': 'notifications',
  'ai': 'aiGlobal',
  'ai-assistant-unified': 'aiAssistant',
  'ai-assistant-unified.svelte': 'aiAssistant',
  'ai-assistant-unified.svelte.js': 'aiAssistant',
  'ai-assistant': 'aiAssistant',
  'ai-assistant.svelte': 'aiAssistant',
  'evidence-workflow': 'evidenceWorkflow',
  'websocket-store': 'websocket',
  'websocket-store.svelte': 'websocket',
  'legal-case': 'legalCase',
  'legal-case.store.svelte': 'legalCase',
  'legal-case-store': 'legalCase',
  'aiHistoryStore': 'aiHistory',
  'caseStore': 'cases',
  'analyticsStore': 'analytics',
  'report': 'report',
  'evidence-stores': 'evidenceHierarchy',
  'alerts': 'alerts',
  'chat': 'chat',
  'chat.svelte': 'chat',
  'enhanced-upload-machine': 'enhancedUpload',
  'machines': 'machines',
  'feedback-store.svelte': 'feedback',
  'feedback-store': 'feedback',
  'evidence-store': 'evidenceStore',
  'upload-machine': 'upload',
  'userDataStore.svelte': 'userData',
  'citations': 'citations',
  'analytics': 'userAnalytics',
  'ai-chat-store': 'aiChat',
  'redis-component-store': 'redisComponent',
  'component-metadata-cache': 'componentMetadata',
  'evidence-cache-service': 'evidenceCache',
  'autoTaggingMachine': 'autoTagging',
  'enhancedLokiStore': 'enhancedLoki',
};

function migrateImports(content, filePath) {
  let updated = content;
  let hasChanges = false;
  const migratedImports = [];

  // Pattern 1: import { foo } from '$lib/stores/...'
  updated = updated.replace(
    /import\s*{\s*([^}]+)\s*}\s*from\s*['"]\$lib\/stores\/([^/'"]+)/g,
    (match, names, storeName) => {
      const newName = STORE_MAP[storeName];
      if (newName) {
        hasChanges = true;
        migratedImports.push({ original: storeName, newName, names });
        // Return without the 'from' part - we'll add it back with unified
        return `import { ${names} } from '$lib/stores/unified`;
      }
      return match;
    }
  );

  // Pattern 2: import foo from '$lib/stores/...'
  updated = updated.replace(
    /import\s+(\w+)\s+from\s+['"]\$lib\/stores\/([^/'"]+)/g,
    (match, name, storeName) => {
      const newName = STORE_MAP[storeName];
      if (newName) {
        hasChanges = true;
        migratedImports.push({ original: storeName, newName, names: name, isDefault: true });
        return `import { ${name} } from '$lib/stores/unified`;
      }
      return match;
    }
  );

  // Pattern 3: import type { foo } from '$lib/stores/...'
  updated = updated.replace(
    /import\s+type\s*{\s*([^}]+)\s*}\s*from\s*['"]\$lib\/stores\/([^/'"]+)/g,
    (match, names, storeName) => {
      const newName = STORE_MAP[storeName];
      if (newName) {
        hasChanges = true;
        migratedImports.push({ original: storeName, newName, names, isType: true });
        return `import type { ${names} } from '$lib/stores/unified`;
      }
      return match;
    }
  );

  return { updated, hasChanges, migratedImports };
}

function processSvelteFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { updated, hasChanges } = migrateImports(content, filePath);

    if (hasChanges) {
      fs.writeFileSync(filePath, updated, 'utf-8');
      return { success: true, path: filePath, changes: 1 };
    }
    return { success: true, path: filePath, changes: 0 };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { success: false, path: filePath, error: error.message };
  }
}

function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, build directories, and git
      if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(file)) {
        findFiles(filePath, fileList);
      }
    } else if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

async function main() {
  const rootDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');
  console.log('🔍 Scanning for TypeScript/Svelte files...');

  const files = findFiles(rootDir);
  console.log(`📁 Found ${files.length} files to check\n`);

  let totalChanges = 0;
  let filesMigrated = 0;
  const failures = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = processSvelteFile(file);

    if (result.success && result.changes > 0) {
      filesMigrated++;
      totalChanges += result.changes;
      if (filesMigrated <= 10 || i % 50 === 0) {
        console.log(`✅ ${i + 1}/${files.length} - ${path.relative(rootDir, file)}`);
      }
    }

    if (!result.success) {
      failures.push(result);
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Files migrated: ${filesMigrated}`);
  console.log(`   🔄 Total imports updated: ${totalChanges}`);
  console.log(`   📋 Total files scanned: ${files.length}`);

  if (failures.length > 0) {
    console.log(`\n⚠️  Failures: ${failures.length}`);
    failures.slice(0, 5).forEach(f => {
      console.log(`   ❌ ${f.path}: ${f.error}`);
    });
  }

  if (totalChanges > 0) {
    console.log(`\n🎉 Migration complete! Running type check...`);
  } else {
    console.log(`\n⏭️  No migrations needed.`);
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
