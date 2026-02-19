const { ReportFormatter } = require('../../phase72-mcp-ui-governor/analysis/reportFormatter');
const chalk = require('chalk').default || require('chalk');
const ora = require('ora').default || require('ora');
const fs = require('fs-extra');
const path = require('path');

function registerReportCommand(program) {
  program
    .command('report')
    .description('Generate comprehensive UI governance reports')
    .option('-i, --input <file>', 'analysis results file', './yorha-reports/analysis-results.json')
    .option('-o, --output <dir>', 'output directory for reports', './yorha-reports')
    .option('-f, --format <type>', 'report format (html, markdown, json)', 'html')
    .option('--all-formats', 'generate reports in all formats')
    .option('--executive-summary', 'generate executive summary report')
    .option('--route-details', 'generate individual route reports')
    .option('--trends', 'include trend analysis')
    .option('--comparative', 'generate comparative analysis with previous reports')
    .option('--threshold <score>', 'highlight routes below this score', 80)
    .option('--top-issues <num>', 'show top N issues in summary', 10)
    .action(async (options) => {
      const spinner = ora('Generating reports...').start();

      try {
        // Validate input file
        if (!await fs.pathExists(options.input)) {
          spinner.fail(`Analysis results not found: ${options.input}`);
          console.log(chalk.yellow('💡 Tip: Run "yorha analyze" first to generate analysis results'));
          process.exit(1);
        }

        // Load analysis results
        const analysisResults = await fs.readJson(options.input);

        spinner.text = `Processing ${analysisResults.totalRoutes} routes...`;

        // Create output directory
        await fs.ensureDir(options.output);

        // Initialize report formatter
        const formatter = new ReportFormatter();

        // Generate main report
        const mainReport = {
          ...analysisResults,
          config: options,
          generated: new Date().toISOString()
        };

        if (options.allFormats) {
          const reports = await formatter.generateMultipleFormats(
            mainReport,
            path.join(options.output, 'yorha-report')
          );

          console.log(chalk.blue('\n📄 Main Reports Generated:'));
          Object.entries(reports).forEach(([format, filepath]) => {
            console.log(`  ${format.toUpperCase()}: ${chalk.cyan(filepath)}`);
          });
        } else {
          const reportPath = await formatter.saveReport(
            mainReport,
            path.join(options.output, `yorha-report.${options.format === 'markdown' ? 'md' : options.format}`),
            options.format
          );

          console.log(chalk.blue('\n📄 Main Report:'));
          console.log(`  ${options.format.toUpperCase()}: ${chalk.cyan(reportPath)}`);
        }

        // Generate executive summary
        if (options.executiveSummary) {
          const summaryPath = path.join(options.output, 'executive-summary.json');
          const summary = await formatter.generateExecutiveSummary(mainReport, summaryPath);

          console.log(chalk.blue('\n📊 Executive Summary:'));
          console.log(`  JSON: ${chalk.cyan(summaryPath)}`);

          // Display key metrics
          console.log(chalk.yellow('\nKey Metrics:'));
          console.log(`  Routes Analyzed: ${summary.keyMetrics.routesAnalyzed}`);
          console.log(`  Overall Score: ${summary.keyMetrics.overallComplianceScore}/100`);
          console.log(`  Critical Issues: ${summary.keyMetrics.criticalIssues}`);

          if (summary.recommendations.length > 0) {
            console.log(chalk.yellow('\nRecommendations:'));
            summary.recommendations.forEach(rec => {
              console.log(`  ${getPriorityIcon(rec.priority)} ${rec.action}`);
            });
          }
        }

        // Generate individual route reports
        if (options.routeDetails) {
          const routeReportsDir = path.join(options.output, 'route-reports');
          const routeReports = await formatter.generateRouteSpecificReports(
            mainReport,
            routeReportsDir
          );

          console.log(chalk.blue('\n📋 Route Reports:'));
          console.log(`  Generated: ${chalk.cyan(routeReports.length)} individual reports`);
          console.log(`  Directory: ${chalk.cyan(routeReportsDir)}`);
        }

        // Generate trend analysis
        if (options.trends) {
          const trendsReport = await generateTrendAnalysis(mainReport, options.output);

          console.log(chalk.blue('\n📈 Trend Analysis:'));
          console.log(`  Report: ${chalk.cyan(trendsReport.path)}`);

          // Display trend highlights
          if (trendsReport.data.mostProblematicRoutes.length > 0) {
            console.log(chalk.red('\nMost Problematic Routes:'));
            trendsReport.data.mostProblematicRoutes.slice(0, 5).forEach(route => {
              console.log(`  ${route.route}: ${route.score}/100`);
            });
          }

          if (trendsReport.data.bestPerformingRoutes.length > 0) {
            console.log(chalk.green('\nBest Performing Routes:'));
            trendsReport.data.bestPerformingRoutes.slice(0, 5).forEach(route => {
              console.log(`  ${route.route}: ${route.score}/100`);
            });
          }
        }

        // Generate comparative analysis
        if (options.comparative) {
          const comparativeReport = await generateComparativeAnalysis(options.output);

          if (comparativeReport) {
            console.log(chalk.blue('\n📊 Comparative Analysis:'));
            console.log(`  Report: ${chalk.cyan(comparativeReport.path)}`);

            // Display comparison highlights
            console.log(chalk.yellow('\nComparison with Previous Run:'));
            console.log(`  Score Change: ${comparativeReport.data.scoreChange >= 0 ? '+' : ''}${comparativeReport.data.scoreChange.toFixed(1)}`);
            console.log(`  Issues Change: ${comparativeReport.data.issuesChange >= 0 ? '+' : ''}${comparativeReport.data.issuesChange}`);
          }
        }

        // Generate issue summary
        const issueSummary = await generateIssueSummary(mainReport, options);

        console.log(chalk.blue('\n🐛 Top Issues:'));
        issueSummary.topIssues.slice(0, options.topIssues).forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue.category}: ${issue.message}`);
          console.log(`     Routes: ${issue.routes.join(', ')}`);
        });

        // Highlight routes below threshold
        const belowThreshold = mainReport.routes.filter(r => r.overallScore < options.threshold);
        if (belowThreshold.length > 0) {
          console.log(chalk.red(`\n⚠️ Routes below ${options.threshold} threshold:`));
          belowThreshold.forEach(route => {
            console.log(`  ${route.route}: ${Math.round(route.overallScore)}/100`);
          });
        }

        spinner.succeed('All reports generated successfully');

        // Save report manifest
        const manifest = {
          timestamp: new Date().toISOString(),
          config: options,
          reports: {
            main: options.allFormats ? ['html', 'markdown', 'json'] : [options.format],
            executiveSummary: options.executiveSummary,
            routeDetails: options.routeDetails,
            trends: options.trends,
            comparative: options.comparative
          },
          summary: {
            routesAnalyzed: mainReport.totalRoutes,
            overallScore: mainReport.overallScore,
            totalIssues: mainReport.summary.totalIssues,
            routesBelowThreshold: belowThreshold.length
          }
        };

        const manifestPath = path.join(options.output, 'report-manifest.json');
        await fs.writeJson(manifestPath, manifest, { spaces: 2 });

        console.log(`\n📋 Manifest: ${chalk.cyan(manifestPath)}`);

      } catch (error) {
        spinner.fail('Report generation failed');
        console.error(chalk.red('❌ Error:'), error.message);
        if (program.opts().verbose) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

async function generateTrendAnalysis(analysis, outputDir) {
  const trends = analysis.routes.reduce((acc, route) => {
    const bucket = Math.floor(route.overallScore / 10) * 10;
    acc.scoreBuckets[bucket] = (acc.scoreBuckets[bucket] || 0) + 1;

    if (route.analyses.compliance) {
      route.analyses.compliance.issues.forEach(issue => {
        acc.issuesByCategory[issue.category] = (acc.issuesByCategory[issue.category] || 0) + 1;
      });
    }

    return acc;
  }, {
    scoreBuckets: {},
    issuesByCategory: {},
    mostProblematicRoutes: analysis.routes
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, 10),
    bestPerformingRoutes: analysis.routes
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 10)
  });

  const trendsPath = path.join(outputDir, 'trend-analysis.json');
  await fs.writeJson(trendsPath, {
    timestamp: new Date().toISOString(),
    analysis: trends
  }, { spaces: 2 });

  return {
    path: trendsPath,
    data: trends
  };
}

async function generateComparativeAnalysis(outputDir) {
  try {
    // Find previous analysis results
    const reportFiles = await fs.readdir(outputDir);
    const previousReports = reportFiles
      .filter(file => file.startsWith('analysis-results-') && file.endsWith('.json'))
      .sort()
      .slice(-1); // Get most recent previous report

    if (previousReports.length === 0) {
      return null;
    }

    const previousPath = path.join(outputDir, previousReports[0]);
    const previousAnalysis = await fs.readJson(previousPath);

    const currentPath = path.join(outputDir, 'analysis-results.json');
    const currentAnalysis = await fs.readJson(currentPath);

    const comparison = {
      timestamp: new Date().toISOString(),
      previousReport: previousReports[0],
      currentReport: 'analysis-results.json',
      scoreChange: currentAnalysis.overallScore - previousAnalysis.overallScore,
      issuesChange: currentAnalysis.summary.totalIssues - previousAnalysis.summary.totalIssues,
      routesChange: currentAnalysis.totalRoutes - previousAnalysis.totalRoutes
    };

    const comparisonPath = path.join(outputDir, 'comparative-analysis.json');
    await fs.writeJson(comparisonPath, comparison, { spaces: 2 });

    return {
      path: comparisonPath,
      data: comparison
    };

  } catch (error) {
    console.warn('Could not generate comparative analysis:', error.message);
    return null;
  }
}

async function generateIssueSummary(analysis, options) {
  const issues = [];

  analysis.routes.forEach(route => {
    if (route.analyses.compliance) {
      route.analyses.compliance.issues.forEach(issue => {
        issues.push({
          category: issue.category,
          message: issue.message,
          severity: issue.severity,
          route: route.route,
          score: route.overallScore
        });
      });
    }
  });

  // Group issues by message and category
  const groupedIssues = issues.reduce((acc, issue) => {
    const key = `${issue.category}:${issue.message}`;
    if (!acc[key]) {
      acc[key] = {
        category: issue.category,
        message: issue.message,
        severity: issue.severity,
        routes: [],
        count: 0,
        averageScore: 0
      };
    }

    acc[key].routes.push(issue.route);
    acc[key].count++;
    acc[key].averageScore = (acc[key].averageScore + issue.score) / 2;

    return acc;
  }, {});

  const topIssues = Object.values(groupedIssues)
    .sort((a, b) => b.count - a.count)
    .map(issue => ({
      category: issue.category,
      message: issue.message,
      severity: issue.severity,
      routes: issue.routes,
      count: issue.count,
      averageScore: Math.round(issue.averageScore)
    }));

  return {
    totalIssues: issues.length,
    uniqueIssues: topIssues.length,
    topIssues
  };
}

function getPriorityIcon(priority) {
  const icons = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };
  return icons[priority] || '⚪';
}

module.exports = registerReportCommand;