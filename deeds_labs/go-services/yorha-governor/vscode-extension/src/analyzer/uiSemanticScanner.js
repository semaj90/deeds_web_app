const acorn = require("acorn");
const walk = require("acorn-walk");

class UISemanticScanner {
  constructor() {
    this.accessibilityRules = {
      'img': ['alt'],
      'input': ['aria-label', 'aria-describedby'],
      'button': ['aria-label'],
      'a': ['aria-label'],
      'select': ['aria-label'],
      'textarea': ['aria-label']
    };

    this.semanticRules = {
      'header': 'semantic-header',
      'nav': 'semantic-nav',
      'main': 'semantic-main',
      'section': 'semantic-section',
      'article': 'semantic-article',
      'aside': 'semantic-aside',
      'footer': 'semantic-footer'
    };
  }

  analyzeHTML(htmlContent) {
    const issues = [];

    // Parse HTML-like structure from Svelte template
    const templateMatch = htmlContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (!templateMatch) return issues;

    const template = templateMatch[1];

    // Check for semantic HTML elements
    for (const [tag, rule] of Object.entries(this.semanticRules)) {
      if (!template.includes(`<${tag}`) && !template.includes(`<${tag}>`)) {
        issues.push({
          type: 'missing-semantic-element',
          element: tag,
          rule: rule,
          severity: 'warning',
          message: `Consider using <${tag}> for better semantic structure`
        });
      }
    }

    // Check accessibility attributes
    for (const [tag, requiredAttrs] of Object.entries(this.accessibilityRules)) {
      const tagRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
      const matches = template.match(tagRegex);

      if (matches) {
        for (const match of matches) {
          for (const attr of requiredAttrs) {
            if (!match.includes(attr + '=')) {
              issues.push({
                type: 'missing-accessibility-attribute',
                element: tag,
                attribute: attr,
                severity: 'error',
                message: `<${tag}> elements should have ${attr} attribute for accessibility`
              });
            }
          }
        }
      }
    }

    // Check for proper heading hierarchy
    const headingRegex = /<h([1-6])[^>]*>/gi;
    const headings = [];
    let match;
    while ((match = headingRegex.exec(template)) !== null) {
      headings.push(parseInt(match[1]));
    }

    if (headings.length > 0 && headings[0] !== 1) {
      issues.push({
        type: 'heading-hierarchy',
        severity: 'warning',
        message: 'Page should start with h1 for proper heading hierarchy'
      });
    }

    // Check for skipped heading levels
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i-1] + 1) {
        issues.push({
          type: 'heading-hierarchy',
          severity: 'warning',
          message: `Skipped heading level: h${headings[i-1]} to h${headings[i]}`
        });
      }
    }

    return issues;
  }

  analyzeScript(scriptContent) {
    const issues = [];

    try {
      const ast = acorn.parse(scriptContent, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowImportExportEverywhere: true
      });

      // Check for reactive statements without proper dependencies
      walk.simple(ast, {
        ExpressionStatement: (node) => {
          if (node.expression.type === 'AssignmentExpression' &&
              node.expression.left.type === 'MemberExpression' &&
              node.expression.left.object.type === 'ThisExpression') {
            // Potential reactive assignment
            issues.push({
              type: 'reactive-statement',
              severity: 'info',
              message: 'Consider using runes for reactive state management'
            });
          }
        }
      });

    } catch (error) {
      console.error('Error parsing script:', error);
    }

    return issues;
  }

  analyzeComponent(content) {
    const issues = [];

    // Split content into script and template
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);

    if (scriptMatch) {
      issues.push(...this.analyzeScript(scriptMatch[1]));
    }

    if (templateMatch) {
      issues.push(...this.analyzeHTML(templateMatch[1]));
    }

    return issues;
  }
}

module.exports = { UISemanticScanner };