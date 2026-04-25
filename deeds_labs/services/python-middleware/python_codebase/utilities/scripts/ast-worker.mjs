/**
 * AST Worker - Processes code files for embedding and analysis
 * Runs in Worker Thread for non-blocking operation
 */

import { parentPort, workerData } from "worker_threads";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import parser from "@typescript-eslint/parser";
import { parse as parseJS } from "@babel/parser";
import { parse as parseSvelte } from "svelte/compiler";

const { file } = workerData;

/**
 * Parse different file types into ASTs
 */
async function parseFile(filePath, content) {
  const extension = filePath.split('.').pop().toLowerCase();

  try {
    switch (extension) {
      case 'ts':
      case 'tsx':
        return await parseTypeScript(content);

      case 'js':
      case 'jsx':
        return parseJavaScript(content);

      case 'svelte':
        return await parseSvelteComponent(content);

      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  } catch (error) {
    throw new Error(`Parse error for ${filePath}: ${error.message}`);
  }
}

/**
 * Parse TypeScript content
 */
async function parseTypeScript(content) {
  try {
    const ast = parser.parse(content, {
      sourceType: "module",
      ecmaVersion: 2023,
      ecmaFeatures: {
        jsx: true,
        globalReturn: false,
        impliedStrict: true
      },
      project: "./tsconfig.json", // Use project's TypeScript config
      tsconfigRootDir: process.cwd(),
      extraFileExtensions: [".svelte"]
    });

    return {
      type: 'typescript',
      ast: ast,
      imports: extractImports(ast),
      exports: extractExports(ast),
      functions: extractFunctions(ast),
      types: extractTypes(ast),
      components: extractComponents(ast)
    };
  } catch (error) {
    throw new Error(`TypeScript parsing failed: ${error.message}`);
  }
}

/**
 * Parse JavaScript content
 */
function parseJavaScript(content) {
  try {
    const ast = parseJS(content, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      allowNewTargetOutsideFunction: true,
      plugins: [
        "jsx",
        "typescript",
        "decorators-legacy",
        "classProperties",
        "asyncGenerators",
        "functionBind",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "dynamicImport",
        "nullishCoalescingOperator",
        "optionalChaining",
        "importMeta",
        "topLevelAwait",
        "classStaticBlock"
      ]
    });

    return {
      type: 'javascript',
      ast: ast,
      imports: extractImports(ast),
      exports: extractExports(ast),
      functions: extractFunctions(ast)
    };
  } catch (error) {
    throw new Error(`JavaScript parsing failed: ${error.message}`);
  }
}

/**
 * Parse Svelte component
 */
async function parseSvelteComponent(content) {
  try {
    const { ast, warnings } = parseSvelte(content, {
      filename: file,
      generate: false, // We just want the AST, not compiled output
      hydratable: false,
      legacy: false
    });

    // Extract script content for further analysis
    let scriptContent = '';
    let scriptLang = 'javascript';

    if (ast.instance) {
      scriptContent = content.slice(ast.instance.content.start, ast.instance.content.end);
      scriptLang = ast.instance.attributes?.find(attr => attr.name === 'lang')?.value?.[0]?.data || 'javascript';
    }

    let scriptAST = null;
    if (scriptContent.trim()) {
      try {
        if (scriptLang === 'ts' || scriptLang === 'typescript') {
          scriptAST = await parseTypeScript(scriptContent);
        } else {
          scriptAST = parseJavaScript(scriptContent);
        }
      } catch (error) {
        console.warn(`Failed to parse script in ${file}:`, error.message);
      }
    }

    return {
      type: 'svelte',
      ast: ast,
      warnings: warnings,
      script: scriptAST,
      props: extractSvelteProps(ast),
      stores: extractSvelteStores(scriptContent),
      components: extractSvelteComponents(ast),
      actions: extractSvelteActions(ast)
    };
  } catch (error) {
    throw new Error(`Svelte parsing failed: ${error.message}`);
  }
}

/**
 * Extract import statements from AST
 */
function extractImports(ast) {
  const imports = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'ImportDeclaration') {
      imports.push({
        source: node.source.value,
        specifiers: node.specifiers?.map(spec => ({
          type: spec.type,
          imported: spec.imported?.name || spec.local?.name,
          local: spec.local?.name
        })) || []
      });
    }

    // Recursively walk child nodes
    for (const key in node) {
      if (key === 'parent') continue; // Avoid circular references
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkNode);
      } else if (child && typeof child === 'object') {
        walkNode(child);
      }
    }
  }

  walkNode(ast);
  return imports;
}

/**
 * Extract export statements from AST
 */
function extractExports(ast) {
  const exports = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      exports.push({
        type: node.type,
        declaration: node.declaration?.type,
        name: node.declaration?.id?.name || 'default'
      });
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkNode);
      } else if (child && typeof child === 'object') {
        walkNode(child);
      }
    }
  }

  walkNode(ast);
  return exports;
}

/**
 * Extract function definitions from AST
 */
function extractFunctions(ast) {
  const functions = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'FunctionDeclaration' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression') {
      functions.push({
        type: node.type,
        name: node.id?.name || 'anonymous',
        params: node.params?.map(param => param.name || 'destructured') || [],
        async: node.async || false,
        generator: node.generator || false
      });
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkNode);
      } else if (child && typeof child === 'object') {
        walkNode(child);
      }
    }
  }

  walkNode(ast);
  return functions;
}

/**
 * Extract TypeScript type definitions
 */
function extractTypes(ast) {
  const types = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'TSTypeAliasDeclaration' ||
        node.type === 'TSInterfaceDeclaration') {
      types.push({
        type: node.type,
        name: node.id?.name,
        exported: false // We'd need to check if it's in an export
      });
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkNode);
      } else if (child && typeof child === 'object') {
        walkNode(child);
      }
    }
  }

  walkNode(ast);
  return types;
}

/**
 * Extract component usage from AST
 */
function extractComponents(ast) {
  const components = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    // JSX components
    if (node.type === 'JSXElement' && node.openingElement?.name?.name) {
      const name = node.openingElement.name.name;
      if (name && /^[A-Z]/.test(name)) { // Component names start with uppercase
        components.push({
          name: name,
          type: 'jsx'
        });
      }
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkNode);
      } else if (child && typeof child === 'object') {
        walkNode(child);
      }
    }
  }

  walkNode(ast);
  return [...new Set(components.map(c => c.name))].map(name => ({ name, type: 'jsx' }));
}

/**
 * Extract Svelte-specific props
 */
function extractSvelteProps(ast) {
  const props = [];

  // Look for let declarations that might be props
  function walkScript(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration') {
      node.declarations?.forEach(decl => {
        if (decl.id?.name) {
          // In Svelte 5, props are defined with let { propName }: Props = $props()
          props.push({
            name: decl.id.name,
            exported: node.kind === 'let' // Svelte props use let
          });
        }
      });
    }

    for (const key in node) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walkScript);
      } else if (child && typeof child === 'object') {
        walkScript(child);
      }
    }
  }

  if (ast.instance?.content) {
    walkScript(ast.instance.content);
  }

  return props;
}

/**
 * Extract Svelte store usage
 */
function extractSvelteStores(scriptContent) {
  const stores = [];
  const storePatterns = [
    /\$derived\(/g,
    /\$state\(/g,
    /\$effect\(/g,
    /\$props\(/g,
    /\$bindable\(/g
  ];

  storePatterns.forEach((pattern, index) => {
    const storeTypes = ['derived', 'state', 'effect', 'props', 'bindable'];
    const matches = scriptContent.match(pattern);
    if (matches) {
      stores.push({
        type: storeTypes[index],
        count: matches.length
      });
    }
  });

  return stores;
}

/**
 * Extract Svelte components
 */
function extractSvelteComponents(ast) {
  const components = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Element' || node.type === 'InlineComponent') {
      const name = node.name;
      if (name && /^[A-Z]/.test(name)) {
        components.push({
          name: name,
          type: 'svelte-component'
        });
      }
    }

    if (node.children) {
      node.children.forEach(walkNode);
    }
  }

  if (ast.html) {
    walkNode(ast.html);
  }

  return [...new Set(components.map(c => c.name))].map(name => ({ name, type: 'svelte-component' }));
}

/**
 * Extract Svelte actions
 */
function extractSvelteActions(ast) {
  const actions = [];

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Element' && node.attributes) {
      node.attributes.forEach(attr => {
        if (attr.type === 'Action') {
          actions.push({
            name: attr.name,
            type: 'action'
          });
        }
      });
    }

    if (node.children) {
      node.children.forEach(walkNode);
    }
  }

  if (ast.html) {
    walkNode(ast.html);
  }

  return actions;
}

/**
 * Generate hash for AST comparison
 */
function generateASTHash(ast) {
  const astString = JSON.stringify(ast, null, 0);
  return createHash('sha256').update(astString).digest('hex');
}

/**
 * Main worker processing
 */
async function processFile() {
  try {
    console.log(`🔧 AST Worker processing: ${file}`);

    // Read file content
    const content = await fs.readFile(file, 'utf8');

    // Parse into AST
    const astResult = await parseFile(file, content);

    // Generate hash for change detection
    const astHash = generateASTHash(astResult);

    // Send results back to main thread
    parentPort?.postMessage({
      type: 'ast',
      file: file,
      ast: astResult,
      astHash: astHash,
      content: content,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ AST Worker completed: ${file}`);

  } catch (error) {
    console.error(`❌ AST Worker error for ${file}:`, error);

    parentPort?.postMessage({
      type: 'error',
      file: file,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Start processing
if (parentPort) {
  processFile().catch(error => {
    parentPort.postMessage({
      type: 'error',
      file: file,
      details: `Worker initialization failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  });
} else {
  console.error('❌ AST Worker must be run in a Worker Thread');
  process.exit(1);
}