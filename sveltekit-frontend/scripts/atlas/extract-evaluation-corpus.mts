#!/usr/bin/env node
/**
 * Phase 2F.1: Ground-Truth Extraction Script
 * Task 2.1: Extract evaluation corpus from four provenance sources
 *
 * Four deterministic extractors:
 * 1. AST walker (tree-sitter): function declarations, confidence 0.95
 * 2. Route scanner: +page.server.ts, +server.ts handlers, confidence 0.85
 * 3. Schema parser: table/column definitions, confidence 0.90
 * 4. Test file scanner: test discovery, confidence 0.80
 *
 * Output: evaluation_evidence + evaluation_relevance rows (dry-run by default)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// ============================================================================
// TYPES & VALIDATION
// ============================================================================

const EvidenceSchema = z.object({
  packet_key: z.string(),
  source_ref: z.string(),
  query_id: z.string().uuid(),
  evidence_type: z.enum(['ast', 'route', 'schema', 'test', 'semantic']),
  evidence_detail: z.record(z.unknown()),
  extractor_version: z.string(),
  extractor_name: z.string(),
  confidence: z.number().min(0).max(1),
});

type Evidence = z.infer<typeof EvidenceSchema>;

const EvaluationQuerySchema = z.object({
  id: z.string().uuid(),
  query: z.string(),
  domain: z.enum(['programming-languages', 'web-markup', 'networking', 'architecture', 'algorithms']),
  difficulty: z.number().int().min(1).max(5),
});

type EvaluationQuery = z.infer<typeof EvaluationQuerySchema>;

// ============================================================================
// EXTRACTORS
// ============================================================================

/**
 * AST Extractor: Walk TypeScript/JavaScript AST to find function declarations
 */
class AstExtractor {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.language);
  }

  async extract(filePath: string, sourceRef: string): Promise<Evidence[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const tree = this.parser.parse(content);
    const results: Evidence[] = [];

    const walk = (node: Parser.SyntaxNode) => {
      // Function declaration
      if (
        node.type === 'function_declaration' ||
        node.type === 'arrow_function' ||
        node.type === 'method_definition'
      ) {
        const nameNode = node.child(1) || node.childByFieldName('name');
        if (nameNode) {
          results.push({
            packet_key: `ast:${sourceRef}:${nameNode.text}`,
            source_ref: sourceRef,
            query_id: '00000000-0000-0000-0000-000000000000', // placeholder, will be joined later
            evidence_type: 'ast',
            evidence_detail: {
              kind: node.type,
              symbol: nameNode.text,
              line_start: node.startPosition.row + 1,
              line_end: node.endPosition.row + 1,
              column_start: node.startPosition.column,
            },
            extractor_version: 'tree-sitter-v0.20',
            extractor_name: 'ts-ast-walker',
            confidence: 0.95,
          });
        }
      }

      // Variable declaration (exports)
      if (node.type === 'variable_declarator') {
        const nameNode = node.childByFieldName('name');
        if (nameNode) {
          results.push({
            packet_key: `ast:${sourceRef}:${nameNode.text}`,
            source_ref: sourceRef,
            query_id: '00000000-0000-0000-0000-000000000000',
            evidence_type: 'ast',
            evidence_detail: {
              kind: 'variable',
              symbol: nameNode.text,
              line_start: node.startPosition.row + 1,
              line_end: node.endPosition.row + 1,
            },
            extractor_version: 'tree-sitter-v0.20',
            extractor_name: 'ts-ast-walker',
            confidence: 0.95,
          });
        }
      }

      // Type definition
      if (node.type === 'type_alias_declaration' || node.type === 'interface_declaration') {
        const nameNode = node.childByFieldName('name');
        if (nameNode) {
          results.push({
            packet_key: `ast:${sourceRef}:${nameNode.text}`,
            source_ref: sourceRef,
            query_id: '00000000-0000-0000-0000-000000000000',
            evidence_type: 'ast',
            evidence_detail: {
              kind: node.type,
              symbol: nameNode.text,
              line_start: node.startPosition.row + 1,
              line_end: node.endPosition.row + 1,
            },
            extractor_version: 'tree-sitter-v0.20',
            extractor_name: 'ts-ast-walker',
            confidence: 0.95,
          });
        }
      }

      for (const child of node.children) {
        walk(child);
      }
    };

    walk(tree.rootNode);
    return results;
  }
}

/**
 * Route Extractor: Scan src/routes for +page.server.ts and +server.ts
 */
class RouteExtractor {
  async extract(): Promise<Evidence[]> {
    const results: Evidence[] = [];
    const routesDir = path.join(projectRoot, 'src', 'routes');

    if (!fs.existsSync(routesDir)) return results;

    const scanDir = (dir: string, basePath: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (entry.name === '+page.server.ts' || entry.name === '+server.ts') {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const exportMatch = content.match(/export\s+(const|async\s+function|function)\s+(\w+)/g);

          const routePath = relPath.replace(/\\/g, '/').replace(/\.ts$/, '');

          if (exportMatch) {
            for (const match of exportMatch) {
              const nameMatch = match.match(/\b(\w+)$/);
              if (nameMatch) {
                results.push({
                  packet_key: `route:${routePath}:${nameMatch[1]}`,
                  source_ref: fullPath.replace(projectRoot, '.'),
                  query_id: '00000000-0000-0000-0000-000000000000',
                  evidence_type: 'route',
                  evidence_detail: {
                    handler: nameMatch[1],
                    file: entry.name,
                    route_path: routePath,
                  },
                  extractor_version: 'v1.0',
                  extractor_name: 'route-manifest-scanner',
                  confidence: 0.85,
                });
              }
            }
          }
        }
      }
    };

    scanDir(routesDir);
    return results;
  }
}

/**
 * Schema Extractor: Parse schema-postgres.ts for table/column definitions
 */
class SchemaExtractor {
  async extract(): Promise<Evidence[]> {
    const results: Evidence[] = [];
    const schemaFile = path.join(projectRoot, 'src', 'lib', 'server', 'db', 'schema-postgres.ts');

    if (!fs.existsSync(schemaFile)) return results;

    const content = fs.readFileSync(schemaFile, 'utf-8');

    // Find table definitions (pgTable calls)
    const tableRegex = /export const (\w+)\s*=\s*pgTable\s*\(\s*['"`](\w+)['"`]/g;
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      const [, tableName, dbName] = match;
      results.push({
        packet_key: `schema:table:${dbName}`,
        source_ref: 'src/lib/server/db/schema-postgres.ts',
        query_id: '00000000-0000-0000-0000-000000000000',
        evidence_type: 'schema',
        evidence_detail: {
          kind: 'table',
          name: dbName,
          ts_name: tableName,
          line_start: content.substring(0, match.index).split('\n').length,
        },
        extractor_version: 'v1.0',
        extractor_name: 'schema-parser',
        confidence: 0.90,
      });
    }

    // Find enum definitions
    const enumRegex = /export const (\w+)Enum\s*=\s*pgEnum\s*\(\s*['"`](\w+)['"`]/g;

    while ((match = enumRegex.exec(content)) !== null) {
      const [, enumName, dbName] = match;
      results.push({
        packet_key: `schema:enum:${dbName}`,
        source_ref: 'src/lib/server/db/schema-postgres.ts',
        query_id: '00000000-0000-0000-0000-000000000000',
        evidence_type: 'schema',
        evidence_detail: {
          kind: 'enum',
          name: dbName,
          ts_name: enumName,
          line_start: content.substring(0, match.index).split('\n').length,
        },
        extractor_version: 'v1.0',
        extractor_name: 'schema-parser',
        confidence: 0.90,
      });
    }

    return results;
  }
}

/**
 * Test Extractor: Scan tests/ directory for test files
 */
class TestExtractor {
  async extract(): Promise<Evidence[]> {
    const results: Evidence[] = [];
    const testsDir = path.join(projectRoot, 'tests');

    if (!fs.existsSync(testsDir)) return results;

    const scanDir = (dir: string, basePath: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(basePath, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const describeMatch = content.match(/describe\s*\(['"`]([^'"`]+)['"`]/g);

          const testPath = relPath.replace(/\\/g, '/').replace(/\.ts$/, '');

          if (describeMatch) {
            for (const match of describeMatch) {
              const suiteMatch = match.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
              if (suiteMatch) {
                results.push({
                  packet_key: `test:${testPath}:${suiteMatch[1]}`,
                  source_ref: fullPath.replace(projectRoot, '.'),
                  query_id: '00000000-0000-0000-0000-000000000000',
                  evidence_type: 'test',
                  evidence_detail: {
                    suite: suiteMatch[1],
                    file: entry.name,
                    test_path: testPath,
                  },
                  extractor_version: 'v1.0',
                  extractor_name: 'test-file-scanner',
                  confidence: 0.80,
                });
              }
            }
          }
        }
      }
    };

    scanDir(testsDir);
    return results;
  }
}

// ============================================================================
// 50 EVALUATION QUERIES
// ============================================================================

const EVALUATION_QUERIES: EvaluationQuery[] = [
  // Programming Languages Domain (10 queries)
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    query: 'TypeScript function declarations',
    domain: 'programming-languages',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    query: 'async/await patterns',
    domain: 'programming-languages',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    query: 'promise chaining',
    domain: 'programming-languages',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    query: 'error handling try-catch',
    domain: 'programming-languages',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    query: 'variable scoping and closures',
    domain: 'programming-languages',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440006',
    query: 'destructuring assignment',
    domain: 'programming-languages',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440007',
    query: 'spread operator usage',
    domain: 'programming-languages',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440008',
    query: 'template literals and interpolation',
    domain: 'programming-languages',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440009',
    query: 'arrow function syntax',
    domain: 'programming-languages',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440010',
    query: 'higher-order functions and callbacks',
    domain: 'programming-languages',
    difficulty: 3,
  },

  // Web Markup Domain (12 queries)
  {
    id: '550e8400-e29b-41d4-a716-446655440011',
    query: 'Svelte 5 runes state management',
    domain: 'web-markup',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440012',
    query: 'component props and binding',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440013',
    query: 'conditional rendering',
    domain: 'web-markup',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440014',
    query: 'event handling',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440015',
    query: 'form handling and validation',
    domain: 'web-markup',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440016',
    query: 'CSS styling and UnoCSS utilities',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440017',
    query: 'modal and dialog components',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440018',
    query: 'list rendering and iteration',
    domain: 'web-markup',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440019',
    query: 'accessibility attributes',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440020',
    query: 'responsive layout patterns',
    domain: 'web-markup',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440021',
    query: 'animation and transitions',
    domain: 'web-markup',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440022',
    query: 'bits-ui component usage',
    domain: 'web-markup',
    difficulty: 2,
  },

  // Networking Domain (10 queries)
  {
    id: '550e8400-e29b-41d4-a716-446655440023',
    query: 'HTTP GET and POST requests',
    domain: 'networking',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440024',
    query: 'API endpoint design',
    domain: 'networking',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440025',
    query: 'request authentication and authorization',
    domain: 'networking',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440026',
    query: 'CORS and security headers',
    domain: 'networking',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440027',
    query: 'error handling and status codes',
    domain: 'networking',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440028',
    query: 'streaming and Server-Sent Events',
    domain: 'networking',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440029',
    query: 'WebSocket connections',
    domain: 'networking',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440030',
    query: 'JSON serialization and deserialization',
    domain: 'networking',
    difficulty: 1,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440031',
    query: 'HTTP caching strategies',
    domain: 'networking',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440032',
    query: 'file upload handling',
    domain: 'networking',
    difficulty: 2,
  },

  // Architecture Domain (10 queries)
  {
    id: '550e8400-e29b-41d4-a716-446655440033',
    query: 'layered architecture patterns',
    domain: 'architecture',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440034',
    query: 'module dependency management',
    domain: 'architecture',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440035',
    query: 'singleton and factory patterns',
    domain: 'architecture',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440036',
    query: 'service-oriented architecture',
    domain: 'architecture',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440037',
    query: 'event-driven architecture',
    domain: 'architecture',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440038',
    query: 'database schema design',
    domain: 'architecture',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440039',
    query: 'caching and memoization',
    domain: 'architecture',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440040',
    query: 'middleware and interceptors',
    domain: 'architecture',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440041',
    query: 'dependency injection',
    domain: 'architecture',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440042',
    query: 'microservices communication',
    domain: 'architecture',
    difficulty: 3,
  },

  // Algorithms Domain (8 queries)
  {
    id: '550e8400-e29b-41d4-a716-446655440043',
    query: 'sorting and searching algorithms',
    domain: 'algorithms',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440044',
    query: 'graph traversal and pathfinding',
    domain: 'algorithms',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440045',
    query: 'dynamic programming patterns',
    domain: 'algorithms',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440046',
    query: 'hash tables and data structures',
    domain: 'algorithms',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440047',
    query: 'tree data structures',
    domain: 'algorithms',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440048',
    query: 'bit manipulation techniques',
    domain: 'algorithms',
    difficulty: 3,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440049',
    query: 'string matching and parsing',
    domain: 'algorithms',
    difficulty: 2,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440050',
    query: 'matrix operations and transformations',
    domain: 'algorithms',
    difficulty: 3,
  },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const verbose = args.includes('--verbose');

  console.log('Phase 2F.1 Ground-Truth Extraction');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    // Initialize extractors
    const astExtractor = new AstExtractor();
    const routeExtractor = new RouteExtractor();
    const schemaExtractor = new SchemaExtractor();
    const testExtractor = new TestExtractor();

    const allEvidence: Evidence[] = [];

    // Run extractors
    console.log('Running AST extractor...');
    const tsFiles = findFiles(path.join(projectRoot, 'src'), /\.(ts|tsx)$/);
    for (const file of tsFiles) {
      const relPath = path.relative(projectRoot, file);
      try {
        const evidence = await astExtractor.extract(file, relPath);
        allEvidence.push(...evidence);
      } catch (err) {
        if (verbose) console.warn(`  Warning: Failed to parse ${relPath}`);
      }
    }
    console.log(`  Found ${allEvidence.filter((e) => e.evidence_type === 'ast').length} AST symbols`);

    console.log('Running route extractor...');
    const routeEvidence = await routeExtractor.extract();
    allEvidence.push(...routeEvidence);
    console.log(`  Found ${routeEvidence.length} routes`);

    console.log('Running schema extractor...');
    const schemaEvidence = await schemaExtractor.extract();
    allEvidence.push(...schemaEvidence);
    console.log(`  Found ${schemaEvidence.length} schema definitions`);

    console.log('Running test extractor...');
    const testEvidence = await testExtractor.extract();
    allEvidence.push(...testEvidence);
    console.log(`  Found ${testEvidence.length} test suites`);

    console.log('');
    console.log(`Total evidence collected: ${allEvidence.length}`);
    console.log(`Total evaluation queries: ${EVALUATION_QUERIES.length}`);
    console.log('');

    // Validation
    let validated = 0;
    let failed = 0;
    for (const evidence of allEvidence) {
      try {
        EvidenceSchema.parse(evidence);
        validated++;
      } catch (err) {
        failed++;
        if (verbose) console.warn(`  Invalid evidence: ${evidence.packet_key}`);
      }
    }

    console.log(`Validation: ${validated}/${allEvidence.length} passed`);
    if (failed > 0) console.log(`  ${failed} evidence items failed validation`);
    console.log('');

    if (!dryRun) {
      console.log('⚠️  --apply flag not provided. Use --apply to persist to database.');
      console.log('To apply: npm run extract:evaluation-corpus -- --apply');
    } else {
      console.log('✓ Dry-run complete. Ready for full extraction.');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  const walk = (current: string) => {
    if (!fs.existsSync(current)) return;

    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      // Skip node_modules, dist, build, .git, etc.
      if (/^\./.test(entry.name) || /node_modules|dist|build|\.git/.test(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  };

  walk(dir);
  return results;
}

main();
