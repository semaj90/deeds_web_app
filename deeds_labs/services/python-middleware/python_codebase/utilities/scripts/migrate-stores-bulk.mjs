#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store migration mappings
const STORE_MIGRATIONS = {
  // Import old module path → new unified import
  'avatarStore': { store: 'userManagement', named: 'avatarStore' },
  'enhanced-rag-store': { store: 'aiFeatures', named: 'enhancedRAG' },
  'evidenceStore': { store: 'evidence', named: 'evidence' },
  'loki|lokiStore': { store: 'dataManagement', named: 'loki' },
  'auth': { store: 'auth', named: 'auth' },
  'auth-store': { store: 'auth', named: 'auth' },
  'auth-store.svelte': { store: 'auth', named: 'auth' },
  'component-adapter-store': { store: 'adaptation', named: 'componentAdapter' },
  'xstate-service-adapter': { store: 'stateManagement', named: 'xstateServiceAdapter' },
  'aiRecommendations': { store: 'aiFeatures', named: 'recommendations' },
  'redis-orchestrator-store': { store: 'caching', named: 'redisOrchestrator' },
  'user': { store: 'userManagement', named: 'user' },
  'evidenceStore|evidence-unified': { store: 'evidence', named: 'evidence' },
  'notification': { store: 'notifications', named: 'notifications' },
  'ai': { store: 'aiFeatures', named: 'aiGlobal' },
  'ai-assistant-unified': { store: 'aiFeatures', named: 'aiAssistant' },
  'ai-assistant': { store: 'aiFeatures', named: 'aiAssistant' },
  'ai-assistant.svelte': { store: 'aiFeatures', named: 'aiAssistant' },
  'evidence-workflow': { store: 'evidence', named: 'evidenceWorkflow' },
  'ai-assistant-unified.svelte': { store: 'aiFeatures', named: 'aiAssistant' },
  'websocket-store': { store: 'collaboration', named: 'websocket' },
  'websocket-store.svelte': { store: 'collaboration', named: 'websocket' },
  'legal-case|legal-case-store': { store: 'legalCases', named: 'legalCase' },
  'legal-case.store.svelte': { store: 'legalCases', named: 'legalCase' },
  'aiHistoryStore': { store: 'aiFeatures', named: 'aiHistory' },
  'caseStore': { store: 'legalCases', named: 'cases' },
  'analyticsStore': { store: 'analytics', named: 'analytics' },
  'report': { store: 'documentation', named: 'report' },
  'evidence-stores': { store: 'evidence', named: 'evidenceHierarchy' },
  'alerts': { store: 'notifications', named: 'alerts' },
  'evidence': { store: 'evidence', named: 'evidence' },
  'chat': { store: 'communication', named: 'chat' },
  'chat.svelte': { store: 'communication', named: 'chat' },
  'enhanced-upload-machine': { store: 'fileManagement', named: 'enhancedUpload' },
  'machines': { store: 'stateManagement', named: 'machines' },
  'feedback-store.svelte': { store: 'feedback', named: 'feedback' },
  'evidence-store': { store: 'evidence', named: 'evidenceStore' },
  'upload-machine': { store: 'fileManagement', named: 'upload' },
  'userDataStore.svelte': { store: 'userManagement', named: 'userData' },
  'canvas': { store: 'visualization', named: 'canvas' },
  'citations': { store: 'documentation', named: 'citations' },
  'analytics': { store: 'analytics', named: 'userAnalytics' },
  'ai-chat-store': { store: 'aiFeatures', named: 'aiChat' },
  'redis-component-store': { store: 'caching', named: 'redisComponent' },
  'component-metadata-cache': { store: 'caching', named: 'componentMetadata' },
  'evidence-cache-service': { store: 'caching', named: 'evidenceCache' },
  'autoTaggingMachine': { store: 'stateManagement', named: 'autoTagging' },
  'enhancedLokiStore': { store: 'dataManagement', named: 'enhancedLoki' },
};

const IMPORT_PATTERNS = [
  // Import named exports
  /import\s*{\s*([^}]+)\s*}\s*from\s*['"](.*?)['"];/g,
  // Import default
  /import\s+(\w+)\s+from\s*['"](.*?)['"];/g,
  // Import as
  /import\s*{\s*([^}]*?)\s+as\s+(\w+)([^}]*?)}\s*from\s*['"](.*?)['"];/g,
];

function parseStorePath(importPath) {
  const match = importPath.match(/\$lib\/stores\/([^/'"]+)/);
  return match ? match[1] : null;
}

function getStoreInfo(storeName) {
  // Handle pipe-separated patterns
  for (const [pattern, info] of Object.entries(STORE_MIGRATIONS)) {
    const patterns = pattern.split('|');
    if (patterns.includes(storeName)) {
      return info;
    }
  }
  return null;
}

function migrateComponentImports(content, filePath) {
  let updated = content;
  let hasChanges = false;

  // Find all import statements
  const importRegex = /import\s*({[^}]*}|\w+)\s+from\s*['"]([^'"]+)['"];/g;
  let match;
  const imports = [];

  while ((match = importRegex.exec(content)) !== null) {
    const [fullImport, names, importPath] = match;
    const storeName = parseStorePath(importPath);

    if (storeName && importPath.includes('$lib/stores/')) {
      const storeInfo = getStoreInfo(storeName);
      if (storeInfo) {
        imports.push({
          original: fullImport,
          names,
          storeName,
          storeInfo,
          importPath,
        });
        hasChanges = true;
      }
    }
  }

  // Group imports by store
  const groupedImports = {};
  imports.forEach(imp => {
    const key = imp.storeInfo.store;
    if (!groupedImports[key]) {
      groupedImports[key] = [];
    }
    groupedImports[key].push(imp);
  });

  // Replace imports - deduplicate if we're replacing multiple from same store
  const replacedImports = new Set();
  Object.entries(groupedImports).forEach(([storeName, importsForStore]) => {
    importsForStore.forEach(imp => {
      if (!replacedImports.has(imp.original)) {
        // Extract the imported names, removing any duplicate braces
        let names = imp.names.replace(/^{|{$/g, '').trim();
        const newImport = `import { ${names} } from '$lib/stores/unified';`;
        updated = updated.replace(imp.original, newImport);
        replacedImports.add(imp.original);
      }
    });
  });

  return { updated, hasChanges };
}

function processSvelteFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { updated, hasChanges } = migrateComponentImports(content, filePath);

    if (hasChanges) {
      fs.writeFileSync(filePath, updated, 'utf-8');
      return { success: true, path: filePath, changes: 1 };
    }
    return { success: true, path: filePath, changes: 0 };
  } catch (error) {
    return { success: false, path: filePath, error: error.message };
  }
}

function findSvelteFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and build directories
      if (!['node_modules', '.svelte-kit', 'build', 'dist'].includes(file)) {
        findSvelteFiles(filePath, fileList);
      }
    } else if (file.endsWith('.svelte') || file.endsWith('.ts') || file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

async function main() {
  const rootDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');
  console.log('🔍 Scanning for Svelte files...');

  const files = findSvelteFiles(rootDir);
  console.log(`📁 Found ${files.length} files to check\n`);

  let totalChanges = 0;
  const results = [];

  files.forEach((file, index) => {
    const result = processSvelteFile(file);
    if (result.changes > 0) {
      console.log(`✅ ${index + 1}/${files.length} - ${result.path} (${result.changes} import(s) fixed)`);
      totalChanges += result.changes;
      results.push(result);
    }
  });

  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Files migrated: ${results.length}`);
  console.log(`   🔄 Total imports updated: ${totalChanges}`);
  console.log(`   📋 Total files scanned: ${files.length}`);

  if (totalChanges > 0) {
    console.log(`\n🎉 Migration complete! Run: npm run check`);
  } else {
    console.log(`\n⏭️  No migrations needed.`);
  }
}

main().catch(console.error);
