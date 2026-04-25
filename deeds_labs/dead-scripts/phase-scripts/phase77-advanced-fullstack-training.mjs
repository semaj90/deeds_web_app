#!/usr/bin/env node
/**
 * Phase 77: Advanced Full-Stack Training Data Generator
 *
 * Extracts patterns from:
 * - SvelteKit (routes, hooks, endpoints, load functions)
 * - TypeScript (advanced types, generics, decorators)
 * - WebGPU (compute shaders, pipelines)
 * - Go microservices (service patterns, gRPC)
 * - Python (async, ML/AI, data processing)
 * - Middleware (authentication, caching, rate limiting)
 * - C++ (CUDA integration, performance-critical code)
 * - JSON schemas and validation
 */

import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(__dirname, '../..');

const OUTPUT_DIR = path.join(rootDir, 'training-data');

/**
 * Extract SvelteKit route patterns
 */
async function extractSvelteKitPatterns() {
  const patterns = [];

  // +page.server.ts patterns
  const serverFiles = await glob('src/routes/**/+page.server.ts', { cwd: rootDir });

  for (const file of serverFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Extract load functions
    const loadMatch = content.match(/export\s+(?:const|async\s+function)\s+load[^{]*{[\s\S]*?(?=\nexport|\n\n|$)/);
    if (loadMatch) {
      patterns.push({
        type: 'load-function',
        file,
        code: loadMatch[0],
        hasAuth: content.includes('locals.user') || content.includes('event.locals'),
        hasDB: content.includes('db.') || content.includes('drizzle'),
        hasCache: content.includes('cache') || content.includes('redis'),
      });
    }

    // Extract actions
    const actionsMatch = content.match(/export\s+const\s+actions[^{]*{[\s\S]*?(?=\nexport|\Z)/);
    if (actionsMatch) {
      patterns.push({
        type: 'form-actions',
        file,
        code: actionsMatch[0],
        actions: (content.match(/(?:default|[\w]+):\s*async/g) || []).length,
      });
    }
  }

  // API route patterns (+server.ts)
  const apiFiles = await glob('src/routes/api/**/+server.ts', { cwd: rootDir });

  for (const file of apiFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Extract request handlers
    const handlers = [];
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const regex = new RegExp(`export\\s+(?:const|async\\s+function)\\s+${method}[^{]*{[\\s\\S]*?(?=\\nexport|\\n\\n|$)`);
      const match = content.match(regex);
      if (match) {
        handlers.push({
          method,
          code: match[0],
        });
      }
    }

    if (handlers.length > 0) {
      patterns.push({
        type: 'api-route',
        file,
        handlers,
        hasValidation: content.includes('zod') || content.includes('schema'),
        hasAuth: content.includes('locals.user'),
      });
    }
  }

  // Hooks patterns
  const hooksFile = path.join(rootDir, 'src/hooks.server.ts');
  try {
    const hooksContent = await fs.readFile(hooksFile, 'utf-8');
    patterns.push({
      type: 'hooks',
      file: 'src/hooks.server.ts',
      code: hooksContent,
      hasHandle: hooksContent.includes('export const handle'),
      hasHandleError: hooksContent.includes('export const handleError'),
    });
  } catch (error) {
    // No hooks file
  }

  return patterns;
}

/**
 * Extract advanced TypeScript patterns
 */
async function extractAdvancedTypeScriptPatterns() {
  const patterns = [];
  const tsFiles = await glob('src/lib/**/*.{ts,tsx}', {
    cwd: rootDir,
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
  });

  for (const file of tsFiles.slice(0, 100)) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');

    // Advanced generics
    const genericMatch = content.match(/(?:type|interface|class)\s+\w+<[^>]+(?:<[^>]+>)*>/g);
    if (genericMatch && genericMatch.length > 2) {
      patterns.push({
        type: 'advanced-generics',
        file,
        examples: genericMatch.slice(0, 3),
        code: content.slice(0, 1000),
      });
    }

    // Utility types
    const utilityTypes = content.match(/(?:Partial|Required|Readonly|Pick|Omit|Record|Extract|Exclude|NonNullable|ReturnType|Awaited)<[^>]+>/g);
    if (utilityTypes && utilityTypes.length > 1) {
      patterns.push({
        type: 'utility-types',
        file,
        utilities: [...new Set(utilityTypes)],
      });
    }

    // Conditional types
    const conditionalMatch = content.match(/type\s+\w+[^=]+=\s+[^;]+extends[^;]+\?[^;]+:[^;]+;/g);
    if (conditionalMatch) {
      patterns.push({
        type: 'conditional-types',
        file,
        examples: conditionalMatch,
      });
    }

    // Decorators (if any)
    const decoratorMatch = content.match(/@\w+(?:\([^)]*\))?/g);
    if (decoratorMatch && decoratorMatch.length > 0) {
      patterns.push({
        type: 'decorators',
        file,
        decorators: [...new Set(decoratorMatch)],
      });
    }
  }

  return patterns.slice(0, 30); // Top 30
}

/**
 * Extract Go microservice patterns
 */
async function extractGoPatterns() {
  const patterns = [];
  const goFiles = await glob('go-services/**/*.go', { cwd: projectRoot });

  for (const file of goFiles.slice(0, 50)) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');

    // Service structs
    const structMatch = content.match(/type\s+\w+Service\s+struct\s*{[\s\S]*?}/g);
    if (structMatch) {
      patterns.push({
        type: 'go-service',
        file,
        structs: structMatch,
        hasGRPC: content.includes('grpc') || content.includes('pb.'),
        hasHTTP: content.includes('http.') || content.includes('gin.'),
      });
    }

    // Interface patterns
    const interfaceMatch = content.match(/type\s+\w+\s+interface\s*{[\s\S]*?}/g);
    if (interfaceMatch) {
      patterns.push({
        type: 'go-interface',
        file,
        interfaces: interfaceMatch.slice(0, 2),
      });
    }

    // Error handling patterns
    if (content.includes('if err != nil')) {
      const errorHandling = content.match(/if err != nil\s*{[\s\S]*?}/g);
      if (errorHandling && errorHandling.length > 3) {
        patterns.push({
          type: 'go-error-handling',
          file,
          examples: errorHandling.slice(0, 3),
        });
      }
    }
  }

  return patterns.slice(0, 25);
}

/**
 * Extract Python patterns
 */
async function extractPythonPatterns() {
  const patterns = [];
  const pyFiles = await glob('**/*.py', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/.venv/**', '**/venv/**'],
  });

  for (const file of pyFiles.slice(0, 50)) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');

    // Async patterns
    const asyncMatch = content.match(/async\s+def\s+\w+[^:]*:[\s\S]*?(?=\nasync\s+def|\nclass|\ndef|\Z)/g);
    if (asyncMatch && asyncMatch.length > 0) {
      patterns.push({
        type: 'python-async',
        file,
        functions: asyncMatch.slice(0, 3),
      });
    }

    // Class patterns with decorators
    const classMatch = content.match(/(?:@[\w.]+(?:\([^)]*\))?\s+)*class\s+\w+[\s\S]*?(?=\nclass|\Z)/g);
    if (classMatch) {
      patterns.push({
        type: 'python-class',
        file,
        classes: classMatch.slice(0, 2),
        hasDataclass: content.includes('@dataclass'),
        hasPydantic: content.includes('BaseModel'),
      });
    }

    // Type hints
    if (content.includes('->') || content.includes(': ')) {
      const typeHints = content.match(/def\s+\w+\([^)]*\)\s*->\s*[^:]+:/g);
      if (typeHints) {
        patterns.push({
          type: 'python-type-hints',
          file,
          examples: typeHints.slice(0, 5),
        });
      }
    }
  }

  return patterns.slice(0, 25);
}

/**
 * Extract WebGPU/CUDA patterns
 */
async function extractGPUPatterns() {
  const patterns = [];

  // WGSL shaders
  const wgslFiles = await glob('**/*.wgsl', { cwd: rootDir });
  for (const file of wgslFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');
    patterns.push({
      type: 'webgpu-shader',
      file,
      code: content,
      hasCompute: content.includes('@compute'),
      hasVertex: content.includes('@vertex'),
      hasFragment: content.includes('@fragment'),
    });
  }

  // CUDA kernels
  const cuFiles = await glob('**/*.{cu,cuh}', { cwd: projectRoot });
  for (const file of cuFiles) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
    const kernels = content.match(/__global__\s+void\s+\w+[^{]*{[\s\S]*?}/g);
    if (kernels) {
      patterns.push({
        type: 'cuda-kernel',
        file,
        kernels: kernels.slice(0, 3),
      });
    }
  }

  // WebGPU TypeScript bindings
  const gpuTsFiles = await glob('src/**/*{gpu,webgpu,compute}*.ts', { cwd: rootDir });
  for (const file of gpuTsFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');
    if (content.includes('GPUDevice') || content.includes('createComputePipeline')) {
      patterns.push({
        type: 'webgpu-typescript',
        file,
        code: content.slice(0, 2000),
      });
    }
  }

  return patterns;
}

/**
 * Extract middleware patterns
 */
async function extractMiddlewarePatterns() {
  const patterns = [];

  // SvelteKit hooks (middleware)
  const hooksFile = path.join(rootDir, 'src/hooks.server.ts');
  try {
    const content = await fs.readFile(hooksFile, 'utf-8');

    // Auth middleware
    if (content.includes('locals.user') || content.includes('session')) {
      patterns.push({
        type: 'auth-middleware',
        file: 'src/hooks.server.ts',
        code: content,
      });
    }

    // Rate limiting
    if (content.includes('rate') || content.includes('limit')) {
      patterns.push({
        type: 'rate-limiting',
        file: 'src/hooks.server.ts',
        code: content,
      });
    }
  } catch (error) {
    // No hooks
  }

  // Go middleware
  const goMiddleware = await glob('go-services/**/middleware/**/*.go', { cwd: projectRoot });
  for (const file of goMiddleware) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
    patterns.push({
      type: 'go-middleware',
      file,
      code: content.slice(0, 1500),
    });
  }

  return patterns;
}

/**
 * Extract JSON schema patterns
 */
async function extractJSONPatterns() {
  const patterns = [];

  // Zod schemas
  const schemaFiles = await glob('src/lib/**/*schema*.ts', { cwd: rootDir });
  for (const file of schemaFiles) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf-8');
    const schemas = content.match(/(?:export\s+)?const\s+\w+Schema\s*=\s*z\.[^;]+;/g);
    if (schemas) {
      patterns.push({
        type: 'zod-schema',
        file,
        schemas: schemas.slice(0, 5),
      });
    }
  }

  // JSON files with schemas
  const jsonFiles = await glob('**/*.schema.json', { cwd: projectRoot });
  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
    patterns.push({
      type: 'json-schema',
      file,
      schema: JSON.parse(content),
    });
  }

  return patterns;
}

/**
 * Generate training examples from patterns
 */
function generateTrainingExamples(allPatterns) {
  const examples = [];

  // SvelteKit patterns
  for (const pattern of allPatterns.sveltekit.slice(0, 15)) {
    if (pattern.type === 'load-function') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert SvelteKit developer specializing in server-side data loading.',
          },
          {
            role: 'user',
            content: 'Show me how to create a SvelteKit load function with database queries and authentication.',
          },
          {
            role: 'assistant',
            content: `Here's a SvelteKit server load function pattern:

\`\`\`typescript
${pattern.code.slice(0, 800)}
\`\`\`

Key features:
- ${pattern.hasAuth ? '✅ Authentication check via locals.user' : '❌ No auth'}
- ${pattern.hasDB ? '✅ Database queries with Drizzle ORM' : '❌ No DB'}
- ${pattern.hasCache ? '✅ Redis caching layer' : '❌ No caching'}
- Type-safe with TypeScript
- Returns data for the page component`,
          },
        ],
        metadata: {
          category: 'sveltekit-load',
          tags: ['sveltekit', 'load-function', 'server-side', 'typescript'],
          source: pattern.file,
        },
      });
    } else if (pattern.type === 'api-route') {
      for (const handler of pattern.handlers.slice(0, 2)) {
        examples.push({
          messages: [
            {
              role: 'system',
              content: 'You are an expert in building RESTful APIs with SvelteKit.',
            },
            {
              role: 'user',
              content: `How do I create a ${handler.method} endpoint in SvelteKit?`,
            },
            {
              role: 'assistant',
              content: `Here's a ${handler.method} API route in SvelteKit:

\`\`\`typescript
${handler.code.slice(0, 700)}
\`\`\`

Best practices:
- Use \`RequestHandler\` type for type safety
- ${pattern.hasValidation ? 'Validate input with Zod schemas' : 'Add input validation'}
- ${pattern.hasAuth ? 'Check authentication via event.locals' : 'Add authentication'}
- Return JSON with proper status codes
- Handle errors gracefully`,
            },
          ],
          metadata: {
            category: 'sveltekit-api',
            method: handler.method,
            tags: ['sveltekit', 'api', 'rest', handler.method.toLowerCase()],
            source: pattern.file,
          },
        });
      }
    }
  }

  // Advanced TypeScript
  for (const pattern of allPatterns.typescript.slice(0, 10)) {
    if (pattern.type === 'advanced-generics') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a TypeScript expert specializing in advanced type systems.',
          },
          {
            role: 'user',
            content: 'Show me advanced generic patterns in TypeScript.',
          },
          {
            role: 'assistant',
            content: `Here are advanced generic patterns:

\`\`\`typescript
${pattern.examples.join('\n\n')}
\`\`\`

Key concepts:
- Generic constraints with \`extends\`
- Multiple type parameters
- Default generic types
- Conditional types with generics
- Mapped types over generics`,
          },
        ],
        metadata: {
          category: 'typescript-advanced',
          subcategory: 'generics',
          tags: ['typescript', 'generics', 'advanced-types'],
          source: pattern.file,
        },
      });
    } else if (pattern.type === 'utility-types') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a TypeScript expert teaching utility types.',
          },
          {
            role: 'user',
            content: 'How do I use TypeScript utility types effectively?',
          },
          {
            role: 'assistant',
            content: `TypeScript utility types help transform types:

\`\`\`typescript
${pattern.utilities.slice(0, 5).join('\n')}
\`\`\`

Common utilities:
- \`Partial<T>\` - Makes all properties optional
- \`Required<T>\` - Makes all properties required
- \`Pick<T, K>\` - Selects specific properties
- \`Omit<T, K>\` - Removes specific properties
- \`Record<K, V>\` - Creates object type with key-value pairs`,
          },
        ],
        metadata: {
          category: 'typescript-advanced',
          subcategory: 'utility-types',
          tags: ['typescript', 'utility-types', 'transformations'],
          source: pattern.file,
        },
      });
    }
  }

  // Go microservices
  for (const pattern of allPatterns.go.slice(0, 10)) {
    if (pattern.type === 'go-service') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert Go developer building microservices.',
          },
          {
            role: 'user',
            content: 'Show me a Go microservice structure with dependency injection.',
          },
          {
            role: 'assistant',
            content: `Here's a Go service pattern:

\`\`\`go
${pattern.structs[0]}

// Constructor with dependency injection
func New${pattern.structs[0].match(/type\s+(\w+)Service/)?.[1] || 'Service'}(deps Dependencies) *Service {
    return &Service{
        // inject dependencies
    }
}
\`\`\`

Features:
- ${pattern.hasGRPC ? '✅ gRPC support' : '❌ No gRPC'}
- ${pattern.hasHTTP ? '✅ HTTP endpoints' : '❌ No HTTP'}
- Dependency injection via constructor
- Interface-based design`,
          },
        ],
        metadata: {
          category: 'go-microservices',
          tags: ['go', 'microservices', 'architecture', 'dependency-injection'],
          source: pattern.file,
        },
      });
    }
  }

  // Python async
  for (const pattern of allPatterns.python.slice(0, 10)) {
    if (pattern.type === 'python-async') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a Python expert specializing in async/await patterns.',
          },
          {
            role: 'user',
            content: 'How do I write asynchronous Python code?',
          },
          {
            role: 'assistant',
            content: `Here are Python async patterns:

\`\`\`python
${pattern.functions[0].slice(0, 500)}
\`\`\`

Best practices:
- Use \`async def\` for async functions
- \`await\` for async calls
- \`asyncio.gather()\` for concurrent execution
- Proper error handling with try/except
- Type hints for better IDE support`,
          },
        ],
        metadata: {
          category: 'python-async',
          tags: ['python', 'async', 'concurrency', 'asyncio'],
          source: pattern.file,
        },
      });
    }
  }

  // WebGPU/CUDA
  for (const pattern of allPatterns.gpu) {
    if (pattern.type === 'webgpu-shader') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a WebGPU expert writing compute shaders in WGSL.',
          },
          {
            role: 'user',
            content: 'Show me how to write a WebGPU compute shader.',
          },
          {
            role: 'assistant',
            content: `Here's a WebGPU compute shader in WGSL:

\`\`\`wgsl
${pattern.code.slice(0, 600)}
\`\`\`

Key concepts:
- \`@compute\` entry point
- Workgroup size declaration
- Storage buffers for data
- Built-in variables (\`global_invocation_id\`)
- Atomic operations for synchronization`,
          },
        ],
        metadata: {
          category: 'webgpu',
          subcategory: 'compute-shader',
          tags: ['webgpu', 'wgsl', 'compute', 'gpu'],
          source: pattern.file,
        },
      });
    } else if (pattern.type === 'cuda-kernel') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a CUDA expert writing high-performance GPU kernels.',
          },
          {
            role: 'user',
            content: 'How do I write a CUDA kernel?',
          },
          {
            role: 'assistant',
            content: `Here's a CUDA kernel pattern:

\`\`\`cuda
${pattern.kernels[0].slice(0, 500)}
\`\`\`

CUDA fundamentals:
- \`__global__\` for kernel functions
- Thread indexing: \`blockIdx\`, \`threadIdx\`
- Shared memory for optimization
- Memory coalescing for performance
- Synchronization with \`__syncthreads()\``,
          },
        ],
        metadata: {
          category: 'cuda',
          tags: ['cuda', 'gpu', 'parallel-computing', 'cpp'],
          source: pattern.file,
        },
      });
    }
  }

  // JSON schemas
  for (const pattern of allPatterns.json.slice(0, 8)) {
    if (pattern.type === 'zod-schema') {
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are an expert in runtime type validation with Zod.',
          },
          {
            role: 'user',
            content: 'How do I create validation schemas with Zod in TypeScript?',
          },
          {
            role: 'assistant',
            content: `Here are Zod schema patterns:

\`\`\`typescript
${pattern.schemas.slice(0, 3).join('\n\n')}
\`\`\`

Zod features:
- Runtime type validation
- TypeScript type inference
- Composable schemas
- Custom error messages
- Transform and refine methods`,
          },
        ],
        metadata: {
          category: 'validation',
          subcategory: 'zod',
          tags: ['zod', 'validation', 'typescript', 'schemas'],
          source: pattern.file,
        },
      });
    }
  }

  return examples;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77: Advanced Full-Stack Training Data Generator        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log('📊 Extracting advanced patterns...\n');

  const allPatterns = {
    sveltekit: [],
    typescript: [],
    go: [],
    python: [],
    gpu: [],
    middleware: [],
    json: [],
  };

  try {
    console.log('   🔍 SvelteKit patterns (routes, hooks, API)...');
    allPatterns.sveltekit = await extractSvelteKitPatterns();
    console.log(`      ✅ Found ${allPatterns.sveltekit.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 Advanced TypeScript patterns...');
    allPatterns.typescript = await extractAdvancedTypeScriptPatterns();
    console.log(`      ✅ Found ${allPatterns.typescript.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 Go microservice patterns...');
    allPatterns.go = await extractGoPatterns();
    console.log(`      ✅ Found ${allPatterns.go.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 Python async/AI patterns...');
    allPatterns.python = await extractPythonPatterns();
    console.log(`      ✅ Found ${allPatterns.python.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 WebGPU/CUDA patterns...');
    allPatterns.gpu = await extractGPUPatterns();
    console.log(`      ✅ Found ${allPatterns.gpu.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 Middleware patterns...');
    allPatterns.middleware = await extractMiddlewarePatterns();
    console.log(`      ✅ Found ${allPatterns.middleware.length} patterns`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}`);
  }

  try {
    console.log('   🔍 JSON schema patterns...');
    allPatterns.json = await extractJSONPatterns();
    console.log(`      ✅ Found ${allPatterns.json.length} patterns\n`);
  } catch (error) {
    console.log(`      ⚠️  Error: ${error.message}\n`);
  }

  console.log('📝 Generating advanced training examples...\n');

  const examples = generateTrainingExamples(allPatterns);

  // Group by category
  const byCategory = {};
  for (const ex of examples) {
    const cat = ex.metadata.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(ex);
  }

  // Write category files
  let totalExamples = 0;
  for (const [category, catExamples] of Object.entries(byCategory)) {
    const filename = `${category}.jsonl`;
    const filePath = path.join(OUTPUT_DIR, filename);
    const jsonl = catExamples.map(ex => JSON.stringify(ex)).join('\n');
    await fs.writeFile(filePath, jsonl, 'utf-8');

    const fileSize = (jsonl.length / 1024).toFixed(1);
    console.log(`   ✅ ${filename.padEnd(35)} ${catExamples.length.toString().padStart(3)} examples | ${fileSize.padStart(6)} KB`);
    totalExamples += catExamples.length;
  }

  // Write combined file
  const combinedPath = path.join(OUTPUT_DIR, 'advanced-fullstack-combined.jsonl');
  const combinedJsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(combinedPath, combinedJsonl, 'utf-8');
  const combinedSize = (combinedJsonl.length / 1024).toFixed(1);
  console.log(`   ✅ ${'advanced-fullstack-combined.jsonl'.padEnd(35)} ${examples.length.toString().padStart(3)} examples | ${combinedSize.padStart(6)} KB`);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Advanced Training Data Generation Complete                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`   📊 Total Examples:        ${totalExamples}`);
  console.log(`   📁 Output Directory:      ${OUTPUT_DIR}`);
  console.log(`   🎯 Categories:            ${Object.keys(byCategory).length}`);
  console.log(`\n   Category Breakdown:`);

  for (const [cat, catExamples] of Object.entries(byCategory)) {
    console.log(`      ${cat.padEnd(30)} ${catExamples.length.toString().padStart(3)} examples`);
  }

  console.log(`\n✅ Ready for fine-tuning!\n`);
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
