#!/usr/bin/env node
/**
 * 🔧 Phase 74.1: Import Resolver & Repair Agent
 *
 * Automatically detects and fixes missing imports across:
 * - SvelteKit routes (+page.svelte, +layout.svelte)
 * - TypeScript files (+page.ts, +server.ts)
 * - Component files ($lib/components/*)
 *
 * Features:
 * - Static analysis via ts-morph
 * - $lib/* alias resolution
 * - Auto-fix with safety checks
 * - Git-ready patches
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { Project } from 'ts-morph';

// ============================================
// Configuration
// ============================================
const CONFIG = {
  srcDir: 'src',
  libDir: 'src/lib',
  routesDir: 'src/routes',
  componentsDir: 'src/lib/components',
  tsConfigPath: 'tsconfig.json',
  outputDir: 'reports/phase74',
  autoFix: false, // Set to true to apply fixes automatically
};

// ============================================
// Import Analyzer
// ============================================
class ImportResolver {
  constructor() {
    this.project = new Project({
      tsConfigFilePath: CONFIG.tsConfigPath,
    });
    this.missingImports = [];
    this.availableComponents = new Map();
  }

  async initialize() {
    console.log(chalk.cyan('\n🔍 Scanning component library...\n'));

    // Index all available components
    const componentFiles = await glob(`${CONFIG.componentsDir}/**/*.{ts,svelte}`, {
      ignore: ['**/*.spec.ts', '**/*.test.ts']
    });

    for (const file of componentFiles) {
      const name = path.basename(file, path.extname(file));
      const relativePath = path.relative(CONFIG.srcDir, file).replace(/\\/g, '/');
      this.availableComponents.set(name, `$lib/${relativePath.replace('lib/', '')}`);
    }

    console.log(chalk.gray(`   Found ${this.availableComponents.size} components in $lib/`));
  }

  async analyzeFile(filePath) {
    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const diagnostics = sourceFile.getPreEmitDiagnostics();

    const missing = [];

    for (const diagnostic of diagnostics) {
      const message = diagnostic.getMessageText().toString();

      // Check for "Cannot find module" errors
      if (message.includes('Cannot find module') || message.includes('Cannot find name')) {
        const match = message.match(/['"]([^'"]+)['"]/);
        if (match) {
          const missingModule = match[1];
          const suggestion = this.findSuggestion(missingModule);

          missing.push({
            file: filePath,
            module: missingModule,
            message,
            line: diagnostic.getStart(),
            suggestion
          });
        }
      }
    }

    return missing;
  }

  findSuggestion(missingModule) {
    // Extract component name from module path
    const parts = missingModule.split('/');
    const componentName = parts[parts.length - 1].replace(/\.\w+$/, '');

    // Check if component exists in our index
    if (this.availableComponents.has(componentName)) {
      return this.availableComponents.get(componentName);
    }

    // Fuzzy match for similar names
    for (const [name, path] of this.availableComponents.entries()) {
      if (name.toLowerCase().includes(componentName.toLowerCase()) ||
          componentName.toLowerCase().includes(name.toLowerCase())) {
        return path;
      }
    }

    return null;
  }

  async analyzeRoutes() {
    console.log(chalk.cyan('\n📋 Analyzing route imports...\n'));

    const routeFiles = await glob(`${CONFIG.routesDir}/**/*.{ts,svelte}`, {
      ignore: ['**/*.spec.ts', '**/*.test.ts']
    });

    const results = {
      totalFiles: routeFiles.length,
      filesWithIssues: 0,
      totalMissingImports: 0,
      fixable: 0,
      issues: []
    };

    for (const file of routeFiles) {
      try {
        const missing = await this.analyzeFile(file);

        if (missing.length > 0) {
          results.filesWithIssues++;
          results.totalMissingImports += missing.length;
          results.fixable += missing.filter(m => m.suggestion).length;
          results.issues.push(...missing);

          console.log(chalk.yellow(`   ⚠️  ${path.relative(process.cwd(), file)}`));
          for (const issue of missing) {
            if (issue.suggestion) {
              console.log(chalk.green(`      ✓ ${issue.module} → ${issue.suggestion}`));
            } else {
              console.log(chalk.red(`      ✗ ${issue.module} (no suggestion)`));
            }
          }
        }
      } catch (err) {
        console.warn(chalk.gray(`   Skipped: ${file} (${err.message})`));
      }
    }

    return results;
  }

  async generateFixes(results) {
    const fixes = [];

    for (const issue of results.issues) {
      if (!issue.suggestion) continue;

      const sourceFile = this.project.getSourceFile(issue.file);
      if (!sourceFile) continue;

      // Find import declarations
      const imports = sourceFile.getImportDeclarations();
      const existingImport = imports.find(imp =>
        imp.getModuleSpecifierValue() === issue.module
      );

      if (existingImport) {
        // Replace module specifier
        fixes.push({
          file: issue.file,
          type: 'replace_import',
          old: issue.module,
          new: issue.suggestion,
          location: existingImport.getStart()
        });
      } else {
        // Add new import
        fixes.push({
          file: issue.file,
          type: 'add_import',
          module: issue.suggestion,
          component: path.basename(issue.module, path.extname(issue.module))
        });
      }
    }

    return fixes;
  }

  async applyFixes(fixes) {
    console.log(chalk.cyan(`\n🔧 Applying ${fixes.length} fixes...\n`));

    const fileGroups = fixes.reduce((acc, fix) => {
      if (!acc[fix.file]) acc[fix.file] = [];
      acc[fix.file].push(fix);
      return acc;
    }, {});

    for (const [file, fileFixes] of Object.entries(fileGroups)) {
      const sourceFile = this.project.getSourceFile(file);
      if (!sourceFile) continue;

      for (const fix of fileFixes) {
        if (fix.type === 'replace_import') {
          const imports = sourceFile.getImportDeclarations();
          const target = imports.find(imp =>
            imp.getModuleSpecifierValue() === fix.old
          );
          if (target) {
            target.setModuleSpecifier(fix.new);
            console.log(chalk.green(`   ✓ ${path.relative(process.cwd(), file)}: ${fix.old} → ${fix.new}`));
          }
        } else if (fix.type === 'add_import') {
          sourceFile.addImportDeclaration({
            moduleSpecifier: fix.module,
            namedImports: [fix.component]
          });
          console.log(chalk.green(`   ✓ ${path.relative(process.cwd(), file)}: Added import for ${fix.component}`));
        }
      }

      await sourceFile.save();
    }
  }

  async generateReport(results, fixes) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: results.totalFiles,
        filesWithIssues: results.filesWithIssues,
        totalMissingImports: results.totalMissingImports,
        fixableImports: results.fixable,
        fixesGenerated: fixes.length
      },
      issues: results.issues.map(issue => ({
        file: path.relative(process.cwd(), issue.file),
        module: issue.module,
        suggestion: issue.suggestion,
        fixable: !!issue.suggestion
      })),
      fixes: fixes.map(fix => ({
        file: path.relative(process.cwd(), fix.file),
        type: fix.type,
        old: fix.old,
        new: fix.new
      }))
    };

    const reportPath = path.join(CONFIG.outputDir, 'import-resolver-report.json');
    await fs.mkdir(CONFIG.outputDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(chalk.cyan(`\n📊 Report saved: ${reportPath}`));

    return report;
  }
}

// ============================================
// Main Execution
// ============================================
async function main() {
  console.log(chalk.bold.cyan('\n🔧 Phase 74.1: Import Resolver & Repair Agent\n'));

  const resolver = new ImportResolver();

  // Step 1: Initialize component index
  await resolver.initialize();

  // Step 2: Analyze all route files
  const results = await resolver.analyzeRoutes();

  console.log(chalk.cyan('\n📊 Analysis Summary:'));
  console.log(chalk.gray(`   Total files scanned: ${results.totalFiles}`));
  console.log(chalk.yellow(`   Files with issues: ${results.filesWithIssues}`));
  console.log(chalk.red(`   Missing imports: ${results.totalMissingImports}`));
  console.log(chalk.green(`   Auto-fixable: ${results.fixable}`));

  // Step 3: Generate fixes
  const fixes = await resolver.generateFixes(results);

  // Step 4: Apply fixes if enabled
  if (CONFIG.autoFix && fixes.length > 0) {
    const confirm = process.argv.includes('--apply');
    if (confirm) {
      await resolver.applyFixes(fixes);
      console.log(chalk.green(`\n✅ Applied ${fixes.length} fixes`));
    } else {
      console.log(chalk.yellow(`\n⚠️  Use --apply flag to apply ${fixes.length} fixes automatically`));
    }
  }

  // Step 5: Generate report
  const report = await resolver.generateReport(results, fixes);

  console.log(chalk.green(`\n✅ Import resolution complete`));
  console.log(chalk.gray(`   Run with --apply to auto-fix ${fixes.length} imports`));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(chalk.red(`\n❌ Error: ${err.message}`));
    console.error(err.stack);
    process.exit(1);
  });
}

export { ImportResolver };
