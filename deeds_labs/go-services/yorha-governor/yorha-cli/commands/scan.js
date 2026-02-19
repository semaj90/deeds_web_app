const { CrawlRoutes } = require('../../phase72-mcp-ui-governor/scripts/crawlRoutes');
const { ExtractDom } = require('../../phase72-mcp-ui-governor/analysis/extractDom');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');

function registerScanCommand(program) {
  program
    .command('scan')
    .description('Scan routes and capture screenshots')
    .option('-r, --routes <file>', 'routes configuration file', './routes.json')
    .option('-o, --output <dir>', 'output directory for screenshots', './yorha-screenshots')
    .option('-b, --browser <type>', 'browser type (chromium, firefox, webkit)', 'chromium')
    .option('--headless', 'run in headless mode', true)
    .option('--viewport <size>', 'viewport size (widthxheight)', '1920x1080')
    .option('--timeout <ms>', 'navigation timeout in milliseconds', 30000)
    .option('--concurrency <num>', 'number of concurrent browsers', 3)
    .option('--base-url <url>', 'base URL for routes', 'http://localhost:3000')
    .action(async (options) => {
      const spinner = ora('Starting route scanning...').start();

      try {
        // Validate routes file
        if (!await fs.pathExists(options.routes)) {
          spinner.fail(`Routes file not found: ${options.routes}`);
          console.log(chalk.yellow('💡 Tip: Create a routes.json file or specify a different path with --routes'));
          process.exit(1);
        }

        // Load routes configuration
        const routesConfig = await fs.readJson(options.routes);
        const routes = routesConfig.routes || routesConfig;

        if (!Array.isArray(routes) || routes.length === 0) {
          spinner.fail('No routes found in configuration file');
          process.exit(1);
        }

        spinner.text = `Scanning ${routes.length} routes...`;

        // Initialize crawler
        const crawler = new CrawlRoutes({
          browser: options.browser,
          headless: options.headless,
          viewport: options.viewport,
          timeout: parseInt(options.timeout),
          concurrency: parseInt(options.concurrency),
          baseUrl: options.baseUrl
        });

        // Create output directory
        await fs.ensureDir(options.output);

        // Scan routes
        const results = await crawler.crawlRoutes(routes, options.output);

        spinner.succeed(`Successfully scanned ${results.length} routes`);

        // Generate summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(chalk.blue('\n📊 Scan Summary:'));
        console.log(`  ✅ Successful: ${chalk.green(successful)}`);
        console.log(`  ❌ Failed: ${chalk.red(failed)}`);
        console.log(`  📁 Output: ${chalk.cyan(options.output)}`);

        if (failed > 0) {
          console.log(chalk.yellow('\n⚠️ Failed routes:'));
          results.filter(r => !r.success).forEach(result => {
            console.log(`  - ${result.route}: ${result.error}`);
          });
        }

        // Save scan results
        const scanResults = {
          timestamp: new Date().toISOString(),
          config: options,
          summary: {
            total: results.length,
            successful,
            failed
          },
          results
        };

        const resultsPath = path.join(options.output, 'scan-results.json');
        await fs.writeJson(resultsPath, scanResults, { spaces: 2 });

        console.log(`\n💾 Results saved: ${chalk.cyan(resultsPath)}`);

      } catch (error) {
        spinner.fail('Scan failed');
        console.error(chalk.red('❌ Error:'), error.message);
        if (program.opts().verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

module.exports = registerScanCommand;