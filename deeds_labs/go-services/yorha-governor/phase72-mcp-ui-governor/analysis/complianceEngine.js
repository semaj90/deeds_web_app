const fs = require("fs/promises");
const path = require("path");

class ComplianceEngine {
  constructor() {
    this.rules = {
      accessibility: {
        'img-alt': {
          selector: 'img',
          check: (el) => el.attribs && el.attribs.alt,
          message: 'Images must have alt text',
          severity: 'error'
        },
        'button-accessible-name': {
          selector: 'button',
          check: (el) => {
            const hasText = el.children && el.children.some(child => child.type === 'text' && child.data.trim());
            const hasAriaLabel = el.attribs && el.attribs['aria-label'];
            const hasTitle = el.attribs && el.attribs.title;
            return hasText || hasAriaLabel || hasTitle;
          },
          message: 'Buttons must have accessible names',
          severity: 'error'
        },
        'input-label': {
          selector: 'input',
          check: (el, $, allElements) => {
            if (el.attribs && el.attribs.type === 'hidden') return true;
            if (el.attribs && el.attribs['aria-label']) return true;

            const id = el.attribs && el.attribs.id;
            if (!id) return false;

            // Check for label with matching for attribute
            return allElements.some(otherEl =>
              otherEl.name === 'label' &&
              otherEl.attribs &&
              otherEl.attribs.for === id
            );
          },
          message: 'Form inputs must have associated labels',
          severity: 'warning'
        },
        'heading-hierarchy': {
          selector: 'h1,h2,h3,h4,h5,h6',
          check: (els) => {
            if (els.length === 0) return true;
            const firstHeading = els[0];
            return firstHeading.name === 'h1';
          },
          message: 'Page should start with h1',
          severity: 'warning'
        }
      },

      semantic: {
        'semantic-structure': {
          required: ['header', 'nav', 'main', 'footer'],
          check: ($, elements) => {
            const present = this.rules.semantic['semantic-structure'].required.filter(tag =>
              elements.some(el => el.name === tag)
            );
            return present.length >= 2; // At least header/main or nav/main
          },
          message: 'Page should use semantic HTML structure',
          severity: 'info'
        },
        'unique-main': {
          selector: 'main',
          check: (els) => els.length <= 1,
          message: 'Page should have exactly one main element',
          severity: 'warning'
        }
      },

      performance: {
        'reasonable-dom-size': {
          check: ($, elements) => elements.length < 1500,
          message: 'DOM size should be reasonable (< 1500 elements)',
          severity: 'info'
        },
        'image-optimization': {
          selector: 'img',
          check: (els) => {
            return els.every(el => {
              const src = el.attribs && el.attribs.src;
              if (!src) return true; // Can't check if no src
              // Check for modern formats or reasonable file size indicators
              return !src.includes('.bmp') && !src.includes('.tiff');
            });
          },
          message: 'Images should use optimized formats',
          severity: 'info'
        }
      },

      yorha: {
        'yorha-naming-convention': {
          selector: '[class],[id]',
          check: (els) => {
            return els.every(el => {
              const classes = el.attribs && el.attribs.class;
              const id = el.attribs && el.attribs.id;

              const checkValue = (value) => {
                if (!value) return true;
                // Check kebab-case
                return /^[a-z][a-zA-Z0-9]*(-[a-z][a-zA-Z0-9]*)*$/.test(value);
              };

              if (classes) {
                return classes.split(/\s+/).every(checkValue);
              }
              if (id) {
                return checkValue(id);
              }
              return true;
            });
          },
          message: 'Use kebab-case for CSS classes and IDs',
          severity: 'warning'
        },
        'yorha-color-system': {
          selector: '*',
          check: (el, $, allElements) => {
            // Check inline styles for non-HSL colors
            const style = el.attribs && el.attribs.style;
            if (!style) return true;

            const colorMatches = style.match(/color:\s*([^;]+)/g) ||
                                style.match(/background-color:\s*([^;]+)/g) ||
                                style.match(/border-color:\s*([^;]+)/g);

            if (!colorMatches) return true;

            return colorMatches.every(match => {
              const color = match.split(':')[1].trim();
              return color.startsWith('hsl') ||
                     color.startsWith('hsla') ||
                     color.startsWith('oklch') ||
                     color.startsWith('oklab') ||
                     color === 'transparent' ||
                     color === 'currentColor' ||
                     color === 'inherit';
            });
          },
          message: 'Use HSL, HSLA, OKLCH, or OKLAB colors',
          severity: 'info'
        }
      }
    };
  }

  async analyzeCompliance(html, route) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const issues = [];

    // Get all elements
    const allElements = $('*').toArray();

    // Run all compliance checks
    for (const [category, categoryRules] of Object.entries(this.rules)) {
      for (const [ruleName, rule] of Object.entries(categoryRules)) {
        try {
          const result = this.runCheck($, rule, allElements);

          if (!result.passed) {
            issues.push({
              category,
              rule: ruleName,
              message: rule.message,
              severity: rule.severity,
              route,
              details: result.details,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`Error running compliance check ${ruleName}:`, error);
        }
      }
    }

    return {
      route,
      totalIssues: issues.length,
      issuesByCategory: this.groupIssuesByCategory(issues),
      issuesBySeverity: this.groupIssuesBySeverity(issues),
      complianceScore: this.calculateComplianceScore(issues),
      issues
    };
  }

  runCheck($, rule, allElements) {
    if (rule.selector) {
      const elements = $(rule.selector).toArray();

      if (rule.check.length === 1) {
        // Check all elements individually
        const failedElements = elements.filter(el => !rule.check(el, $, allElements));
        return {
          passed: failedElements.length === 0,
          details: failedElements.length > 0 ? `${failedElements.length} elements failed` : null
        };
      } else {
        // Check elements as a group
        return {
          passed: rule.check(elements, $, allElements),
          details: elements.length > 0 ? `${elements.length} elements checked` : 'No elements found'
        };
      }
    } else {
      // Global check
      return {
        passed: rule.check($, allElements),
        details: 'Global check performed'
      };
    }
  }

  groupIssuesByCategory(issues) {
    const grouped = {};

    for (const issue of issues) {
      if (!grouped[issue.category]) {
        grouped[issue.category] = [];
      }
      grouped[issue.category].push(issue);
    }

    return grouped;
  }

  groupIssuesBySeverity(issues) {
    const grouped = { error: [], warning: [], info: [] };

    for (const issue of issues) {
      grouped[issue.severity].push(issue);
    }

    return grouped;
  }

  calculateComplianceScore(issues) {
    if (issues.length === 0) return 100;

    const weights = { error: 10, warning: 3, info: 1 };
    const maxPossibleScore = 100;
    const penalty = issues.reduce((sum, issue) => sum + weights[issue.severity], 0);

    return Math.max(0, maxPossibleScore - penalty);
  }

  async analyzeMultipleRoutes(routesData) {
    const results = [];

    for (const routeData of routesData) {
      const result = await this.analyzeCompliance(routeData.html, routeData.route);
      results.push({
        ...result,
        metadata: routeData.metadata,
        visualAnalysis: routeData.visualAnalysis
      });
    }

    return {
      timestamp: new Date().toISOString(),
      totalRoutes: results.length,
      overallScore: results.reduce((sum, r) => sum + r.complianceScore, 0) / results.length,
      summary: this.generateSummary(results),
      routes: results
    };
  }

  generateSummary(results) {
    const totalIssues = results.reduce((sum, r) => sum + r.totalIssues, 0);
    const issuesByCategory = {};
    const issuesBySeverity = { error: 0, warning: 0, info: 0 };

    for (const result of results) {
      // Aggregate by category
      for (const [category, issues] of Object.entries(result.issuesByCategory)) {
        issuesByCategory[category] = (issuesByCategory[category] || 0) + issues.length;
      }

      // Aggregate by severity
      for (const [severity, issues] of Object.entries(result.issuesBySeverity)) {
        issuesBySeverity[severity] += issues.length;
      }
    }

    return {
      totalIssues,
      issuesByCategory,
      issuesBySeverity,
      averageScore: results.reduce((sum, r) => sum + r.complianceScore, 0) / results.length
    };
  }

  async generateComplianceReport(routesData, outputPath) {
    const analysis = await this.analyzeMultipleRoutes(routesData);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));

    console.log(`✅ Compliance report generated: ${outputPath}`);
    return analysis;
  }

  async loadComplianceSpec(specPath) {
    try {
      const specContent = await fs.readFile(specPath, 'utf8');
      const spec = JSON.parse(specContent);

      // Merge with default rules
      this.rules = { ...this.rules, ...spec };

      console.log(`✅ Loaded compliance spec: ${specPath}`);
      return true;
    } catch (error) {
      console.error(`Error loading compliance spec: ${error}`, error);
      return false;
    }
  }
}

async function analyzeCompliance(html, route) {
  const engine = new ComplianceEngine();
  return await engine.analyzeCompliance(html, route);
}

module.exports = { ComplianceEngine, analyzeCompliance };