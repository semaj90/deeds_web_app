const { ComplianceEngine } = require('../../phase72-mcp-ui-governor/analysis/complianceEngine');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer').default || require('inquirer');

function registerPatchCommand(program) {
  program
    .command('patch')
    .description('Generate automated fixes for UI issues')
    .option('-i, --input <file>', 'analysis results file', './yorha-reports/analysis-results.json')
    .option('-o, --output <dir>', 'output directory for patches', './yorha-patches')
    .option('--format <type>', 'patch format (json, diff, unified)', 'json')
    .option('--auto-apply', 'automatically apply patches (dangerous!)', false)
    .option('--dry-run', 'show what would be patched without making changes')
    .option('--interactive', 'prompt for confirmation before applying patches')
    .option('--filter <types>', 'comma-separated list of issue types to patch', 'accessibility,semantic')
    .option('--min-score <score>', 'minimum compliance score to patch', 0)
    .action(async (options) => {
      const spinner = ora('Generating patches...').start();

      try {
        // Validate input file
        if (!await fs.pathExists(options.input)) {
          spinner.fail(`Analysis results not found: ${options.input}`);
          console.log(chalk.yellow('💡 Tip: Run "yorha analyze" first to generate analysis results'));
          process.exit(1);
        }

        // Load analysis results
        const analysisResults = await fs.readJson(options.input);
        const routesWithIssues = analysisResults.routes.filter(route =>
          route.overallScore >= options.minScore &&
          route.analyses.compliance &&
          route.analyses.compliance.issues.length > 0
        );

        if (routesWithIssues.length === 0) {
          spinner.succeed('No routes found that need patching');
          return;
        }

        spinner.text = `Generating patches for ${routesWithIssues.length} routes...`;

        // Create output directory
        await fs.ensureDir(options.output);

        // Initialize patch generator
        const patchGenerator = new PatchGenerator({
          format: options.format,
          filterTypes: options.filter.split(',').map(t => t.trim()),
          outputDir: options.output
        });

        // Generate patches
        const patches = await patchGenerator.generatePatches(routesWithIssues);

        spinner.succeed(`Generated ${patches.length} patches`);

        // Display patch summary
        console.log(chalk.blue('\n🩹 Patch Summary:'));
        console.log(`  📄 Total Patches: ${chalk.cyan(patches.length)}`);

        const patchesByType = patches.reduce((acc, patch) => {
          acc[patch.type] = (acc[patch.type] || 0) + 1;
          return acc;
        }, {});

        Object.entries(patchesByType).forEach(([type, count]) => {
          console.log(`  ${getTypeIcon(type)} ${type}: ${chalk.cyan(count)}`);
        });

        // Handle patch application
        if (options.dryRun) {
          console.log(chalk.yellow('\n🔍 Dry run - showing patches that would be applied:'));
          await displayPatches(patches, options.interactive);
        } else if (options.autoApply) {
          console.log(chalk.red('\n⚠️ Auto-applying patches...'));
          const applied = await patchGenerator.applyPatches(patches);
          console.log(`✅ Applied ${applied} patches`);
        } else if (options.interactive) {
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Apply these patches?',
            default: false
          }]);

          if (confirm) {
            const applied = await patchGenerator.applyPatches(patches);
            console.log(`✅ Applied ${applied} patches`);
          } else {
            console.log('❌ Patch application cancelled');
          }
        } else {
          console.log(chalk.yellow('\n💡 Use --dry-run to preview patches or --auto-apply to apply them'));
        }

        // Save patch manifest
        const manifest = {
          timestamp: new Date().toISOString(),
          config: options,
          summary: {
            totalPatches: patches.length,
            patchesByType,
            routesPatched: routesWithIssues.length
          },
          patches: patches.map(p => ({
            id: p.id,
            route: p.route,
            type: p.type,
            description: p.description,
            file: p.file
          }))
        };

        const manifestPath = path.join(options.output, 'patch-manifest.json');
        await fs.writeJson(manifestPath, manifest, { spaces: 2 });

        console.log(`\n📋 Manifest: ${chalk.cyan(manifestPath)}`);

      } catch (error) {
        spinner.fail('Patch generation failed');
        console.error(chalk.red('❌ Error:'), error.message);
        if (program.opts().verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

class PatchGenerator {
  constructor(options = {}) {
    this.format = options.format || 'json';
    this.filterTypes = options.filterTypes || ['accessibility', 'semantic'];
    this.outputDir = options.outputDir || './yorha-patches';
  }

  async generatePatches(routes) {
    const patches = [];

    for (const route of routes) {
      if (!route.analyses.compliance) continue;

      const routePatches = await this.generateRoutePatches(route);
      patches.push(...routePatches);
    }

    return patches;
  }

  async generateRoutePatches(route) {
    const patches = [];
    const issues = route.analyses.compliance.issues;

    for (const issue of issues) {
      if (!this.filterTypes.includes(issue.category)) continue;

      const patch = await this.generateIssuePatch(route, issue);
      if (patch) {
        patches.push(patch);
      }
    }

    return patches;
  }

  async generateIssuePatch(route, issue) {
    const patchId = `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let patchContent;
    let filePath;

    switch (issue.category) {
      case 'accessibility':
        ({ patchContent, filePath } = await this.generateAccessibilityPatch(route, issue));
        break;
      case 'semantic':
        ({ patchContent, filePath } = await this.generateSemanticPatch(route, issue));
        break;
      case 'performance':
        ({ patchContent, filePath } = await this.generatePerformancePatch(route, issue));
        break;
      default:
        return null;
    }

    if (!patchContent) return null;

    return {
      id: patchId,
      route: route.route,
      type: issue.category,
      severity: issue.severity,
      description: issue.message,
      file: filePath,
      content: patchContent,
      format: this.format,
      metadata: {
        issueId: issue.id,
        element: issue.element,
        line: issue.line,
        column: issue.column
      }
    };
  }

  async generateAccessibilityPatch(route, issue) {
    // Generate accessibility fixes based on issue type
    const fixes = {
      'missing-alt': {
        type: 'add-attribute',
        attribute: 'alt',
        value: 'Image description needed'
      },
      'missing-label': {
        type: 'add-element',
        element: 'label',
        attributes: { for: 'input-id' }
      },
      'low-contrast': {
        type: 'update-style',
        property: 'color',
        value: '#000000'
      },
      'missing-lang': {
        type: 'add-attribute',
        attribute: 'lang',
        value: 'en'
      }
    };

    const fix = fixes[issue.rule];
    if (!fix) return {};

    return {
      patchContent: this.formatPatch(fix, issue),
      filePath: `${route.route.replace(/\//g, '_')}_accessibility.patch`
    };
  }

  async generateSemanticPatch(route, issue) {
    // Generate semantic HTML fixes
    const fixes = {
      'non-semantic-div': {
        type: 'replace-element',
        from: 'div',
        to: 'section',
        attributes: { role: 'main' }
      },
      'missing-heading': {
        type: 'add-element',
        element: 'h1',
        content: 'Page Title'
      },
      'incorrect-list': {
        type: 'replace-element',
        from: 'div',
        to: 'ul'
      }
    };

    const fix = fixes[issue.rule];
    if (!fix) return {};

    return {
      patchContent: this.formatPatch(fix, issue),
      filePath: `${route.route.replace(/\//g, '_')}_semantic.patch`
    };
  }

  async generatePerformancePatch(route, issue) {
    // Generate performance optimization patches
    const fixes = {
      'large-image': {
        type: 'add-attribute',
        attribute: 'loading',
        value: 'lazy'
      },
      'unused-css': {
        type: 'remove-unused',
        target: 'css-rules'
      },
      'blocking-script': {
        type: 'add-attribute',
        attribute: 'defer',
        value: 'true'
      }
    };

    const fix = fixes[issue.rule];
    if (!fix) return {};

    return {
      patchContent: this.formatPatch(fix, issue),
      filePath: `${route.route.replace(/\//g, '_')}_performance.patch`
    };
  }

  formatPatch(fix, issue) {
    switch (this.format) {
      case 'json':
        return {
          version: '1.0',
          fix,
          issue: {
            id: issue.id,
            message: issue.message,
            element: issue.element
          }
        };

      case 'diff':
        return `--- a/${issue.element}
+++ b/${issue.element}
@@ -${issue.line || 1},1 +${issue.line || 1},1 @@
-${issue.element}
+${this.applyFix(issue.element, fix)}`;

      case 'unified':
        return {
          type: 'unified',
          hunks: [{
            oldStart: issue.line || 1,
            oldLines: 1,
            newStart: issue.line || 1,
            newLines: 1,
            lines: [
              `-${issue.element}`,
              `+${this.applyFix(issue.element, fix)}`
            ]
          }]
        };

      default:
        return fix;
    }
  }

  applyFix(element, fix) {
    // Simple fix application logic
    switch (fix.type) {
      case 'add-attribute':
        return `<${element} ${fix.attribute}="${fix.value}">`;
      case 'replace-element':
        return element.replace(new RegExp(`<${fix.from}`, 'g'), `<${fix.to}`);
      default:
        return element;
    }
  }

  async applyPatches(patches) {
    let applied = 0;

    for (const patch of patches) {
      try {
        await this.applyPatch(patch);
        applied++;
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to apply patch ${patch.id}: ${error.message}`));
      }
    }

    return applied;
  }

  async applyPatch(patch) {
    // This would integrate with the actual codebase
    // For now, just save the patch file
    const patchPath = path.join(this.outputDir, patch.file);
    await fs.writeJson(patchPath, patch.content, { spaces: 2 });
  }
}

async function displayPatches(patches, interactive = false) {
  for (const patch of patches) {
    console.log(chalk.blue(`\n🩹 ${patch.type.toUpperCase()} Patch for ${patch.route}:`));
    console.log(`   ${patch.description}`);

    if (interactive) {
      const { apply } = await inquirer.prompt([{
        type: 'confirm',
        name: 'apply',
        message: `Apply this patch?`,
        default: false
      }]);

      if (!apply) {
        console.log(chalk.gray('   Skipped'));
        continue;
      }
    }

    console.log(chalk.green(`   Would apply: ${patch.file}`));
  }
}

function getTypeIcon(type) {
  const icons = {
    accessibility: '♿',
    semantic: '🏷️',
    performance: '⚡',
    security: '🔒'
  };
  return icons[type] || '🩹';
}

module.exports = registerPatchCommand;