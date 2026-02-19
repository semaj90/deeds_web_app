const { ComplianceEngine } = require('../../phase72-mcp-ui-governor/analysis/complianceEngine');
const { SemanticRanker } = require('../../phase72-mcp-ui-governor/analysis/semanticRanker');
const { VisualSimilarityAnalyzer } = require('../../phase72-mcp-ui-governor/analysis/visualSimilarityAnalyzer');
const { ReportFormatter } = require('../../phase72-mcp-ui-governor/analysis/reportFormatter');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');

function registerAnalyzeCommand(program) {
  program
    .command('analyze')
    .description('Analyze UI compliance and accessibility')
    .option('-i, --input <dir>', 'input directory with screenshots', './yorha-screenshots')
    .option('-o, --output <dir>', 'output directory for reports', './yorha-reports')
    .option('-f, --format <type>', 'report format (html, markdown, json)', 'html')
    .option('--all-formats', 'generate reports in all formats')
    .option('--semantic', 'enable semantic analysis')
    .option('--visual', 'enable visual similarity analysis')
    .option('--accessibility', 'enable accessibility analysis')
    .option('--performance', 'enable performance analysis')
    .option('--yorha-rules', 'enable YorHa-specific compliance rules')
    .option('--threshold <score>', 'minimum compliance score threshold', 80)
    .option('--batch-size <num>', 'batch size for processing', 10)
    .action(async (options) => {
      const spinner = ora('Starting UI analysis...').start();

      try {
        // Validate input directory
        if (!await fs.pathExists(options.input)) {
          spinner.fail(`Input directory not found: ${options.input}`);
          console.log(chalk.yellow('💡 Tip: Run "yorha scan" first to capture screenshots'));
          process.exit(1);
        }

        // Load scan results
        const scanResultsPath = path.join(options.input, 'scan-results.json');
        if (!await fs.pathExists(scanResultsPath)) {
          spinner.fail('Scan results not found. Please run scan command first.');
          process.exit(1);
        }

        const scanResults = await fs.readJson(scanResultsPath);
        const successfulRoutes = scanResults.results.filter(r => r.success);

        if (successfulRoutes.length === 0) {
          spinner.fail('No successful route scans found');
          process.exit(1);
        }

        spinner.text = `Analyzing ${successfulRoutes.length} routes...`;

        // Create output directory
        await fs.ensureDir(options.output);

        // Initialize analyzers
        const analyzers = {};

        if (options.semantic || options.accessibility || options.performance || options.yorhaRules) {
          analyzers.compliance = new ComplianceEngine({
            enableAccessibility: options.accessibility,
            enablePerformance: options.performance,
            enableYorHaRules: options.yorhaRules
          });
        }

        if (options.semantic) {
          analyzers.semantic = new SemanticRanker();
        }

        if (options.visual) {
          analyzers.visual = new VisualSimilarityAnalyzer();
        }

        // Analyze routes
        const analysisResults = [];

        for (let i = 0; i < successfulRoutes.length; i += options.batchSize) {
          const batch = successfulRoutes.slice(i, i + options.batchSize);
          spinner.text = `Analyzing routes ${i + 1}-${Math.min(i + options.batchSize, successfulRoutes.length)}/${successfulRoutes.length}...`;

          const batchResults = await Promise.all(
            batch.map(async (routeResult) => {
              try {
                const routeAnalysis = {
                  route: routeResult.route,
                  timestamp: new Date().toISOString(),
                  screenshot: routeResult.screenshot,
                  dom: routeResult.dom,
                  metadata: routeResult.metadata,
                  analyses: {}
                };

                // Load screenshot and DOM data
                const screenshotPath = path.join(options.input, routeResult.screenshot);
                const domPath = path.join(options.input, routeResult.dom);

                if (await fs.pathExists(screenshotPath)) {
                  routeAnalysis.screenshotBuffer = await fs.readFile(screenshotPath);
                }

                if (await fs.pathExists(domPath)) {
                  routeAnalysis.domContent = await fs.readFile(domPath, 'utf8');
                }

                // Run enabled analyses
                if (analyzers.compliance && routeAnalysis.domContent) {
                  routeAnalysis.analyses.compliance = await analyzers.compliance.analyzeCompliance(
                    routeAnalysis.domContent,
                    routeAnalysis.route
                  );
                }

                if (analyzers.semantic && routeAnalysis.domContent) {
                  routeAnalysis.analyses.semantic = await analyzers.semantic.analyzeContent(
                    routeAnalysis.domContent,
                    routeAnalysis.route
                  );
                }

                if (analyzers.visual && routeAnalysis.screenshotBuffer) {
                  routeAnalysis.analyses.visual = await analyzers.visual.analyzeImage(
                    routeAnalysis.screenshotBuffer,
                    routeAnalysis.route
                  );
                }

                // Calculate overall score
                routeAnalysis.overallScore = calculateOverallScore(routeAnalysis.analyses);

                return routeAnalysis;

              } catch (error) {
                console.warn(chalk.yellow(`⚠️ Analysis failed for ${routeResult.route}: ${error.message}`));
                return {
                  route: routeResult.route,
                  error: error.message,
                  analyses: {},
                  overallScore: 0
                };
              }
            })
          );

          analysisResults.push(...batchResults);
        }

        spinner.succeed(`Analysis complete for ${analysisResults.length} routes`);

        // Generate summary
        const summary = generateAnalysisSummary(analysisResults);

        console.log(chalk.blue('\n📊 Analysis Summary:'));
        console.log(`  📈 Average Score: ${chalk.cyan(Math.round(summary.averageScore))}/100`);
        console.log(`  ✅ Passing Routes: ${chalk.green(summary.passingRoutes)}`);
        console.log(`  ❌ Failing Routes: ${chalk.red(summary.failingRoutes)}`);
        console.log(`  ⚠️ Total Issues: ${chalk.yellow(summary.totalIssues)}`);

        // Generate reports
        const reportFormatter = new ReportFormatter();

        const fullAnalysis = {
          timestamp: new Date().toISOString(),
          config: options,
          totalRoutes: analysisResults.length,
          overallScore: summary.averageScore,
          summary,
          routes: analysisResults
        };

        if (options.allFormats) {
          const reports = await reportFormatter.generateMultipleFormats(
            fullAnalysis,
            path.join(options.output, 'yorha-analysis')
          );

          console.log(chalk.blue('\n📄 Reports Generated:'));
          Object.entries(reports).forEach(([format, filepath]) => {
            console.log(`  ${format.toUpperCase()}: ${chalk.cyan(filepath)}`);
          });
        } else {
          const reportPath = await reportFormatter.saveReport(
            fullAnalysis,
            path.join(options.output, `yorha-analysis.${options.format === 'markdown' ? 'md' : options.format}`),
            options.format
          );

          console.log(`\n📄 Report: ${chalk.cyan(reportPath)}`);
        }

        // Save detailed results
        const resultsPath = path.join(options.output, 'analysis-results.json');
        await fs.writeJson(resultsPath, fullAnalysis, { spaces: 2 });

        console.log(`💾 Detailed results: ${chalk.cyan(resultsPath)}`);

        // Check threshold
        if (summary.averageScore < options.threshold) {
          console.log(chalk.red(`\n❌ Overall score (${Math.round(summary.averageScore)}) below threshold (${options.threshold})`));
          process.exit(1);
        }

      } catch (error) {
        spinner.fail('Analysis failed');
        console.error(chalk.red('❌ Error:'), error.message);
        if (program.opts().verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

function calculateOverallScore(analyses) {
  const scores = [];

  if (analyses.compliance) {
    scores.push(analyses.compliance.score);
  }

  if (analyses.semantic) {
    scores.push(analyses.semantic.score);
  }

  if (analyses.visual) {
    scores.push(analyses.visual.score);
  }

  return scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;
}

function generateAnalysisSummary(results) {
  const totalRoutes = results.length;
  const passingRoutes = results.filter(r => r.overallScore >= 80).length;
  const failingRoutes = totalRoutes - passingRoutes;

  const totalIssues = results.reduce((sum, r) => {
    if (r.analyses.compliance) {
      return sum + r.analyses.compliance.issues.length;
    }
    return sum;
  }, 0);

  const averageScore = results.reduce((sum, r) => sum + r.overallScore, 0) / totalRoutes;

  return {
    totalRoutes,
    passingRoutes,
    failingRoutes,
    totalIssues,
    averageScore
  };
}

module.exports = registerAnalyzeCommand;