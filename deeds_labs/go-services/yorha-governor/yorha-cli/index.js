#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');

const program = new Command();

// CLI Configuration
program
  .name('yorha')
  .description('YorHa UI Governance Suite - Automated UI analysis and fixing')
  .version('1.0.0')
  .option('-v, --verbose', 'enable verbose output')
  .option('-q, --quiet', 'suppress non-error output')
  .option('--config <path>', 'path to config file', './yorha.config.json');

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Load commands dynamically
async function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');

  try {
    const commandFiles = await fs.readdir(commandsDir);
    const jsFiles = commandFiles.filter(file => file.endsWith('.js'));

    for (const file of jsFiles) {
      const commandPath = path.join(commandsDir, file);
      const command = require(commandPath);

      if (typeof command === 'function') {
        command(program);
      } else if (command.register) {
        command.register(program);
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error loading commands:'), error.message);
    process.exit(1);
  }
}

// Initialize CLI
async function initialize() {
  const spinner = ora('Initializing YorHa UI Governor...').start();

  try {
    // Load configuration
    const configPath = program.opts().config;
    let config = {};

    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    } else {
      // Create default config
      config = {
        version: '1.0.0',
        mcpEndpoint: 'http://localhost:3003',
        playwrightConfig: './playwright.config.js',
        routesFile: './routes.json',
        outputDir: './yorha-reports',
        baselineDir: './yorha-baselines',
        thresholds: {
          compliance: 80,
          accessibility: 90,
          performance: 75
        }
      };

      await fs.writeJson(configPath, config, { spaces: 2 });
    }

    // Store config globally
    global.yorhaConfig = config;

    spinner.succeed('YorHa UI Governor initialized');

    // Load commands
    await loadCommands();

    // Parse command line arguments
    program.parse();

  } catch (error) {
    spinner.fail('Failed to initialize YorHa UI Governor');
    console.error(chalk.red('❌ Initialization error:'), error.message);
    if (program.opts().verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle no command provided
program.action(() => {
  console.log(chalk.blue(`
╔══════════════════════════════════════════════════════════════╗
║                     🏯 YorHa UI Governor                     ║
║                   Automated UI Governance                    ║
╚══════════════════════════════════════════════════════════════╝

${chalk.white('Available commands:')}

  ${chalk.cyan('scan')}        Scan routes and capture screenshots
  ${chalk.cyan('analyze')}     Analyze UI compliance and accessibility
  ${chalk.cyan('patch')}       Generate automated fixes for issues
  ${chalk.cyan('autofix')}     Apply fixes automatically
  ${chalk.cyan('report')}      Generate comprehensive reports
  ${chalk.cyan('monitor')}     Start continuous monitoring
  ${chalk.cyan('baseline')}    Manage visual regression baselines

${chalk.white('Examples:')}
  yorha scan --routes ./routes.json
  yorha analyze --output ./reports
  yorha autofix --dry-run
  yorha report --format html

${chalk.white('For help on a specific command:')}
  yorha <command> --help

${chalk.gray('Configuration: ./yorha.config.json')}
  `));
});

// Start the CLI
initialize().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});