// @vitest-environment node
/**
 * OKF Contract Tests
 *
 * Validates that the .okf/ manifest and language specs conform to the contract:
 * - Manifest structure is valid
 * - All declared language specs exist
 * - Pipeline order is topologically correct
 * - No missing dependencies
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OKFLoader, validateOKFContract, OKFManifestSchema, LanguageSpecSchema } from '../scripts/atlas/lib/okf-schema.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const okfRoot = path.resolve(__dirname, '../../.okf');

describe('OKF Schema Contract', () => {
  let loader: OKFLoader;

  beforeAll(() => {
    loader = new OKFLoader(okfRoot);
  });

  describe('Manifest Loading', () => {
    it('loads the OKF manifest without errors', async () => {
      const manifest = await loader.loadManifest();
      expect(manifest).toBeDefined();
      expect(manifest.version).toBe(1);
    });

    it('manifest has valid structure', async () => {
      const manifest = await loader.loadManifest();

      expect(manifest.registries).toBeDefined();
      expect(manifest.registries.languages).toBeDefined();
      expect(manifest.extractors).toBeDefined();
      expect(manifest.pipeline).toBeDefined();
    });

    it('manifest passes Zod validation', async () => {
      const manifest = await loader.loadManifest();
      const validated = OKFManifestSchema.parse(manifest);
      expect(validated).toEqual(manifest);
    });

    it('pipeline has expected number of stages', async () => {
      const manifest = await loader.loadManifest();
      const stages = Object.keys(manifest.pipeline);
      expect(stages.length).toBeGreaterThanOrEqual(8);
      expect(Object.keys(manifest.pipeline)).toContain('1');
    });
  });

  describe('Language Specifications', () => {
    it('loads TypeScript language spec', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      expect(spec).toBeDefined();
      expect(spec.language).toBe('typescript');
    });

    it('TypeScript spec has required symbol kinds', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      expect(spec.symbol_kinds).toBeDefined();
      expect(spec.symbol_kinds.function).toBeDefined();
      expect(spec.symbol_kinds.class).toBeDefined();
      expect(spec.symbol_kinds.interface).toBeDefined();
    });

    it('TypeScript spec has required feature domains', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      expect(spec.features).toBeDefined();
      expect(spec.features.retrieval).toBeDefined();
      expect(spec.features.cache).toBeDefined();
      expect(spec.features.database).toBeDefined();
    });

    it('TypeScript spec has valid extensions', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      expect(spec.extensions).toContain('.ts');
      expect(spec.extensions).toContain('.tsx');
      expect(spec.extensions).toContain('.js');
      expect(spec.extensions).toContain('.svelte');
    });

    it('TypeScript spec has valid exclusion patterns', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      expect(spec.exclude_paths).toContain('**/node_modules/**');
      expect(spec.exclude_paths).toContain('**/build/**');
      expect(spec.exclude_paths).toContain('**/dist/**');
    });

    it('TypeScript spec passes Zod validation', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const validated = LanguageSpecSchema.parse(spec);
      expect(validated).toEqual(spec);
    });
  });

  describe('Pipeline Consistency', () => {
    it('pipeline stages are in correct order', () => {
      const validation = loader.validatePipelineOrder();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('pipeline starts with source_identity', async () => {
      const manifest = await loader.loadManifest();
      expect(manifest.pipeline['1']).toBe('source_identity');
    });

    it('pipeline ends with ontology_tuple_builder or later', async () => {
      const manifest = await loader.loadManifest();
      const stages = Object.entries(manifest.pipeline)
        .map(([idx, name]) => ({ index: parseInt(idx), name }))
        .sort((a, b) => a.index - b.index);

      const last = stages[stages.length - 1];
      expect(last.name).toMatch(/(ontology|domain_model)/);
    });
  });

  describe('Extractor Configuration', () => {
    it('declares ast_grep_synthetic_fix extractor', async () => {
      const manifest = await loader.loadManifest();
      expect(manifest.extractors.ast_grep_synthetic_fix).toBeDefined();
      expect(manifest.extractors.ast_grep_synthetic_fix.version).toBe('ast-grep-synthetic-fix-v1');
    });

    it('ast_grep extractor supports TypeScript', async () => {
      const manifest = await loader.loadManifest();
      const ast = manifest.extractors.ast_grep_synthetic_fix;
      expect(ast.supported_languages).toContain('typescript');
      expect(ast.supported_languages).toContain('javascript');
    });

    it('lexical extractor is declared', async () => {
      const manifest = await loader.loadManifest();
      expect(manifest.extractors.lexical).toBeDefined();
      expect(manifest.extractors.lexical.version).toBe('lexical-v1');
    });

    it('langextract extractor is declared', async () => {
      const manifest = await loader.loadManifest();
      expect(manifest.extractors.langextract).toBeDefined();
      expect(manifest.extractors.langextract.version).toBe('langextract-v1');
    });
  });

  describe('Full Contract Validation', () => {
    it('OKF contract loads TypeScript language spec successfully', async () => {
      const result = await validateOKFContract(okfRoot);
      expect(result.manifest).toBeDefined();
      expect(result.languages.length).toBeGreaterThanOrEqual(1);
      // Note: contract may have non-blocking warnings about missing domain/symbol/tool specs,
      // but TypeScript must load successfully
      const tsSpec = result.languages.find((s) => s.language === 'typescript');
      expect(tsSpec).toBeDefined();
    });

    it('contract includes at least one language spec', async () => {
      const result = await validateOKFContract(okfRoot);
      expect(result.languages.length).toBeGreaterThanOrEqual(1);
    });

    it('contract manifest is valid structure', async () => {
      const result = await validateOKFContract(okfRoot);
      expect(result.manifest).toBeDefined();
      expect(result.manifest.version).toBe(1);
    });

    it('all declared language specs are loaded', async () => {
      const manifest = await loader.loadManifest();
      const result = await validateOKFContract(okfRoot);

      const declaredCount = manifest.registries.languages.schemas.length;
      const loadedCount = result.languages.length;

      expect(loadedCount).toBe(declaredCount);
    });
  });

  describe('Feature Domain Evidence', () => {
    it('retrieval domain has evidence sources', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const retrieval = spec.features.retrieval;

      expect(retrieval.path_terms).toBeDefined();
      expect(retrieval.imports).toBeDefined();
      expect(retrieval.symbols).toBeDefined();
    });

    it('retrieval path_terms include common keywords', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const retrieval = spec.features.retrieval;

      expect(retrieval.path_terms).toContain('retrieval');
      expect(retrieval.path_terms).toContain('search');
    });

    it('database domain has import evidence', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const database = spec.features.database;

      expect(database.imports).toContain('drizzle-orm');
      expect(database.imports).toContain('pg');
    });

    it('cache domain has evidence weight specified', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const cache = spec.features.cache;

      expect(cache.evidence_weight).toBe('high');
    });
  });

  describe('Symbol Kind Classification', () => {
    it('function symbols have highest weight', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const func = spec.symbol_kinds.function;
      const route = spec.symbol_kinds.route_handler;
      const schema = spec.symbol_kinds.schema;

      // function and route_handler should have highest weights
      expect(func.weight).toBe(1.0);
      expect(route.weight).toBe(1.0);
      expect(schema.weight).toBeGreaterThan(func.weight - 0.1);
    });

    it('class symbols are high weight', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const cls = spec.symbol_kinds.class;

      expect(cls.weight).toBeGreaterThan(0.8);
      expect(cls.weight).toBeLessThanOrEqual(1.0);
    });

    it('interface symbols have medium weight', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const iface = spec.symbol_kinds.interface;

      expect(iface.weight).toBeGreaterThan(0.7);
      expect(iface.weight).toBeLessThan(0.9);
    });

    it('core AST-based symbols have AST labels defined', async () => {
      const spec = await loader.loadLanguageSpec('typescript');

      // Core AST symbols that should have ast_labels
      const astBasedSymbols = ['function', 'class', 'interface', 'type_alias'];

      for (const kind of astBasedSymbols) {
        const config = spec.symbol_kinds[kind];
        expect(config).toBeDefined();
        expect(config.ast_labels).toBeDefined();
        expect((config.ast_labels as string[]).length).toBeGreaterThan(0);
      }
    });

    it('detection-rule symbols have at least one detection mechanism', async () => {
      const spec = await loader.loadLanguageSpec('typescript');

      // Symbols that use detection rules instead of ast_labels
      const detectionSymbols = ['route_handler', 'schema', 'store', 'hook', 'layout', 'component', 'test'];

      for (const kind of detectionSymbols) {
        const config = spec.symbol_kinds[kind];
        expect(config).toBeDefined();

        // Should have at least one detection mechanism
        const hasMechanism =
          config.ast_labels ||
          config.evidence ||
          config.imports ||
          config.symbol_patterns ||
          config.path_patterns ||
          config.filename_patterns ||
          config.path_markers;

        expect(hasMechanism).toBeTruthy();
      }
    });
  });

  describe('Validation Gates', () => {
    it('TypeScript spec enforces symbol name length', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const val = spec.validation;

      expect(val.min_symbol_name_length).toBe(2);
      expect(val.max_symbol_name_length).toBe(128);
    });

    it('TypeScript spec requires source_ref and packet_key', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const val = spec.validation;

      expect(val.require_source_ref).toBe(true);
      expect(val.require_packet_key).toBe(true);
    });

    it('TypeScript spec excludes generated markers', async () => {
      const spec = await loader.loadLanguageSpec('typescript');
      const val = spec.validation;

      expect(val.exclude_generated_markers).toContain('.min.js');
      expect(val.exclude_generated_markers).toContain('.generated');
      expect(val.exclude_generated_markers).toContain('__generated__');
    });
  });
});
