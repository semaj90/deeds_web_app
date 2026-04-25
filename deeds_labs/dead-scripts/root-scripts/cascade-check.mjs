import fs from 'fs';
import path from 'path';

/**
 * Cascade Effect Checker - Identifies components needing bits-ui v2 migration
 */

const componentFamilies = {
  Select: 'sveltekit-frontend/src/lib/components/ui/select',
  Tooltip: 'sveltekit-frontend/src/lib/components/ui',
  Label: 'sveltekit-frontend/src/lib/components/ui/label',
  Checkbox: 'sveltekit-frontend/src/lib/components/ui/checkbox',
  RadioGroup: 'sveltekit-frontend/src/lib/components/ui/radio-group',
  Accordion: 'sveltekit-frontend/src/lib/components/ui/accordion',
  Collapsible: 'sveltekit-frontend/src/lib/components/ui/collapsible',
  ContextMenu: 'sveltekit-frontend/src/lib/components/ui/context-menu',
  Menubar: 'sveltekit-frontend/src/lib/components/ui/menubar',
  NavigationMenu: 'sveltekit-frontend/src/lib/components/ui/navigation-menu',
  Slider: 'sveltekit-frontend/src/lib/components/ui/slider',
  Toggle: 'sveltekit-frontend/src/lib/components/ui/toggle',
  ToggleGroup: 'sveltekit-frontend/src/lib/components/ui/toggle-group',
  Separator: 'sveltekit-frontend/src/lib/components/ui/separator',
  ScrollArea: 'sveltekit-frontend/src/lib/components/ui/scroll-area',
  AspectRatio: 'sveltekit-frontend/src/lib/components/ui/aspect-ratio',
  Avatar: 'sveltekit-frontend/src/lib/components/ui/avatar',
  Badge: 'sveltekit-frontend/src/lib/components/ui/badge',
  Calendar: 'sveltekit-frontend/src/lib/components/ui/calendar',
  Combobox: 'sveltekit-frontend/src/lib/components/ui/combobox',
  DatePicker: 'sveltekit-frontend/src/lib/components/ui/date-picker',
  Pagination: 'sveltekit-frontend/src/lib/components/ui/pagination',
  Progress: 'sveltekit-frontend/src/lib/components/ui/progress',
  RangeCalendar: 'sveltekit-frontend/src/lib/components/ui/range-calendar',
  Toolbar: 'sveltekit-frontend/src/lib/components/ui/toolbar',
  TreeView: 'sveltekit-frontend/src/lib/components/ui/tree-view',
};

function findSvelteFiles(dir) {
  const results = [];

  try {
    if (!fs.existsSync(dir)) {
      return results;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...findSvelteFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist, skip
  }

  return results;
}

function analyzeBitsUIImport(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for barrel import (bits-ui v1)
    const barrelImportMatch = content.match(/import\s+.*\s+from\s+['"]bits-ui['"]/);

    // Check for component import (bits-ui v2)
    const componentImportMatch = content.match(/import\s+.*\s+from\s+['"]bits-ui\/components\/([^'"]+)['"]/);

    // Check for syntax issues
    const issues = [];

    // CSS pseudo-class spacing
    const badCSS = content.match(/(focus|hover|active|disabled|placeholder):\s+[a-z-]/gi);
    if (badCSS) {
      issues.push(`CSS spacing: ${badCSS.length}`);
    }

    // Template literal spacing
    const badTemplates = content.match(/\$\{\s{2,}\w+\s{2,}\}/g);
    if (badTemplates) {
      issues.push(`Template spacing: ${badTemplates.length}`);
    }

    return {
      hasBarrelImport: !!barrelImportMatch,
      hasComponentImport: !!componentImportMatch,
      componentName: componentImportMatch?.[1],
      issues,
      importLine: barrelImportMatch?.[0] || componentImportMatch?.[0]
    };
  } catch (err) {
    return { error: err.message };
  }
}

console.log('🔍 CASCADE EFFECT CHECKER - bits-ui v2 Migration Status\n');
console.log('=' .repeat(80) + '\n');

const results = {
  needsMigration: [],
  alreadyMigrated: [],
  noImport: [],
  errors: []
};

// Check single files
const singleFiles = [
  'src/lib/components/ui/Tooltip.svelte',
  'src/lib/components/ui/EvidenceCanvas.svelte',
  'src/lib/components/ui/AIDropdown.svelte',
];

for (const file of singleFiles) {
  const analysis = analyzeBitsUIImport(file);

  if (analysis.error) {
    results.errors.push({ file, error: analysis.error });
  } else if (analysis.hasBarrelImport) {
    results.needsMigration.push({ file, ...analysis });
  } else if (analysis.hasComponentImport) {
    results.alreadyMigrated.push({ file, ...analysis });
  } else {
    results.noImport.push(file);
  }
}

// Check component families
for (const [familyName, familyPath] of Object.entries(componentFamilies)) {
  const files = findSvelteFiles(familyPath);

  for (const file of files) {
    // Skip backup directories
    if (file.includes('.backup') || file.includes('_archive')) {
      continue;
    }

    const analysis = analyzeBitsUIImport(file);

    if (analysis.error) {
      results.errors.push({ file, error: analysis.error });
    } else if (analysis.hasBarrelImport) {
      results.needsMigration.push({ file, familyName, ...analysis });
    } else if (analysis.hasComponentImport) {
      results.alreadyMigrated.push({ file, familyName, ...analysis });
    } else {
      results.noImport.push(file);
    }
  }
}

// Report Results
console.log('📊 MIGRATION STATUS SUMMARY\n');

if (results.needsMigration.length > 0) {
  console.log(`🔴 NEEDS MIGRATION (${results.needsMigration.length} files):`);
  console.log('-'.repeat(80));

  const byFamily = {};
  results.needsMigration.forEach(r => {
    const family = r.familyName || 'Standalone';
    if (!byFamily[family]) byFamily[family] = [];
    byFamily[family].push(r);
  });

  for (const [family, files] of Object.entries(byFamily)) {
    console.log(`\n  ${family} (${files.length} files):`);
    files.forEach(f => {
      const relativePath = f.file.replace(/\\/g, '/').split('src/lib/components/ui/')[1] || f.file;
      console.log(`    ❌ ${relativePath}`);
      if (f.issues.length > 0) {
        console.log(`       └─ Additional issues: ${f.issues.join(', ')}`);
      }
    });
  }
  console.log();
}

if (results.alreadyMigrated.length > 0) {
  console.log(`\n✅ ALREADY MIGRATED (${results.alreadyMigrated.length} files):`);
  console.log('-'.repeat(80));

  const migrated = results.alreadyMigrated.slice(0, 10);
  migrated.forEach(r => {
    const relativePath = r.file.replace(/\\/g, '/').split('src/lib/components/ui/')[1] || r.file;
    console.log(`  ✓ ${relativePath} → bits-ui/components/${r.componentName}`);
  });

  if (results.alreadyMigrated.length > 10) {
    console.log(`  ... and ${results.alreadyMigrated.length - 10} more`);
  }
  console.log();
}

if (results.errors.length > 0) {
  console.log(`\n⚠️  ERRORS (${results.errors.length} files):`);
  console.log('-'.repeat(80));
  results.errors.slice(0, 5).forEach(r => {
    console.log(`  ⚠️  ${r.file}: ${r.error}`);
  });
  console.log();
}

// Calculate cascade multiplier
const totalNeedingMigration = results.needsMigration.length;
const familiesNeedingMigration = new Set(results.needsMigration.map(r => r.familyName || 'Standalone')).size;

console.log('\n' + '='.repeat(80));
console.log('📈 CASCADE EFFECT ANALYSIS\n');
console.log(`Total files needing migration: ${totalNeedingMigration}`);
console.log(`Component families affected: ${familiesNeedingMigration}`);
console.log(`Average files per family: ${(totalNeedingMigration / familiesNeedingMigration).toFixed(1)}`);
console.log(`\nCascade Multiplier: ${(totalNeedingMigration / Math.max(1, familiesNeedingMigration)).toFixed(1)}x`);
console.log(`(Fixing 1 parent component fixes ~${(totalNeedingMigration / Math.max(1, familiesNeedingMigration)).toFixed(0)} total files)\n`);

// Priority list
if (results.needsMigration.length > 0) {
  console.log('🎯 PRIORITY MIGRATION TARGETS (High Impact):');
  console.log('-'.repeat(80));

  const byFamily = {};
  results.needsMigration.forEach(r => {
    const family = r.familyName || 'Standalone';
    if (!byFamily[family]) byFamily[family] = [];
    byFamily[family].push(r);
  });

  const sorted = Object.entries(byFamily)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  sorted.forEach(([family, files], index) => {
    console.log(`\n${index + 1}. ${family} - ${files.length} files`);
    console.log(`   Impact: Fixing parent will cascade to ${files.length} sub-components`);
    console.log(`   Priority: ${'⭐'.repeat(Math.min(5, Math.ceil(files.length / 2)))}`);
  });
  console.log();
}

console.log('='.repeat(80));
console.log(`\n✨ Migration Progress: ${results.alreadyMigrated.length}/${results.alreadyMigrated.length + results.needsMigration.length} (${((results.alreadyMigrated.length / Math.max(1, results.alreadyMigrated.length + results.needsMigration.length)) * 100).toFixed(1)}%)\n`);
