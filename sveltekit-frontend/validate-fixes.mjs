import fs from 'fs';

const files = [
  'src/lib/components/ui/Button.svelte',
  'src/lib/components/ui/Select.svelte',
  'src/lib/components/ui/command/CommandInput.svelte',
  'src/lib/components/ui/command/CommandRoot.svelte',
  'src/lib/components/ui/tabs/TabsRoot.svelte',
  'src/lib/components/ui/tabs/Svelte5Tabs.svelte',
  'src/lib/components/ui/switch/Svelte5Switch.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenu.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuTrigger.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuContent.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuItem.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuRoot.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuSeparator.svelte',
  'src/routes/(app)/all-routes/+page.svelte'
];

console.log('✅ SYNTAX VALIDATION RESULTS:\n');

let totalIssues = 0;
let filesWithIssues = 0;

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');

    // Basic syntax checks
    const issues = [];

    // Check for missing closing parentheses in addEventListener
    if (content.includes('addEventListener') && content.match(/addEventListener\([^)]*$\s*}\s*\);/m)) {
      issues.push('addEventListener missing closing parenthesis');
    }

    // Check for template literal spacing issues (${  var  })
    const badTemplates = content.match(/\$\{\s{2,}\w+\s{2,}\}/g);
    if (badTemplates) {
      issues.push(`Template literal extra spacing: ${badTemplates.length} occurrences`);
    }

    // Check for CSS pseudo-class spacing (focus: border instead of focus:border)
    const badCSS = content.match(/(focus|hover|active|disabled|placeholder):\s+[a-z-]/gi);
    if (badCSS) {
      issues.push(`CSS pseudo-class spacing: ${badCSS.length} occurrences`);
    }

    // Check for bits-ui v1 imports (should use v2 component imports)
    const badImport = content.match(/import.*from ['"]bits-ui['"]\s*;/);
    if (badImport && !file.includes('enhanced-bits')) {
      issues.push('Using bits-ui v1 barrel import (should be bits-ui/components/*)');
    }

    // Check for function parameter comma errors
    const badParams = content.match(/function\s+\w+\s*\([^)]*\w+:\s*\w+\s+\w+:\s*\w+[^),]/g);
    if (badParams) {
      issues.push(`Missing commas in function parameters: ${badParams.length} occurrences`);
    }

    // Check for template literal spacing in class attributes
    const badClassSpacing = content.match(/class=["'].*\{\s+\w+\s+\}/g);
    if (badClassSpacing) {
      issues.push(`Template literal spacing in class attributes: ${badClassSpacing.length} occurrences`);
    }

    if (issues.length === 0) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file}`);
      issues.forEach(i => console.log(`   - ${i}`));
      filesWithIssues++;
      totalIssues += issues.length;
    }
  } catch (err) {
    console.log(`⚠️  ${file} - ${err.message}`);
  }
});

console.log(`\n📊 SUMMARY:`);
console.log(`Total files checked: ${files.length}`);
console.log(`Files with issues: ${filesWithIssues}`);
console.log(`Total issues found: ${totalIssues}`);
console.log(`Pass rate: ${(((files.length - filesWithIssues) / files.length) * 100).toFixed(1)}%`);
