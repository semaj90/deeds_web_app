const fs = require("fs/promises");
const path = require("path");

class ReportFormatter {
  constructor() {
    this.templates = {
      html: this.htmlTemplate.bind(this),
      markdown: this.markdownTemplate.bind(this),
      json: this.jsonTemplate.bind(this)
    };
  }

  async formatReport(analysis, format = 'html', options = {}) {
    const template = this.templates[format];
    if (!template) {
      throw new Error(`Unsupported format: ${format}`);
    }

    return await template(analysis, options);
  }

  async htmlTemplate(analysis, options) {
    const { title = 'YorHa UI Governor Analysis Report', includeCharts = true } = options;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 30px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #667eea; }
        .metric-label { color: #666; margin-top: 5px; }
        .routes { margin: 30px; }
        .route-card { border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
        .route-header { background: #f8f9fa; padding: 15px; border-bottom: 1px solid #e0e0e0; }
        .route-title { margin: 0; font-size: 1.2em; }
        .route-score { float: right; padding: 5px 10px; border-radius: 4px; color: white; }
        .route-score.good { background: #28a745; }
        .route-score.fair { background: #ffc107; }
        .route-score.poor { background: #dc3545; }
        .route-details { padding: 20px; }
        .issues { margin-top: 20px; }
        .issue { padding: 10px; margin-bottom: 10px; border-radius: 4px; }
        .issue.error { background: #f8d7da; border-left: 4px solid #dc3545; }
        .issue.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .issue.info { background: #d1ecf1; border-left: 4px solid #17a2b8; }
        .footer { text-align: center; padding: 20px; color: #666; border-top: 1px solid #e0e0e0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            <p>Generated on ${new Date(analysis.timestamp).toLocaleString()}</p>
        </div>

        <div class="summary">
            <div class="metric">
                <div class="metric-value">${analysis.totalRoutes}</div>
                <div class="metric-label">Routes Analyzed</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.round(analysis.overallScore)}</div>
                <div class="metric-label">Overall Score</div>
            </div>
            <div class="metric">
                <div class="metric-value">${analysis.summary.totalIssues}</div>
                <div class="metric-label">Total Issues</div>
            </div>
            <div class="metric">
                <div class="metric-value">${analysis.summary.issuesBySeverity.error}</div>
                <div class="metric-label">Errors</div>
            </div>
        </div>

        <div class="routes">
            <h2>Route Analysis</h2>
            ${analysis.routes.map(route => `
                <div class="route-card">
                    <div class="route-header">
                        <h3 class="route-title">${route.route}</h3>
                        <span class="route-score ${this.getScoreClass(route.complianceScore)}">
                            ${Math.round(route.complianceScore)}/100
                        </span>
                    </div>
                    <div class="route-details">
                        <p><strong>Issues:</strong> ${route.totalIssues}</p>
                        ${route.issues.length > 0 ? `
                            <div class="issues">
                                ${route.issues.slice(0, 5).map(issue => `
                                    <div class="issue ${issue.severity}">
                                        <strong>${issue.category}:</strong> ${issue.message}
                                    </div>
                                `).join('')}
                                ${route.issues.length > 5 ? `<p>... and ${route.issues.length - 5} more issues</p>` : ''}
                            </div>
                        ` : '<p>No issues found</p>'}
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>Report generated by YorHa UI Governor - Phase 72</p>
        </div>
    </div>
</body>
</html>`;
  }

  async markdownTemplate(analysis, options) {
    const { title = 'YorHa UI Governor Analysis Report' } = options;

    let markdown = `# ${title}

Generated on ${new Date(analysis.timestamp).toLocaleString()}

## Summary

- **Routes Analyzed**: ${analysis.totalRoutes}
- **Overall Score**: ${Math.round(analysis.overallScore)}/100
- **Total Issues**: ${analysis.summary.totalIssues}
- **Errors**: ${analysis.summary.issuesBySeverity.error}
- **Warnings**: ${analysis.summary.issuesBySeverity.warning}
- **Info**: ${analysis.summary.issuesBySeverity.info}

## Issues by Category

${Object.entries(analysis.summary.issuesByCategory).map(([category, count]) =>
  `- **${category}**: ${count} issues`
).join('\n')}

## Route Details

${analysis.routes.map(route => `
### ${route.route}

**Score**: ${Math.round(route.complianceScore)}/100
**Issues**: ${route.totalIssues}

${route.issues.length > 0 ?
  route.issues.map(issue => `- **${issue.severity.toUpperCase()}** (${issue.category}): ${issue.message}`).join('\n')
  : 'No issues found'
}
`).join('\n')}

---

*Report generated by YorHa UI Governor - Phase 72*`;

    return markdown;
  }

  async jsonTemplate(analysis, options) {
    return JSON.stringify(analysis, null, 2);
  }

  getScoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }

  async saveReport(analysis, outputPath, format = 'html', options = {}) {
    const content = await this.formatReport(analysis, format, options);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content);

    console.log(`✅ Report saved: ${outputPath}`);
    return outputPath;
  }

  async generateMultipleFormats(analysis, basePath, options = {}) {
    const formats = ['html', 'markdown', 'json'];
    const results = {};

    for (const format of formats) {
      const ext = format === 'markdown' ? 'md' : format;
      const outputPath = `${basePath}.${ext}`;
      results[format] = await this.saveReport(analysis, outputPath, format, options);
    }

    return results;
  }

  async generateRouteSpecificReports(analysis, baseDir) {
    const routeReports = [];

    for (const route of analysis.routes) {
      const routeAnalysis = {
        timestamp: analysis.timestamp,
        route: route.route,
        complianceScore: route.complianceScore,
        totalIssues: route.totalIssues,
        issues: route.issues,
        metadata: route.metadata,
        visualAnalysis: route.visualAnalysis
      };

      const safeName = route.route.replace(/\//g, '_').replace(/^_/, '') || 'root';
      const outputPath = path.join(baseDir, `${safeName}-report.json`);

      await fs.mkdir(baseDir, { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(routeAnalysis, null, 2));

      routeReports.push({
        route: route.route,
        reportPath: outputPath
      });
    }

    return routeReports;
  }

  async generateExecutiveSummary(analysis, outputPath) {
    const summary = {
      title: 'YorHa UI Governor Executive Summary',
      generated: new Date(analysis.timestamp).toLocaleString(),
      keyMetrics: {
        routesAnalyzed: analysis.totalRoutes,
        overallComplianceScore: Math.round(analysis.overallScore),
        totalIssues: analysis.summary.totalIssues,
        criticalIssues: analysis.summary.issuesBySeverity.error,
        improvementAreas: Object.entries(analysis.summary.issuesByCategory)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([category, count]) => ({ category, issues: count }))
      },
      recommendations: this.generateRecommendations(analysis),
      trends: this.analyzeTrends(analysis)
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));

    return summary;
  }

  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.summary.issuesBySeverity.error > 0) {
      recommendations.push({
        priority: 'high',
        category: 'accessibility',
        action: 'Fix critical accessibility issues immediately',
        impact: 'Legal compliance and user experience'
      });
    }

    if (analysis.summary.issuesByCategory.accessibility > analysis.totalRoutes * 2) {
      recommendations.push({
        priority: 'high',
        category: 'accessibility',
        action: 'Implement comprehensive accessibility audit',
        impact: 'Inclusive design and compliance'
      });
    }

    if (analysis.overallScore < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'compliance',
        action: 'Establish UI governance standards and training',
        impact: 'Consistent user experience'
      });
    }

    return recommendations;
  }

  analyzeTrends(analysis) {
    // Simple trend analysis based on issue distribution
    const routesByScore = analysis.routes.reduce((acc, route) => {
      const bucket = Math.floor(route.complianceScore / 20) * 20;
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});

    return {
      scoreDistribution: routesByScore,
      mostProblematicRoutes: analysis.routes
        .sort((a, b) => a.complianceScore - b.complianceScore)
        .slice(0, 3)
        .map(r => ({ route: r.route, score: r.complianceScore })),
      bestPerformingRoutes: analysis.routes
        .sort((a, b) => b.complianceScore - a.complianceScore)
        .slice(0, 3)
        .map(r => ({ route: r.route, score: r.complianceScore }))
    };
  }
}

async function formatReport(analysis, format = 'html', options = {}) {
  const formatter = new ReportFormatter();
  return await formatter.formatReport(analysis, format, options);
}

module.exports = { ReportFormatter, formatReport };