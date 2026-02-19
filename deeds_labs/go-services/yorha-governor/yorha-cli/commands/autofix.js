const { ComplianceEngine } = require('../../phase72-mcp-ui-governor/analysis/complianceEngine');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer').default || require('inquirer');

function registerAutofixCommand(program) {
  program
    .command('autofix')
    .description('Apply automated fixes to UI issues')
    .option('-i, --input <file>', 'analysis results file', './yorha-reports/analysis-results.json')
    .option('-p, --patches <dir>', 'patches directory', './yorha-patches')
    .option('--backup', 'create backup before applying fixes', true)
    .option('--backup-dir <dir>', 'backup directory', './yorha-backups')
    .option('--dry-run', 'show what would be fixed without making changes')
    .option('--force', 'apply fixes without confirmation prompts')
    .option('--filter <types>', 'comma-separated list of issue types to fix', 'accessibility,semantic')
    .option('--max-fixes <num>', 'maximum number of fixes to apply', 50)
    .option('--risk-level <level>', 'risk level (low, medium, high)', 'medium')
    .action(async (options) => {
      const spinner = ora('Preparing automated fixes...').start();

      try {
        // Validate input files
        if (!await fs.pathExists(options.input)) {
          spinner.fail(`Analysis results not found: ${options.input}`);
          process.exit(1);
        }

        if (!await fs.pathExists(options.patches)) {
          spinner.fail(`Patches directory not found: ${options.patches}`);
          console.log(chalk.yellow('💡 Tip: Run "yorha patch" first to generate patches'));
          process.exit(1);
        }

        // Load analysis results and patches
        const analysisResults = await fs.readJson(options.input);
        const patchManifestPath = path.join(options.patches, 'patch-manifest.json');

        if (!await fs.pathExists(patchManifestPath)) {
          spinner.fail('Patch manifest not found');
          process.exit(1);
        }

        const patchManifest = await fs.readJson(patchManifestPath);

        spinner.text = `Found ${patchManifest.patches.length} patches to apply...`;

        // Filter patches by type and risk level
        const filterTypes = options.filter.split(',').map(t => t.trim());
        const riskThresholds = {
          low: ['missing-alt', 'missing-lang'],
          medium: ['missing-alt', 'missing-lang', 'low-contrast', 'non-semantic-div'],
          high: ['missing-alt', 'missing-lang', 'low-contrast', 'non-semantic-div', 'missing-label', 'blocking-script']
        };

        const allowedRules = riskThresholds[options.riskLevel] || riskThresholds.medium;

        const applicablePatches = patchManifest.patches
          .filter(patch => filterTypes.includes(patch.type))
          .filter(patch => {
            // Load patch content to check rule
            const patchFile = path.join(options.patches, patch.file.replace('.patch', '.json'));
            try {
              const patchContent = fs.readJsonSync(patchFile);
              return allowedRules.includes(patchContent.fix?.rule || patch.rule);
            } catch {
              return false;
            }
          })
          .slice(0, options.maxFixes);

        if (applicablePatches.length === 0) {
          spinner.succeed('No applicable patches found');
          return;
        }

        spinner.succeed(`Ready to apply ${applicablePatches.length} fixes`);

        // Display fix summary
        console.log(chalk.blue('\n🔧 Autofix Summary:'));
        console.log(`  📄 Fixes to Apply: ${chalk.cyan(applicablePatches.length)}`);
        console.log(`  🎯 Risk Level: ${chalk.yellow(options.riskLevel)}`);
        console.log(`  📁 Backup: ${chalk.cyan(options.backup ? 'Enabled' : 'Disabled')}`);

        const fixesByType = applicablePatches.reduce((acc, patch) => {
          acc[patch.type] = (acc[patch.type] || 0) + 1;
          return acc;
        }, {});

        Object.entries(fixesByType).forEach(([type, count]) => {
          console.log(`  ${getTypeIcon(type)} ${type}: ${chalk.cyan(count)}`);
        });

        // Handle dry run
        if (options.dryRun) {
          console.log(chalk.yellow('\n🔍 Dry run - showing fixes that would be applied:'));
          await displayFixes(applicablePatches, options.patches);
          return;
        }

        // Confirmation prompt
        if (!options.force) {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Apply ${applicablePatches.length} automated fixes?`,
            default: false
          }]);

          if (!confirm) {
            console.log('❌ Autofix cancelled');
            return;
          }
        }

        // Create backup if enabled
        if (options.backup) {
          await createBackup(options.backupDir);
        }

        // Apply fixes
        const fixer = new AutoFixer({
          patchesDir: options.patches,
          backupDir: options.backup ? options.backupDir : null
        });

        const results = await fixer.applyFixes(applicablePatches);

        // Display results
        console.log(chalk.blue('\n✅ Autofix Results:'));
        console.log(`  ✅ Applied: ${chalk.green(results.applied)}`);
        console.log(`  ❌ Failed: ${chalk.red(results.failed)}`);
        console.log(`  ⏭️ Skipped: ${chalk.yellow(results.skipped)}`);

        if (results.failed > 0) {
          console.log(chalk.red('\n❌ Failed fixes:'));
          results.failures.forEach(failure => {
            console.log(`  - ${failure.patchId}: ${failure.error}`);
          });
        }

        // Save fix results
        const fixResults = {
          timestamp: new Date().toISOString(),
          config: options,
          summary: results,
          fixes: results.appliedFixes
        };

        const resultsPath = path.join(options.patches, 'autofix-results.json');
        await fs.writeJson(resultsPath, fixResults, { spaces: 2 });

        console.log(`\n💾 Results saved: ${chalk.cyan(resultsPath)}`);

      } catch (error) {
        spinner.fail('Autofix failed');
        console.error(chalk.red('❌ Error:'), error.message);
        if (program.opts().verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

class AutoFixer {
  constructor(options = {}) {
    this.patchesDir = options.patchesDir;
    this.backupDir = options.backupDir;
  }

  async applyFixes(patches) {
    const results = {
      applied: 0,
      failed: 0,
      skipped: 0,
      appliedFixes: [],
      failures: []
    };

    for (const patch of patches) {
      try {
        const applied = await this.applyFix(patch);
        if (applied) {
          results.applied++;
          results.appliedFixes.push({
            patchId: patch.id,
            route: patch.route,
            type: patch.type,
            description: patch.description
          });
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
        results.failures.push({
          patchId: patch.id,
          route: patch.route,
          error: error.message
        });
      }
    }

    return results;
  }

  async applyFix(patch) {
    // Load patch content
    const patchFile = path.join(this.patchesDir, patch.file);
    if (!await fs.pathExists(patchFile)) {
      throw new Error(`Patch file not found: ${patchFile}`);
    }

    const patchContent = await fs.readJson(patchFile);

    // Determine target file (this would need to be mapped from route to actual file)
    const targetFile = await this.mapRouteToFile(patch.route);
    if (!targetFile || !await fs.pathExists(targetFile)) {
      console.warn(`Target file not found for route ${patch.route}`);
      return false;
    }

    // Create backup if enabled
    if (this.backupDir) {
      await this.createFileBackup(targetFile);
    }

    // Apply the fix based on patch type
    const success = await this.applyPatchToFile(targetFile, patchContent);

    return success;
  }

  async mapRouteToFile(route) {
    // This is a simplified mapping - in reality, you'd need a proper route-to-file mapping
    const routeToFileMap = {
      '/': './src/routes/+page.svelte',
      '/about': './src/routes/about/+page.svelte',
      '/contact': './src/routes/contact/+page.svelte'
    };

    return routeToFileMap[route];
  }

  async createFileBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupDir, `${path.basename(filePath)}.${timestamp}.backup`);

    await fs.ensureDir(this.backupDir);
    await fs.copy(filePath, backupFile);

    return backupFile;
  }

  async applyPatchToFile(filePath, patchContent) {
    const content = await fs.readFile(filePath, 'utf8');

    let newContent = content;

    // Apply fix based on patch type
    switch (patchContent.fix?.type) {
      case 'add-attribute':
        newContent = this.addAttribute(content, patchContent);
        break;
      case 'replace-element':
        newContent = this.replaceElement(content, patchContent);
        break;
      case 'add-element':
        newContent = this.addElement(content, patchContent);
        break;
      case 'update-style':
        newContent = this.updateStyle(content, patchContent);
        break;
      default:
        console.warn(`Unknown fix type: ${patchContent.fix?.type}`);
        return false;
    }

    // Only write if content changed
    if (newContent !== content) {
      await fs.writeFile(filePath, newContent, 'utf8');
      return true;
    }

    return false;
  }

  addAttribute(content, patch) {
    const { attribute, value } = patch.fix;
    const element = patch.issue?.element || 'img';

    // Simple regex replacement - in production, use proper AST parsing
    const regex = new RegExp(`(<${element}[^>]*)(>)`, 'gi');
    return content.replace(regex, `$1 ${attribute}="${value}"$2`);
  }

  replaceElement(content, patch) {
    const { from, to, attributes = {} } = patch.fix;
    const attrString = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const fromRegex = new RegExp(`<${from}`, 'gi');
    const toTag = `<${to}${attrString ? ' ' + attrString : ''}`;

    return content.replace(fromRegex, toTag);
  }

  addElement(content, patch) {
    const { element, content: elementContent, attributes = {} } = patch.fix;
    const attrString = Object.entries(attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const newElement = `<${element}${attrString ? ' ' + attrString : ''}>${elementContent || ''}</${element}>`;

    // Simple insertion at the beginning of body - in production, use proper placement logic
    return content.replace(/(<body[^>]*>)/i, `$1\n  ${newElement}`);
  }

  updateStyle(content, patch) {
    const { property, value } = patch.fix;

    // Simple style update - in production, use proper CSS parsing
    const styleRegex = new RegExp(`(${property}\\s*:\\s*)[^;]+`, 'gi');
    return content.replace(styleRegex, `$1${value}`);
  }
}

async function createBackup(backupDir) {
  const spinner = ora('Creating backup...').start();

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}`);

    // Backup key directories
    const dirsToBackup = ['src', 'routes', 'components', 'lib'];

    for (const dir of dirsToBackup) {
      if (await fs.pathExists(dir)) {
        await fs.copy(dir, path.join(backupPath, dir));
      }
    }

    spinner.succeed(`Backup created: ${backupPath}`);
    return backupPath;

  } catch (error) {
    spinner.fail('Backup creation failed');
    throw error;
  }
}

async function displayFixes(patches, patchesDir) {
  for (const patch of patches) {
    console.log(chalk.blue(`\n🔧 ${patch.type.toUpperCase()} Fix for ${patch.route}:`));
    console.log(`   ${patch.description}`);

    // Load and display patch content
    try {
      const patchFile = path.join(patchesDir, patch.file);
      const patchContent = await fs.readJson(patchFile);

      console.log(chalk.gray(`   Fix: ${JSON.stringify(patchContent.fix, null, 2)}`));
    } catch (error) {
      console.log(chalk.red(`   Error loading patch: ${error.message}`));
    }
  }
}

function getTypeIcon(type) {
  const icons = {
    accessibility: '♿',
    semantic: '🏷️',
    performance: '⚡',
    security: '🔒'
  };
  return icons[type] || '🔧';
}

module.exports = registerAutofixCommand;