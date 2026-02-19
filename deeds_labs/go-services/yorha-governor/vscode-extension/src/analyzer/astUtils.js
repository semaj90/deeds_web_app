const acorn = require("acorn");
const walk = require("acorn-walk");

class ASTUtils {
  constructor() {
    this.parseOptions = {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      locations: true
    };
  }

  parseCode(code, options = {}) {
    try {
      return acorn.parse(code, { ...this.parseOptions, ...options });
    } catch (error) {
      console.error('AST parsing error:', error);
      return null;
    }
  }

  extractImports(ast) {
    const imports = [];

    walk.simple(ast, {
      ImportDeclaration: (node) => {
        imports.push({
          type: 'import',
          source: node.source.value,
          specifiers: node.specifiers.map(spec => ({
            type: spec.type,
            name: spec.local.name,
            imported: spec.imported ? spec.imported.name : null
          })),
          loc: node.loc
        });
      },
      ImportExpression: (node) => {
        if (node.source.type === 'Literal') {
          imports.push({
            type: 'dynamic-import',
            source: node.source.value,
            loc: node.loc
          });
        }
      }
    });

    return imports;
  }

  extractExports(ast) {
    const exports = [];

    walk.simple(ast, {
      ExportNamedDeclaration: (node) => {
        if (node.declaration) {
          if (node.declaration.type === 'VariableDeclaration') {
            for (const declarator of node.declaration.declarations) {
              exports.push({
                type: 'named',
                name: declarator.id.name,
                kind: 'variable',
                loc: node.loc
              });
            }
          } else if (node.declaration.type === 'FunctionDeclaration') {
            exports.push({
              type: 'named',
              name: node.declaration.id.name,
              kind: 'function',
              loc: node.loc
            });
          }
        } else if (node.specifiers) {
          for (const spec of node.specifiers) {
            exports.push({
              type: 'named',
              name: spec.exported.name,
              original: spec.local.name,
              loc: node.loc
            });
          }
        }
      },
      ExportDefaultDeclaration: (node) => {
        exports.push({
          type: 'default',
          loc: node.loc
        });
      },
      ExportAllDeclaration: (node) => {
        exports.push({
          type: 'all',
          source: node.source.value,
          loc: node.loc
        });
      }
    });

    return exports;
  }

  extractFunctions(ast) {
    const functions = [];

    walk.simple(ast, {
      FunctionDeclaration: (node) => {
        functions.push({
          type: 'function',
          name: node.id.name,
          params: node.params.map(param => this.extractParamName(param)),
          async: node.async,
          generator: node.generator,
          loc: node.loc
        });
      },
      ArrowFunctionExpression: (node) => {
        // Only track arrow functions assigned to variables
        let parent = node;
        while (parent && parent.type !== 'VariableDeclarator') {
          parent = parent.parent || null;
        }
        if (parent && parent.id) {
          functions.push({
            type: 'arrow-function',
            name: parent.id.name,
            params: node.params.map(param => this.extractParamName(param)),
            async: node.async,
            loc: node.loc
          });
        }
      },
      MethodDefinition: (node) => {
        functions.push({
          type: 'method',
          name: node.key.name,
          params: node.value.params.map(param => this.extractParamName(param)),
          static: node.static,
          async: node.value.async,
          generator: node.value.generator,
          loc: node.loc
        });
      }
    });

    return functions;
  }

  extractVariables(ast) {
    const variables = [];

    walk.simple(ast, {
      VariableDeclaration: (node) => {
        for (const declarator of node.declarations) {
          variables.push({
            name: declarator.id.name,
            kind: node.kind,
            init: declarator.init ? this.getNodeType(declarator.init) : null,
            loc: declarator.loc
          });
        }
      }
    });

    return variables;
  }

  extractSvelteReactive(ast) {
    const reactive = [];

    walk.simple(ast, {
      LabeledStatement: (node) => {
        if (node.label.name === '$') {
          reactive.push({
            type: 'reactive-statement',
            expression: this.getNodeSource(node.body),
            loc: node.loc
          });
        }
      },
      ExpressionStatement: (node) => {
        if (node.expression.type === 'AssignmentExpression' &&
            node.expression.left.type === 'MemberExpression' &&
            node.expression.left.object.type === 'ThisExpression' &&
            node.expression.left.property.name.startsWith('$')) {
          reactive.push({
            type: 'reactive-assignment',
            property: node.expression.left.property.name,
            loc: node.loc
          });
        }
      }
    });

    return reactive;
  }

  extractParamName(param) {
    switch (param.type) {
      case 'Identifier':
        return param.name;
      case 'AssignmentPattern':
        return param.left.name;
      case 'RestElement':
        return `...${param.argument.name}`;
      default:
        return '[complex]';
    }
  }

  getNodeType(node) {
    if (!node) return null;

    switch (node.type) {
      case 'Literal':
        return typeof node.value;
      case 'ArrayExpression':
        return 'array';
      case 'ObjectExpression':
        return 'object';
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return 'function';
      case 'CallExpression':
        return `call:${node.callee.name || '[computed]'}`;
      case 'NewExpression':
        return `new:${node.callee.name || '[computed]'}`;
      default:
        return node.type.toLowerCase();
    }
  }

  getNodeSource(node) {
    // This would need the original source code to extract text
    // For now, return a simplified representation
    return `[${node.type}]`;
  }

  findNodeAtPosition(ast, line, column) {
    let found = null;

    walk.simple(ast, {
      '*': (node) => {
        if (node.loc &&
            node.loc.start.line <= line &&
            node.loc.end.line >= line &&
            node.loc.start.column <= column &&
            node.loc.end.column >= column) {
          found = node;
        }
      }
    });

    return found;
  }

  analyzeComplexity(ast) {
    let complexity = {
      functions: 0,
      branches: 0,
      depth: 0
    };

    walk.simple(ast, {
      FunctionDeclaration: () => complexity.functions++,
      ArrowFunctionExpression: () => complexity.functions++,
      IfStatement: () => complexity.branches++,
      SwitchStatement: () => complexity.branches++,
      ConditionalExpression: () => complexity.branches++,
      LogicalExpression: (node) => {
        if (node.operator === '&&' || node.operator === '||') {
          complexity.branches++;
        }
      }
    });

    return complexity;
  }

  extractDependencies(ast) {
    const dependencies = {
      imports: this.extractImports(ast),
      exports: this.extractExports(ast),
      functions: this.extractFunctions(ast),
      variables: this.extractVariables(ast),
      reactive: this.extractSvelteReactive(ast)
    };

    return dependencies;
  }
}

module.exports = { ASTUtils };