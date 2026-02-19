const acorn = require("acorn");
const walk = require("acorn-walk");

class SvelteRuneFixer {
  constructor() {
    this.runePatterns = {
      // State runes
      '$state': 'state',
      '$state.raw': 'state',
      '$derived': 'derived',
      '$derived.by': 'derived',

      // Reactive runes
      '$effect': 'effect',
      '$effect.pre': 'effect',
      '$effect.root': 'effect',

      // Props
      '$props': 'props',

      // Bindings
      '$bindable': 'bindable'
    };
  }

  analyzeCode(code) {
    const issues = [];
    try {
      const ast = acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true
      });

      walk.simple(ast, {
        CallExpression: (node) => {
          if (node.callee.type === 'Identifier' &&
              node.callee.name.startsWith('$') &&
              this.runePatterns[node.callee.name]) {
            issues.push({
              type: 'rune-usage',
              rune: node.callee.name,
              line: node.loc.start.line,
              column: node.loc.start.column,
              suggestion: this.runePatterns[node.callee.name]
            });
          }
        },
        VariableDeclaration: (node) => {
          for (const declarator of node.declarations) {
            if (declarator.init &&
                declarator.init.type === 'CallExpression' &&
                declarator.init.callee.type === 'Identifier' &&
                declarator.init.callee.name.startsWith('$')) {
              issues.push({
                type: 'rune-declaration',
                rune: declarator.init.callee.name,
                variable: declarator.id.name,
                line: declarator.loc.start.line,
                suggestion: this.runePatterns[declarator.init.callee.name]
              });
            }
          }
        }
      });
    } catch (error) {
      console.error('Error parsing code:', error);
    }

    return issues;
  }

  generateFix(issue, code) {
    const lines = code.split('\n');
    const line = lines[issue.line - 1];

    switch (issue.type) {
      case 'rune-usage':
        return line.replace(issue.rune, issue.suggestion);

      case 'rune-declaration':
        return line.replace(issue.rune, issue.suggestion);

      default:
        return line;
    }
  }

  fixAll(code) {
    const issues = this.analyzeCode(code);
    let fixedCode = code;

    // Sort issues by line number in reverse order to avoid offset issues
    issues.sort((a, b) => b.line - a.line);

    for (const issue of issues) {
      const lines = fixedCode.split('\n');
      lines[issue.line - 1] = this.generateFix(issue, lines[issue.line - 1]);
      fixedCode = lines.join('\n');
    }

    return fixedCode;
  }
}

module.exports = { SvelteRuneFixer };