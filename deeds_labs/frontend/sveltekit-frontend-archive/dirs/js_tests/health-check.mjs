#!/usr/bin/env node

/**
 * Quick Health Check for Detective Mode Application
 * Verifies critical components and functionality
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

console.log('🔍 Detective Mode - Quick Health Check\n');

const checks = [
  {
    name: 'File Structure',
    test: () => {
      const criticalFiles = [
        'src/routes/+layout.svelte',
        'src/routes/dashboard/+page.svelte',
        'src/routes/cases/+page.svelte',
        'src/routes/evidence/+page.svelte',
        'src/routes/legal/documents/+page.svelte',
        'src/lib/components/ui/index.ts',
        'package.json',
      ];

      const missing = criticalFiles.filter((file) => !existsSync(file));
      if (missing.length > 0) {
        throw new Error(`Missing files: ${missing.join(', ')}`);
      }
      return 'All critical files present';
    },
  },
  {
    name: 'Package Configuration',
    test: () => {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      const requiredDeps = ['@sveltejs/kit', 'svelte', 'drizzle-orm', 'lucide-svelte', 'bits-ui'];

      const missing = requiredDeps.filter(
        (dep) => !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      );

      if (missing.length > 0) {
        throw new Error(`Missing dependencies: ${missing.join(', ')}`);
      }
      return `${Object.keys(packageJson.dependencies || {}).length} dependencies configured`;
    },
  },
  {
    name: 'Enhanced Cases Page',
    test: () => {
      const casesFile = readFileSync('src/routes/cases/+page.svelte', 'utf8');
      const features = [
        'FocusManager',
        'exportData',
        'bulkOperation',
        'filterAndSortCases',
        'accessibility',
        'announceToScreenReader',
      ];

      const missing = features.filter((feature) => !casesFile.includes(feature));
      if (missing.length > 0) {
        throw new Error(`Missing features: ${missing.join(', ')}`);
      }
      return 'All enhanced features present';
    },
  },
  {
    name: 'UI Components',
    test: () => {
      const uiIndex = readFileSync('src/lib/components/ui/index.ts', 'utf8');
      const components = ['Button', 'Dialog', 'Input', 'Select', 'Badge', 'Tooltip'];

      const missing = components.filter((comp) => !uiIndex.includes(comp));
      if (missing.length > 0) {
        throw new Error(`Missing UI components: ${missing.join(', ')}`);
      }
      return `${components.length} UI components exported`;
    },
  },
  {
    name: 'Accessibility Features',
    test: () => {
      if (!existsSync('src/lib/utils/accessibility.ts')) {
        throw new Error('Accessibility utilities missing');
      }

      const accessibilityFile = readFileSync('src/lib/utils/accessibility.ts', 'utf8');
      const features = [
        'FocusManager',
        'AccessibilityValidator',
        'announceToScreenReader',
        'checkColorContrast',
      ];

      const missing = features.filter((feature) => !accessibilityFile.includes(feature));
      if (missing.length > 0) {
        throw new Error(`Missing accessibility features: ${missing.join(', ')}`);
      }
      return 'All accessibility features implemented';
    },
  },
  {
    name: 'Security Utilities',
    test: () => {
      if (!existsSync('src/lib/utils/security.ts')) {
        throw new Error('Security utilities missing');
      }

      const securityFile = readFileSync('src/lib/utils/security.ts', 'utf8');
      const features = [
        'validateFile',
        'generateFileHash',
        'checkFileSecurityAI',
        'logSecurityEvent',
      ];

      const missing = features.filter((feature) => !securityFile.includes(feature));
      if (missing.length > 0) {
        throw new Error(`Missing security features: ${missing.join(', ')}`);
      }
      return 'Security utilities implemented';
    },
  },
  {
    name: 'Data Export System',
    test: () => {
      if (!existsSync('src/lib/utils/data-export.ts')) {
        throw new Error('Data export utilities missing');
      }

      const exportFile = readFileSync('src/lib/utils/data-export.ts', 'utf8');
      const features = ['exportData', 'importData', 'ExportFormat', 'validateExportData'];

      const missing = features.filter((feature) => !exportFile.includes(feature));
      if (missing.length > 0) {
        throw new Error(`Missing export features: ${missing.join(', ')}`);
      }
      return 'Data export system implemented';
    },
  },
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  try {
    const result = check.test();
    console.log(`✅ ${check.name}: ${result}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${check.name}: ${error.message}`);
    failed++;
  }
}

console.log(`\n📊 Health Check Results:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Score: ${Math.round((passed / (passed + failed)) * 100)}%\n`);

if (failed === 0) {
  console.log('🎉 All systems operational! Detective Mode is ready to go! 🎉');
  process.exit(0);
} else {
  console.log('⚠️ Some components need attention before production deployment.');
  process.exit(1);
}
